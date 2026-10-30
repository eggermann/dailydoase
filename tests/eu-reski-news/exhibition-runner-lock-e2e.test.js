import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@jest/globals';
import { articleKey } from '../../eu-reski-news/scripts/news-eu-relevance.mjs';
import { offlineTestEnvironment } from './offline-test-environment.js';

const root = fileURLToPath(new URL('../..', import.meta.url));
const runner = join(root, 'eu-reski-news/scripts/exhibition-runner.mjs');
const scenes = join(root, 'tests/eu-reski-news/fixtures/exhibition-scene-sequence');

async function waitFor(predicate, label, timeout = 8000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`Timed out waiting for ${label}`);
}

function launch(args, env) {
  const child = spawn(process.execPath, [runner, ...args], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  child.stdout.on('data', (data) => { output += data; });
  child.stderr.on('data', (data) => { output += data; });
  const closed = new Promise((resolve) => child.on('close', (code, signal) => resolve({ code, signal })));
  return { child, closed, output: () => output };
}

async function stop(processInfo) {
  if (!processInfo || processInfo.child.exitCode !== null || processInfo.child.signalCode !== null) return;
  processInfo.child.kill('SIGTERM');
  let timeout;
  try {
    await Promise.race([processInfo.closed, new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('Runner did not stop')), 5000); })]);
  } catch (error) {
    processInfo.child.kill('SIGKILL');
    await processInfo.closed;
    throw error;
  } finally { clearTimeout(timeout); }
}

test('a duplicate runner fails immediately; scene workers resume after stop', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'reski-runner-lock-e2e-'));
  let first; let second; let third;
  try {
    const news = join(temp, 'news');
    const output = join(temp, 'output');
    const semantic = join(temp, 'semantic.json');
    const blocker = join(temp, 'block-network.cjs');
    await mkdir(news, { recursive: true });
    const article = { id: 'offline', title: 'Offline European story', text: 'A sufficiently detailed offline European news article for the test.', summary: 'Offline news.', image: 'https://mock.invalid/a.png', url: 'https://mock.invalid/a', source_country: 'EU', publish_date: new Date().toISOString().slice(0, 10) };
    await writeFile(join(news, 'all-test.json'), JSON.stringify({ date: article.publish_date, fetchedAt: new Date().toISOString(), news: [article] }));
    await writeFile(join(news, 'eu-relevance-test.json'), JSON.stringify({ sourceFile: 'all-test.json', articleCount: 1, completedCount: 1, failedCount: 0, unresolvedCount: 0, entries: { [articleKey(article)]: { euRelevance: 0.99 } } }));
    await writeFile(semantic, JSON.stringify({ provider: 'offline', capturedAt: '2026-10-28T12:00:00.000Z', words: [['EU', 'en']], entries: [{ id: 'eu', seed: ['EU', 'en'], item: { title: 'Europe' } }] }));
    await writeFile(blocker, "globalThis.fetch = async () => { throw new Error('Unexpected network access'); };\n");
    const args = ['--new-run', `--scene=${scenes}`, '--stop-after-iterations=2', '--prompt-only', '--no-first-last-glue', `--stream-file=${semantic}`];
    const env = offlineTestEnvironment({ NEWS_NEWS_DIR: news, NEWS_OUTPUT_DIR: output, NEWS_REFRESH_CHECK_MS: '100000', NEWS_CAMPAIGN_START_SPACING_MS: '100', OPENAI_API_KEY: 'offline-test', NODE_OPTIONS: `--require=${blocker}` });
    first = launch(args, env);
    await waitFor(() => (first.output().match(/^Run folder: /gm) || []).length === 2, `first workers: ${first.output()}`);
    const lock = join(output, '.exhibition-runner.lock');
    await access(lock);
    second = launch(args, env);
    const rejected = await second.closed;
    expect(rejected.code).not.toBe(0);
    expect(second.output()).toContain('already active');
    expect(second.output()).not.toContain('Starting 2 independent scene workers');
    await stop(first);
    const state = JSON.parse(await readFile(join(output, 'exhibition-state.json'), 'utf8'));
    const previousRuns = Object.values(state.sceneWorkers).map((worker) => worker.runDirectory).sort();
    const completedWorker = Object.values(state.sceneWorkers)[0];
    completedWorker.status = 'completed';
    const completedManifestPath = join(completedWorker.runDirectory, 'run.json');
    const completedManifest = JSON.parse(await readFile(completedManifestPath, 'utf8'));
    completedManifest.status = 'completed';
    await writeFile(completedManifestPath, JSON.stringify(completedManifest));
    await writeFile(join(output, 'exhibition-state.json'), JSON.stringify(state));
    third = launch(args.filter((arg) => arg !== '--new-run' && arg !== '--stop-after-iterations=2'), env);
    await waitFor(() => (third.output().match(/^Run folder: /gm) || []).length === 2, `resumed workers: ${third.output()}`);
    const resumedRuns = [...third.output().matchAll(/^Run folder: (.+)$/gm)].map((match) => match[1].trim()).sort();
    expect(resumedRuns).toEqual(previousRuns);
    await stop(third);
    await expect(access(lock)).rejects.toMatchObject({ code: 'ENOENT' });
  } finally {
    await stop(first);
    await stop(second);
    await stop(third);
    await rm(temp, { recursive: true, force: true });
  }
}, 20000);
