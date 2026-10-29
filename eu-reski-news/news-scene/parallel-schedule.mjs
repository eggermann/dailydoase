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
