import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from '@jest/globals';
import { autoDirectorPromptVersion } from '../../eu-reski-news/news-scene/auto-director.mjs';
import { getReadyIterations } from '../../eu-reski-news/news-scene/exhibition-readiness.mjs';
import { offlineTestEnvironment } from './offline-test-environment.js';

const assemblyScript = fileURLToPath(new URL('../../eu-reski-news/scripts/assemble-news-film.mjs', import.meta.url));

describe('single-scene Auto exhibition assembly', () => {
  test('assembles one Auto scene with existing-bridges mode and emits no glue boundary', async () => {
    const root = await mkdtemp(join(tmpdir(), 'eu-reski-single-assembly-'));
    const runDirectory = join(root, 'run');
    const glueDirectory = join(root, 'glue');
    const iterationDirectory = join(runDirectory, 'iteration-001');
    const mediaDirectory = join(iterationDirectory, 'media');
    const followingDirectory = join(runDirectory, 'iteration-002');
    const followingMediaDirectory = join(followingDirectory, 'media');
    const fakeFfmpeg = join(root, 'fake-ffmpeg.cjs');
    try {
      await mkdir(mediaDirectory, { recursive: true });
      await mkdir(followingMediaDirectory, { recursive: true });
      await mkdir(glueDirectory, { recursive: true });
      await writeFile(join(mediaDirectory, 'scene-1-video.mp4'), 'fixture media');
      await writeFile(join(iterationDirectory, 'record.json'), JSON.stringify({
        status: 'Abgeschlossen',
        autoMode: true,
        autoDecision: { promptVersion: autoDirectorPromptVersion },
        sceneCount: 1,
        plan: { scenes: [{ index: 1 }] },
      }));
      await writeFile(join(followingMediaDirectory, 'scene-1-video.mp4'), 'fixture media');
      await writeFile(join(followingMediaDirectory, 'scene-2-video.mp4'), 'fixture media');
      await writeFile(join(followingDirectory, 'record.json'), JSON.stringify({
        status: 'Abgeschlossen',
        sceneCount: 2,
        plan: { scenes: [{ index: 1 }, { index: 2 }] },
      }));
      await writeFile(join(runDirectory, 'run.json'), JSON.stringify({
        iterations: [
          { index: 1, directory: 'iteration-001' },
          { index: 2, directory: 'iteration-002' },
        ],
      }));
      await writeFile(fakeFfmpeg, [
        '#!/usr/bin/env node',
        "const fs = require('node:fs');",
        "const args = process.argv.slice(2);",
        "const calls = fs.existsSync(process.env.FAKE_FFMPEG_ARGS) ? JSON.parse(fs.readFileSync(process.env.FAKE_FFMPEG_ARGS, 'utf8')) : [];",
        "calls.push(args); fs.writeFileSync(process.env.FAKE_FFMPEG_ARGS, JSON.stringify(calls));",
        "fs.writeFileSync(args.at(-1), 'assembled fixture');",
      ].join('\n'));
      await chmod(fakeFfmpeg, 0o755);

      const result = spawnSync(process.execPath, [
        assemblyScript,
        `--run-dir=${runDirectory}`,
        `--scene-glue-dir=${glueDirectory}`,
        `--limit=${(await getReadyIterations(runDirectory)).length}`,
        '--existing-bridges-only',
        '--no-generate-title-cards',
      ], {
        encoding: 'utf8',
        env: offlineTestEnvironment({ FFMPEG_BIN: fakeFfmpeg, FAKE_FFMPEG_ARGS: join(root, 'ffmpeg-args.json') }),
      });
      expect(await getReadyIterations(runDirectory)).toHaveLength(2);
      expect(result.status).toBe(0);
      const manifest = await readFile(join(glueDirectory, 'film-order.txt'), 'utf8');
      expect(manifest).toContain('iteration-001/media/scene-1-video.mp4');
      expect(manifest).not.toContain('scene-001-to-');
      expect(JSON.parse(await readFile(join(root, 'ffmpeg-args.json'), 'utf8')).flat())
        .toContain(join(glueDirectory, 'eu-reski-first-2-glued.mp4'));
      expect(await readFile(join(glueDirectory, 'eu-reski-first-2-glued.mp4'), 'utf8')).toBe('assembled fixture');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
