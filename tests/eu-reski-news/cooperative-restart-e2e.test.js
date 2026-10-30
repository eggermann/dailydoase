import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@jest/globals';
import { offlineTestEnvironment } from './offline-test-environment.js';

const root = fileURLToPath(new URL('../..', import.meta.url));

test('a scheduled worker stops at a safe boundary without consuming its next slot', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'reski-cooperative-stop-'));
  let child;
  let output = '';
  try {
    const planPath = join(temp, 'plan.json');
    const semanticPath = join(temp, 'semantic.json');
    const blockerPath = join(temp, 'block-network.cjs');
    await writeFile(planPath, JSON.stringify({ workerKey: 'test-worker', scenePath: 'offline', scheduleEnabled: true, generationInterval: '120s', intervalMs: 120000, biasMode: 'on', iterators: [{ name: 'test', arguments: [] }] }));
    await writeFile(semanticPath, JSON.stringify({ provider: 'offline', capturedAt: '2026-10-30T00:00:00.000Z', words: [['EU', 'en']], entries: [{ id: 'eu', seed: ['EU', 'en'], item: { title: 'Europe' } }] }));
    await writeFile(blockerPath, "globalThis.fetch = async () => { throw new Error('Unexpected network access'); };\n");
    child = spawn(process.execPath, [join(root, 'eu-reski-news/scripts/run-news-scene-image-iteration.mjs'), '--iterations=0', '--prompt-only', '--scene-count-mode=fixed', '--scenes=1', `--iterator-plan=${planPath}`, `--stream-file=${semanticPath}`, `--output-dir=${temp}`], {
      cwd: root,
      env: offlineTestEnvironment({ OPENAI_API_KEY: 'offline-test', EXHIBITION_COOPERATIVE_RESTART: '1', NODE_OPTIONS: `--require=${blockerPath}` }),
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    });
    child.stdout.on('data', (data) => { output += data; });
    child.stderr.on('data', (data) => { output += data; });
    let ready = false;
    child.on('message', (message) => { if (message?.type === 'cooperative-restart-ready') ready = true; });
    const deadline = Date.now() + 10000;
    let runDirectory;
    let scheduled;
    while (Date.now() < deadline) {
      runDirectory = /^Run folder: (.+)$/m.exec(output)?.[1];
      scheduled = runDirectory ? await readFile(join(runDirectory, 'run.json'), 'utf8').then(JSON.parse, () => null) : null;
      if (ready && scheduled?.sceneSchedule?.lastStartAtMs) break;
      if (child.exitCode !== null) throw new Error(`Worker exited early: ${output}`);
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    if (!ready || !scheduled?.sceneSchedule?.lastStartAtMs) throw new Error(`Worker did not enter its scheduled wait: ${output}`);
    child.kill('SIGUSR2');
    const exit = await new Promise((resolve) => child.once('close', (code, signal) => resolve({ code, signal })));
    expect(exit).toEqual({ code: 0, signal: null });
    const saved = JSON.parse(await readFile(join(runDirectory, 'run.json'), 'utf8'));
    expect(saved.status).toBe('interrupted');
    expect(saved.iterations).toEqual([]);
    expect(saved.sceneSchedule.lastStartAtMs).toBeNull();
    expect(saved.sceneSchedule.nextStartAtMs).toBe(scheduled.sceneSchedule.lastStartAtMs);
  } finally {
    if (child && child.exitCode === null && child.signalCode === null) {
      child.kill('SIGTERM');
      await new Promise((resolve) => child.once('close', resolve));
    }
    await rm(temp, { recursive: true, force: true });
  }
}, 20000);
