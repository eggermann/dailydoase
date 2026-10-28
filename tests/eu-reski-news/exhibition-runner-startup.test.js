import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from '@jest/globals';
import { articleKey } from '../../eu-reski-news/scripts/news-eu-relevance.mjs';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
const runnerPath = join(repoRoot, 'eu-reski-news/scripts/exhibition-runner.mjs');
const sceneDirectory = join(repoRoot, 'eu-reski-news/scenes');

async function waitForSettingsSnapshot(child, getOutput, timeoutMs = 10000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const output = getOutput();
    if (output.includes('Settings snapshot:')) return output;
    if (child.exitCode !== null) throw new Error(`Exhibition runner exited before settings snapshot.\n${output}`);
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 25));
  }
  child.kill('SIGTERM');
  throw new Error(`Timed out waiting for runner startup.\n${getOutput()}`);
}

async function waitForParallelWorkers(child, getOutput, timeoutMs = 10000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const output = getOutput();
    if ((output.match(/^Run folder: /gm) || []).length >= 2) return output;
    if (child.exitCode !== null) throw new Error(`Exhibition runner exited before both workers started.\n${output}`);
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 25));
  }
  child.kill('SIGTERM');
  throw new Error(`Timed out waiting for both scene workers.\n${getOutput()}`);
}

describe('Exhibition Runner startup', () => {
  test('starts independent workers and maps defaults and overrides through the real startup path', async () => {
    const temporaryRoot = await mkdtemp(join(tmpdir(), 'eu-reski-exhibition-startup-'));
    const newsDirectory = join(temporaryRoot, 'news');
    const outputDirectory = join(temporaryRoot, 'output');
    const semanticPath = join(temporaryRoot, 'semantic.json');
    const networkLogPath = join(temporaryRoot, 'unexpected-network.log');
    const networkBlockerPath = join(temporaryRoot, 'block-network.cjs');
    const article = {
      id: 'startup-story',
      title: 'A mock European story',
      text: 'Offline article fixture for testing exhibition startup and scene argument mapping.',
      summary: 'An offline startup fixture.',
      image: 'https://mock.invalid/article.png',
      url: 'https://mock.invalid/story',
      source_country: 'EU',
      publish_date: new Date().toISOString().slice(0, 10),
    };
    let child;
    let output = '';
    let errorOutput = '';
    try {
      await mkdir(newsDirectory, { recursive: true });
      await writeFile(join(newsDirectory, 'all-startup.json'), JSON.stringify({
        date: article.publish_date,
        fetchedAt: new Date().toISOString(),
        news: [article],
      }));
      await writeFile(join(newsDirectory, 'eu-relevance-startup.json'), JSON.stringify({
        sourceFile: 'all-startup.json',
        articleCount: 1,
        completedCount: 1,
        failedCount: 0,
        unresolvedCount: 0,
        entries: { [articleKey(article)]: { euRelevance: 0.99 } },
      }));
      await writeFile(semanticPath, JSON.stringify({
        provider: 'offline-test',
        capturedAt: '2026-10-28T12:00:00.000Z',
        words: [['EU', 'en']],
        entries: [{ id: 'offline-entry', seed: ['EU', 'en'], item: { title: 'Europe', summary: 'European cooperation.' } }],
      }));
      await writeFile(networkBlockerPath, [
        "const fs = require('node:fs');",
        'globalThis.fetch = async (input) => {',
        "  const url = typeof input === 'string' ? input : input.url;",
        '  fs.appendFileSync(process.env.TEST_NETWORK_LOG, `${url}\\n`);',
        '  throw new Error(`Network disabled in startup test: ${url}`);',
        '};',
      ].join('\n'));

      child = spawn(process.execPath, [
        runnerPath,
        `--scene=${sceneDirectory}`,
        '--generation-interval=1h',
        '--stop-after-iterations=1',
        '--prompt-only',
        '--no-first-last-glue',
        '--video-max-zoom=0.2',
        `--stream-file=${semanticPath}`,
      ], {
        cwd: repoRoot,
        env: {
          ...process.env,
          NEWS_NEWS_DIR: newsDirectory,
          NEWS_OUTPUT_DIR: outputDirectory,
          NEWS_REFRESH_CHECK_MS: '100000',
          OPENAI_API_KEY: 'offline-test-key',
          TEST_NETWORK_LOG: networkLogPath,
          NODE_OPTIONS: `--require=${networkBlockerPath}`,
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      child.stdout.on('data', (chunk) => { output += chunk.toString(); });
      child.stderr.on('data', (chunk) => { errorOutput += chunk.toString(); });

      await waitForSettingsSnapshot(child, () => `${output}\n${errorOutput}`);
      await waitForParallelWorkers(child, () => `${output}\n${errorOutput}`);

      const plan = JSON.parse(await readFile(join(outputDirectory, '.exhibition-iterator-plan.json'), 'utf8'));
      expect(plan).toMatchObject({
        scheduleEnabled: true,
        generationInterval: '1h',
        biasMode: 'on',
      });
      expect(plan.workers.map(({ name }) => name)).toEqual(['run-001-exhibition', 'run-005-prompt-path']);
      expect(plan.workers.map(({ ratePerHour }) => ratePerHour)).toEqual([10, 5]);
      expect(plan.workers.map(({ plan: workerPlan }) => workerPlan.intervalMs)).toEqual([360_000, 720_000]);
      expect(output.match(/^Run folder: /gm)).toHaveLength(2);
      expect(output).toContain('Starting 2 independent scene workers in parallel');
      const [auto, manual] = plan.workers.map(({ plan: workerPlan }) => workerPlan.iterators[0].arguments);
      const has = (args, value) => expect(args).toContain(value);

      has(auto, '--auto-mode');
      has(auto, '--story-model=gpt-4.1-mini');
      has(auto, '--no-preserve-cubist-video-style');
      has(auto, '--scene-count-mode=taktmuster');
      has(auto, '--scene-length-takt=4');
      has(auto, '--video-audio-direction=on');
      has(auto, '--article-order=global');
      has(manual, '--no-auto-mode');
      has(manual, '--story-model=gpt-4o-mini');
      has(manual, '--article-order=global');
      has(manual, '--preserve-cubist-video-style');
      has(manual, '--no-style-reference');
      has(manual, '--use-guernica-figure-reference');
      has(manual, '--article-image-reference');
      for (const args of [auto, manual]) {
        has(args, '--video-max-zoom=0.2');
        has(args, '--prompt-only');
        has(args, `--stream-file=${semanticPath}`);
        expect(args.filter((argument) => argument.startsWith('--video-max-zoom='))).toEqual(['--video-max-zoom=0.2']);
      }
      expect(output).toContain('Settings source:');
      expect(errorOutput).not.toContain('defaultsFromExhibitionSettings is not defined');
      await expect(access(networkLogPath)).rejects.toMatchObject({ code: 'ENOENT' });
    } finally {
      if (child && child.exitCode === null) {
        child.kill('SIGTERM');
        let timeoutId;
        await Promise.race([
          new Promise((resolveClose) => child.once('close', resolveClose)),
          new Promise((resolveTimeout) => { timeoutId = setTimeout(resolveTimeout, 3000); }),
        ]);
        clearTimeout(timeoutId);
      }
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  });
});
