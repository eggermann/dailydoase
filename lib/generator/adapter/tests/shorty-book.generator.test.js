import { afterEach, describe, expect, test } from '@jest/globals';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';

import {
  resolveRequestedDurationOption,
  restorePreviousMovieLastFrame,
} from '../shorty-book/generator.js';

const createTempDir = async () => fs.mkdtemp(path.join(os.tmpdir(), 'dailydoase-shorty-book-'));

describe('restorePreviousMovieLastFrame', () => {
  let tempDir = '';

  afterEach(async () => {
    if (tempDir) {
      await fs.remove(tempDir);
      tempDir = '';
    }
  });

  test('restores the newest last frame and its prompt from scene-loop summary', async () => {
    tempDir = await createTempDir();
    const partsDir = path.join(tempDir, 'parts');
    await fs.ensureDir(partsDir);

    const oldVideo = path.join(partsDir, '1710000000000-scene-01.mp4');
    const oldLastFrame = oldVideo.replace(/\.mp4$/i, '-last-frame.png');
    const latestVideo = path.join(partsDir, '1710000005000-scene-03.mp4');
    const latestLastFrame = latestVideo.replace(/\.mp4$/i, '-last-frame.png');

    await fs.writeFile(oldLastFrame, 'old-frame');
    await fs.writeFile(latestLastFrame, 'latest-frame');

    const now = Date.now();
    await fs.utimes(oldLastFrame, new Date(now - 10_000), new Date(now - 10_000));
    await fs.utimes(latestLastFrame, new Date(now), new Date(now));

    await fs.writeJson(path.join(tempDir, '1710000006000-scene-loop.json'), {
      clips: [
        { file: oldVideo, prompt: 'older ending prompt' },
        { file: latestVideo, prompt: 'latest ending prompt' },
      ],
    });

    const restoredFrame = await restorePreviousMovieLastFrame({ imageDir: tempDir });

    expect(restoredFrame).toEqual({
      image: { path: latestLastFrame },
      json: {
        metadata: {
          prompt: 'latest ending prompt',
        },
      },
    });
  });

  test('falls back to scene prompt artifacts when no scene-loop summary exists', async () => {
    tempDir = await createTempDir();
    const promptDir = path.join(tempDir, 'parts', 'scene-prompts');
    await fs.ensureDir(promptDir);

    const latestVideo = path.join(tempDir, 'parts', '1710000010000-scene-02.mp4');
    const latestLastFrame = latestVideo.replace(/\.mp4$/i, '-last-frame.png');
    await fs.writeFile(latestLastFrame, 'latest-frame');

    await fs.writeJson(path.join(promptDir, '02-scene-prompt.json'), {
      videoFile: latestVideo,
      prompt: 'prompt from scene artifact',
    });

    const restoredFrame = await restorePreviousMovieLastFrame({ imageDir: tempDir });

    expect(restoredFrame).toEqual({
      image: { path: latestLastFrame },
      json: {
        metadata: {
          prompt: 'prompt from scene artifact',
        },
      },
    });
  });

  test('returns null when no previous last frame exists', async () => {
    tempDir = await createTempDir();
    await fs.ensureDir(path.join(tempDir, 'parts'));

    await expect(
      restorePreviousMovieLastFrame({ imageDir: tempDir })
    ).resolves.toBeNull();
  });
});

describe('resolveRequestedDurationOption', () => {
  test('prefers the resolved duration function value over a larger fallback', async () => {
    await expect(
      resolveRequestedDurationOption(() => 1.5, 6.4)
    ).resolves.toBe(1.5);
  });

  test('falls back when the resolved value is missing or invalid', async () => {
    await expect(
      resolveRequestedDurationOption(undefined, 3.2)
    ).resolves.toBe(3.2);
  });
});
