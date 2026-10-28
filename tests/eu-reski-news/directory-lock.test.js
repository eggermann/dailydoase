import { access, mkdir, mkdtemp, readFile, rm, utimes, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, test } from '@jest/globals';

const lockModule = fileURLToPath(new URL('../../eu-reski-news/news-scene/directory-lock.mjs', import.meta.url));
let temporaryRoot;

async function waitForFile(path, child, timeoutMs = 5000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try { await access(path); return; } catch {}
    if (child.exitCode !== null) throw new Error(`Child exited before creating ${path}`);
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 10));
  }
  throw new Error(`Timed out waiting for ${path}`);
}

function startLockProcess(lockPath, program, environment = {}) {
  return spawn(process.execPath, ['--input-type=module', '-e', program], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, LOCK_MODULE: lockModule, LOCK_PATH: lockPath, ...environment },
  });
}

function childResult(child) {
  let output = '';
  child.stdout.on('data', (chunk) => { output += chunk.toString(); });
  child.stderr.on('data', (chunk) => { output += chunk.toString(); });
  return new Promise((resolveResult) => child.once('close', (code, signal) => resolveResult({ code, signal, output })));
}

afterEach(async () => {
  if (temporaryRoot) await rm(temporaryRoot, { recursive: true, force: true });
  temporaryRoot = null;
});

describe('cross-process directory locks', () => {
  test('serializes competing processes even while the first owner initializes slowly', async () => {
    temporaryRoot = await mkdtemp(join(tmpdir(), 'eu-reski-lock-init-'));
    const lockPath = join(temporaryRoot, 'article-progress.lock');
    const activePath = join(temporaryRoot, 'inside-critical-section');
    const eventPath = join(temporaryRoot, 'events.log');
    const program = `
      const { withDirectoryLock } = await import(process.env.LOCK_MODULE);
      import { appendFile, open, unlink } from 'node:fs/promises';
      const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      await withDirectoryLock(process.env.LOCK_PATH, async () => {
        let active;
        try { active = await open(process.env.ACTIVE_PATH, 'wx'); }
        catch { await appendFile(process.env.EVENT_PATH, 'OVERLAP\\n'); }
        await appendFile(process.env.EVENT_PATH, 'ENTER\\n');
        await pause(120);
        await appendFile(process.env.EVENT_PATH, 'EXIT\\n');
        await active?.close();
        await unlink(process.env.ACTIVE_PATH).catch(() => {});
      }, {
        retryMs: 5,
        initializationTimeoutMs: 1000,
        beforeOwnerWrite: () => pause(Number(process.env.OWNER_DELAY || 0)),
      });
    `;
    const first = startLockProcess(lockPath, program, {
      ACTIVE_PATH: activePath, EVENT_PATH: eventPath, OWNER_DELAY: '250',
    });
    const firstDone = childResult(first);
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 30));
    const second = startLockProcess(lockPath, program, { ACTIVE_PATH: activePath, EVENT_PATH: eventPath });
    const secondDone = childResult(second);

    const results = await Promise.all([firstDone, secondDone]);
    expect(results.map(({ code }) => code)).toEqual([0, 0]);
    const events = await readFile(eventPath, 'utf8');
    expect(events).not.toContain('OVERLAP');
    expect(events.match(/ENTER/g)).toHaveLength(2);
    expect(events.match(/EXIT/g)).toHaveLength(2);
  });

  test('recovers after owner process death, reclaims a stale PID identity and supports repeat starts', async () => {
    temporaryRoot = await mkdtemp(join(tmpdir(), 'eu-reski-lock-recovery-'));
    const lockPath = join(temporaryRoot, 'runner.lock');
    const readyPath = join(temporaryRoot, 'owner-ready');
    const activeProgram = `
      const { withDirectoryLock } = await import(process.env.LOCK_MODULE);
      import { writeFile } from 'node:fs/promises';
      await withDirectoryLock(process.env.LOCK_PATH, async () => {
        await writeFile(process.env.READY_PATH, 'ready');
        await new Promise(() => {});
      });
    `;
    const killedOwner = startLockProcess(lockPath, activeProgram, { READY_PATH: readyPath });
    const killedOwnerDone = childResult(killedOwner);
    await waitForFile(readyPath, killedOwner);
    killedOwner.kill('SIGKILL');
    await killedOwnerDone;

    const recovered = startLockProcess(lockPath, `
      const { withDirectoryLock } = await import(process.env.LOCK_MODULE);
      await withDirectoryLock(process.env.LOCK_PATH, async () => {});
    `);
    const recoveredResult = await childResult(recovered);
    expect(recoveredResult.code).toBe(0);

    await mkdir(lockPath);
    await writeFile(join(lockPath, '.owner-stale.json'), JSON.stringify({
      token: 'stale', processId: process.pid, processStart: 'a different process start',
    }));
    const reusedPidRecovery = startLockProcess(lockPath, `
      const { withDirectoryLock } = await import(process.env.LOCK_MODULE);
      await withDirectoryLock(process.env.LOCK_PATH, async () => {});
    `);
    const reusedPidResult = await childResult(reusedPidRecovery);
    if (reusedPidResult.code !== 0) throw new Error(reusedPidResult.output);

    const legacyLockPath = join(temporaryRoot, 'legacy.lock');
    await writeFile(legacyLockPath, `${process.pid}\n`);
    const oldLockDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
    await utimes(legacyLockPath, oldLockDate, oldLockDate);
    const legacyPidReuseRecovery = startLockProcess(legacyLockPath, `
      const { withDirectoryLock } = await import(process.env.LOCK_MODULE);
      await withDirectoryLock(process.env.LOCK_PATH, async () => {});
    `);
    const legacyPidReuseResult = await childResult(legacyPidReuseRecovery);
    if (legacyPidReuseResult.code !== 0) throw new Error(legacyPidReuseResult.output);

    for (let index = 0; index < 3; index += 1) {
      const repeated = startLockProcess(lockPath, `
        const { withDirectoryLock } = await import(process.env.LOCK_MODULE);
        await withDirectoryLock(process.env.LOCK_PATH, async () => {});
      `);
      expect((await childResult(repeated)).code).toBe(0);
    }
    await expect(access(lockPath)).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
