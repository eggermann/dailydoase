import { readFile, mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { describe, expect, test } from '@jest/globals';
import { offlineTestEnvironment } from './offline-test-environment.js';

const root = fileURLToPath(new URL('../..', import.meta.url));
const runner = join(root, 'eu-reski-news/scripts/exhibition-runner.mjs');
const generator = join(root, 'eu-reski-news/scripts/run-news-scene-image-iteration.mjs');
const source = await readFile(runner, 'utf8');
function extract(start, end) { return source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start))); }

describe('parallel runner corrections', () => {
  test('disabled schedule starts the real generator without constructing a timed schedule', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'reski-off-'));
    try {
      const plan = join(dir, 'plan.json');
      const semantic = join(dir, 'semantic.json');
      const news = join(dir, 'news');
      await mkdir(news);
      await writeFile(plan, JSON.stringify({ workerKey: 'a', scheduleEnabled: false, intervalMs: null, biasMode: null, iterators: [{ name: 'a', arguments: [] }] }));
      await writeFile(semantic, JSON.stringify({ provider: 'offline', entries: [{ id: 'a', seed: ['x', 'en'], item: { title: 'x' } }] }));
      const result = spawnSync(process.execPath, [generator, `--iterator-plan=${plan}`, `--output-dir=${dir}`, `--news-dir=${news}`, `--stream-file=${semantic}`, '--prompt-only', '--iterations=1'], { encoding: 'utf8', timeout: 10000, env: offlineTestEnvironment({ OPENAI_API_KEY: 'offline' }) });
      expect(result.stdout).toContain('Run folder:');
      expect(result.stderr).not.toContain('Worker schedule requires');
      const runPath = result.stdout.match(/Run folder: (.+)/)[1];
      const manifest = JSON.parse(await readFile(join(runPath, 'run.json'), 'utf8'));
      expect(manifest.sceneSchedule.enabled).toBe(false);
    } finally { await rm(dir, { recursive: true, force: true }); }
  });

  test('restores assembled film progress into persisted module state', async () => {
    let saved;
    const context = { stopping: false, mergeRunning: false, mergeCheckMs: 1, mergeRetryMs: 1, state: { sceneWorkers: { a: { runDirectory: '/run' } } }, getReadyIterations: async () => [{ directory: 'iteration-001' }], readState: async () => ({ sceneWorkers: { a: { runDirectory: '/run' } } }), hasCompleteFilmSet: async () => true, saveState: async () => { saved = structuredClone(context.state); }, delayOrStop: async () => { context.stopping = true; }, console };
    vm.createContext(context);
    vm.runInContext(`${extract('async function runMergeLoop(', '\nlet stopping =')}\nthis.run = runMergeLoop;`, context);
    await context.run('/run', {}, false, 'a');
    expect(saved.sceneWorkers.a.gluedThroughIteration).toBe(1);
  });

  function workerContext(startRunner, readJson, delayOrStop) {
    const context = { stopping: false, state: { sceneWorkers: {} }, children: new Set(), glueEnabled: false, process: { env: {} }, positiveInteger: (v, f) => Number(v || f), runRefreshLoop: async () => {}, saveState: async () => {}, readJson, join, startRunner, delayOrStop, wakeForStop: () => {}, log: () => {}, console, createHash: () => ({ update: () => ({ digest: () => 'hash' }) }), saveJson: async () => { throw new Error('unexpected failure write'); }, refreshCheckMs: 1 };
    vm.createContext(context);
    vm.runInContext(`${extract('async function runParallelSceneWorkers(', '\nasync function exhibitionMain(')}\nthis.run = runParallelSceneWorkers;`, context);
    return context;
  }

  test('pending media remains pending beyond five polling cycles', async () => {
    let calls = 0;
    let context;
    context = workerContext(() => ({ closed: Promise.resolve({ code: 0 }) }), async () => ({ status: 'pending_media', pendingMedia: [{ taskUUID: 'original' }] }), async () => { if (++calls === 7) context.stopping = true; });
    context.state.sceneWorkers.a = { runDirectory: '/run' };
    await context.run([{ key: 'a', name: 'a', savedRunDirectory: '/run', arguments: [], plan: {} }], 1);
    expect(calls).toBe(7);
    expect(context.state.sceneWorkers.a.status).toBe('pending_media');
  });

  test('worker rejection terminates siblings and waits for their settlement', async () => {
    let release;
    let killed = false;
    let siblingSettled = false;
    let context;
    const sibling = new Promise((resolve) => { release = resolve; }).then(() => { siblingSettled = true; return { code: null, signal: 'SIGTERM' }; });
    context = workerContext((args) => args[0] === 'bad' ? { closed: Promise.resolve({ code: 1 }) } : { closed: sibling }, async (path) => path.includes('bad') ? null : { status: 'running' }, async () => {});
    context.children.add({ kill: () => { killed = true; release(); } });
    context.state.sceneWorkers = { bad: { runDirectory: '/bad' }, good: { runDirectory: '/good' } };
    await expect(context.run([{ key: 'bad', name: 'bad', savedRunDirectory: '/bad', arguments: ['bad'], plan: {} }, { key: 'good', name: 'good', savedRunDirectory: '/good', arguments: ['good'], plan: {} }], 1)).rejects.toThrow(/unknown saved Run status/);
    expect(killed).toBe(true);
    expect(siblingSettled).toBe(true);
    expect(context.stopping).toBe(true);
  });
});
