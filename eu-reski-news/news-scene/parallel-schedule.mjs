import { randomUUID } from 'node:crypto';
import { readFile, rename, writeFile } from 'node:fs/promises';
import { withDirectoryLock } from './directory-lock.mjs';

export async function claimCampaignStart(path, intervalMs, now = Date.now()) {
  if (!Number.isSafeInteger(now) || !Number.isSafeInteger(intervalMs) || intervalMs < 1) {
    throw new Error('Campaign start spacing requires integer timestamps and a positive interval');
  }
  return withDirectoryLock(`${path}.lock`, async () => {
    let previous;
    try { previous = JSON.parse(await readFile(path, 'utf8')); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (previous && !Number.isSafeInteger(previous.lastStartAtMs)) throw new Error('Invalid campaign start timestamp');
    const next = previous ? previous.lastStartAtMs + intervalMs : now;
    if (next > now) return { claimed: false, waitMs: next - now };
    const temporary = `${path}.${randomUUID()}.tmp`;
    await writeFile(temporary, `${JSON.stringify({ lastStartAtMs: now })}\n`);
    await rename(temporary, path);
    return { claimed: true, startAtMs: now };
  });
}

export function pacedWorkerSchedule(schedule, now, intervalMs) {
  const last = Number.isSafeInteger(schedule?.lastStartAtMs) && schedule.lastStartAtMs <= now ? schedule.lastStartAtMs : null;
  return { ...schedule, intervalMs, lastStartAtMs: last, nextStartAtMs: last === null ? now : Math.max(now, last + intervalMs) };
}

export function createInitialWorkerSchedule(now, intervalMs, biasMode) {
  if (!Number.isSafeInteger(now) || !Number.isSafeInteger(intervalMs) || intervalMs < 1) {
    throw new Error('Worker schedule requires integer timestamps and a positive interval');
  }
  if (!['on', 'off'].includes(biasMode)) throw new Error('Worker schedule bias must be "on" or "off"');
  return {
    lastStartAtMs: null,
    nextStartAtMs: now + (biasMode === 'on' ? Math.ceil(intervalMs / 2) : 0),
  };
}

export function recoverWorkerSchedule(schedule, now, intervalMs) {
  if (!Number.isSafeInteger(now) || !Number.isSafeInteger(intervalMs) || intervalMs < 1) {
    throw new Error('Worker schedule recovery requires integer timestamps and a positive interval');
  }
  if (!Number.isSafeInteger(schedule?.nextStartAtMs)) {
    return { ...schedule, lastStartAtMs: null, nextStartAtMs: now + intervalMs };
  }
  if (schedule.nextStartAtMs <= now) {
    return { ...schedule, nextStartAtMs: now + intervalMs };
  }
  return { ...schedule };
}

export function advanceWorkerSchedule(schedule, now, intervalMs) {
  if (!Number.isSafeInteger(now) || !Number.isSafeInteger(intervalMs) || intervalMs < 1) {
    throw new Error('Worker schedule advancement requires integer timestamps and a positive interval');
  }
  const startAtMs = Math.max(Number(schedule?.nextStartAtMs) || now, now);
  return {
    startAtMs,
    schedule: { ...schedule, lastStartAtMs: startAtMs, nextStartAtMs: startAtMs + intervalMs },
  };
}
