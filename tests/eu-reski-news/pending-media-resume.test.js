import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from '@jest/globals';
import { offlineTestEnvironment } from './offline-test-environment.js';

const runnerPath = fileURLToPath(new URL('../../eu-reski-news/scripts/run-news-scene-image-iteration.mjs', import.meta.url));

describe('parallel worker pending media resume', () => {
  test('polls same saved task across restart, creates no new iteration or article reservation', async () => {
    const root = await mkdtemp(join(tmpdir(), 'eu-reski-pending-media-'));
    const outputDirectory = join(root, 'output');
    const runDirectory = join(outputDirectory, 'run-001');
    const iterationDirectory = join(runDirectory, 'iteration-001');
    const mediaDirectory = join(iterationDirectory, 'media');
    const semanticSequence = join(root, 'semantic-sequence.json');
    const pollScript = join(root, 'fake-video-poll.mjs');
    const pollLog = join(root, 'poll-log.json');
    const taskId = 'provider-task-original-123';
    try {
      await mkdir(mediaDirectory, { recursive: true });
      await writeFile(semanticSequence, JSON.stringify([{ provider: 'offline', capturedAt: '2026-10-28T12:00:00.000Z', words: [], entries: [{ id: 'saved', seed: ['offline', 'test'], item: { title: 'saved' } }] }]));
      const savedSemantic = {
        provider: 'offline',
        capturedAt: '2026-10-28T12:00:00.000Z',
        words: [],
        entries: [{ id: 'saved', seed: ['offline', 'test'], item: { title: 'saved' } }],
      };
      await writeFile(join(iterationDirectory, 'record.json'), JSON.stringify({
        status: 'Abgeschlossen',
        autoMode: true,
        sceneCount: 1,
        autoDecision: { promptVersion: 'eu-reski-auto-director-v2', sceneCount: 1, sceneCountReason: 'One scene for fixture.' },
        semantic: savedSemantic,
        filmPlan: { scenePlan: [{ index: 1, videoMode: 'image_to_video', videoTaskUUID: taskId }] },
        videoResults: [{ status: 'processing', taskUUID: taskId }],
      }));
      await writeFile(join(runDirectory, 'run.json'), JSON.stringify({
        startedAt: '2026-10-28T11:00:00.000Z',
        iterationLimit: 1,
        status: 'pending_media',
        iterations: [{ index: 1, directory: 'iteration-001', report: 'iteration-001/index.html' }],
        articleProgress: null,
        runOptions: {
          'auto-mode': true,
          'article-order': 'global',
          'videos-after-each-iteration': true,
          'prompt-only': true,
          'stream-sequence-file': semanticSequence,
          'no-style-reference': true,
          'no-guernica-figure-reference': true,
        },
      }));
      await writeFile(pollScript, [
        "import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';",
        "import { join } from 'node:path';",
        'const value = (prefix) => process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length);',
        'const run = value("--run="); const iteration = value("--iteration=");',
        'const recordPath = join(run, iteration, "record.json");',
        'const record = JSON.parse(await readFile(recordPath, "utf8"));',
        'const taskUUID = record.videoResults[0].taskUUID;',
        'await appendFile(process.env.TEST_POLL_LOG, `${taskUUID}\\n`);',
        'if (Number((await readFile(process.env.TEST_POLL_COUNT, "utf8").catch(() => "0"))) > 0) {',
        '  await mkdir(join(run, iteration, "media"), { recursive: true });',
        '  await writeFile(join(run, iteration, "media", "scene-1-video.mp4"), "offline-video");',
        '}',
        'const count = Number(await readFile(process.env.TEST_POLL_COUNT, "utf8").catch(() => "0")) + 1;',
        'await writeFile(process.env.TEST_POLL_COUNT, String(count));',
      ].join('\n'));

      const runResume = () => spawnSync(process.execPath, [
        runnerPath,
        `--resume-run=${runDirectory}`,
        `--output-dir=${outputDirectory}`,
        '--iterations=1',
      ], {
        encoding: 'utf8',
        timeout: 15000,
        env: offlineTestEnvironment({
          OPENAI_API_KEY: 'offline-test-key',
          NEWS_TEST_VIDEO_POLL_SCRIPT: pollScript,
          TEST_POLL_LOG: pollLog,
          TEST_POLL_COUNT: join(root, 'poll-count'),
        }),
      });

      const first = runResume();
      if (first.status !== 0) throw new Error(`${first.stdout}\n${first.stderr}`);
      expect(first.status).toBe(0);
      let manifest = JSON.parse(await readFile(join(runDirectory, 'run.json'), 'utf8'));
      expect(manifest.status).toBe('pending_media');
      expect(manifest.iterations).toHaveLength(1);
      expect(await readFile(pollLog, 'utf8')).toBe(`${taskId}\n`);

      const second = runResume();
      if (second.status !== 0) throw new Error(`${second.stdout}\n${second.stderr}`);
      expect(second.status).toBe(0);
      manifest = JSON.parse(await readFile(join(runDirectory, 'run.json'), 'utf8'));
      expect(manifest.status).toBe('completed');
      expect(manifest.iterations).toHaveLength(1);
      expect(await readFile(pollLog, 'utf8')).toBe(`${taskId}\n${taskId}\n`);
      expect(JSON.parse(await readFile(join(iterationDirectory, 'record.json'), 'utf8')).videoResults[0].taskUUID).toBe(taskId);
      expect(await readFile(join(mediaDirectory, 'scene-1-video.mp4'), 'utf8')).toBe('offline-video');
      await expect(readFile(join(outputDirectory, 'global-article-progress.json'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
      await expect(readFile(join(iterationDirectory, 'auto-director-request.json'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });

      await rm(join(mediaDirectory, 'scene-1-video.mp4'));
      await writeFile(pollScript, [
        "import { readFile, writeFile } from 'node:fs/promises';",
        "import { join } from 'node:path';",
        'const value = (prefix) => process.argv.find((argument) => argument.startsWith(prefix)).slice(prefix.length);',
        'const path = join(value("--run="), value("--iteration="), "record.json");',
        'const record = JSON.parse(await readFile(path, "utf8"));',
        'record.videoResults[0].errorCode = "VIDEO_PROVIDER_TERMINAL_ERROR";',
        'await writeFile(path, JSON.stringify(record));',
      ].join('\n'));
      const blocker = join(root, 'block-network.cjs');
      await writeFile(blocker, "globalThis.fetch = async () => { throw new Error('Unexpected network access'); };\n");
      const terminal = spawnSync(process.execPath, [runnerPath, `--resume-run=${runDirectory}`, `--output-dir=${outputDirectory}`, `--news-dir=${root}`, '--iterations=0'], {
        encoding: 'utf8', timeout: 15000,
        env: offlineTestEnvironment({ OPENAI_API_KEY: 'offline-test-key', NEWS_TEST_VIDEO_POLL_SCRIPT: pollScript, NODE_OPTIONS: `--require=${blocker}` }),
      });
      expect(terminal.stdout).toContain('permanently failed; keeping its files and continuing');
      expect(JSON.parse(await readFile(join(iterationDirectory, 'record.json'), 'utf8')).exhibitionAbandoned)
        .toMatchObject({ status: 'aborted', taskUUID: taskId });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
