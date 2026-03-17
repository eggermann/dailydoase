import { afterEach, describe, expect, jest, test } from '@jest/globals';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';

import {
  resolveRequestedDurationOption,
  restorePreviousMovieLastFrame,
} from '../shorty-book/generator.js';
import Generator from '../shorty-book/generator.js';

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

describe('Generator.resolveStartFrame', () => {
  let tempDir = '';

  afterEach(async () => {
    if (tempDir) {
      await fs.remove(tempDir);
      tempDir = '';
    }
  });

  test('uses the opening image instead of the previous last frame when chaining is disabled', async () => {
    tempDir = await createTempDir();
    const openingImagePath = path.join(tempDir, 'opening-camera.jpg');
    await fs.writeFile(openingImagePath, 'fresh-camera-shot');

    const previousLastFrame = {
      image: { path: path.join(tempDir, 'previous-last-frame.png') },
      json: { metadata: { prompt: 'previous ending' } },
    };

    const context = {
      lastEndFRame: previousLastFrame,
      generateImage: jest.fn(),
    };

    const startFrame = await Generator.prototype.resolveStartFrame.call(
      context,
      [],
      {},
      {
        imagePath: openingImagePath,
        promptSource: 'fresh webcam opening shot',
      },
      {
        index: 1,
        total: 6,
        isFirst: true,
        isLast: false,
      },
      { allowLastEndFrame: false }
    );

    expect(startFrame).toEqual({
      image: { path: openingImagePath },
      json: {
        metadata: {
          prompt: 'fresh webcam opening shot',
        },
      },
    });
    expect(context.generateImage).not.toHaveBeenCalled();
  });
});

describe('Generator.resolveChainedStartFrameFromLastEnd', () => {
  test('returns the raw last frame when drift correction is disabled', async () => {
    const lastFrame = {
      image: { path: '/tmp/raw-last-frame.png' },
      json: { metadata: { prompt: 'previous shot prompt' } },
    };
    const context = {
      config: { driftCorrection: { enabled: false } },
      lastEndFRame: lastFrame,
      getDriftCorrectionConfig: Generator.prototype.getDriftCorrectionConfig,
      correctLastFrameForNextScene: jest.fn(),
    };

    const startFrame = await Generator.prototype.resolveChainedStartFrameFromLastEnd.call(
      context,
      {
        nextScenePlanEntry: { title: 'Next scene', storyBeat: 'He looks up.' },
        nextSceneContext: { index: 2, total: 6, isFirst: false, isLast: false },
      }
    );

    expect(startFrame).toBe(lastFrame);
    expect(context.correctLastFrameForNextScene).not.toHaveBeenCalled();
  });

  test('uses the corrected image as the next start frame when drift correction is enabled', async () => {
    const correctedImagePath = '/tmp/corrected-last-frame.png';
    const context = {
      config: {
        driftCorrection: {
          enabled: true,
          model: {
            model: 'black-forest-labs/FLUX.1-Kontext-dev',
            hfProvider: 'fal-ai',
            num_inference_steps: 28,
            guidance_scale: 2.5,
            negative_prompt: 'different person',
            seed: 0,
          },
        },
      },
      lastEndFRame: {
        image: { path: '/tmp/raw-last-frame.png' },
        json: { metadata: { prompt: 'previous shot prompt' } },
      },
      imageDir: '/tmp/dailydoase-shorty-book',
      driftCorrectionModel: {
        prompt: jest.fn().mockResolvedValue({
          image: { path: correctedImagePath },
          json: {},
        }),
      },
      getDriftCorrectionConfig: Generator.prototype.getDriftCorrectionConfig,
      buildDriftCorrectionPrompt: Generator.prototype.buildDriftCorrectionPrompt,
      resolveDriftCorrectionReferenceImage: Generator.prototype.resolveDriftCorrectionReferenceImage,
      correctLastFrameForNextScene: Generator.prototype.correctLastFrameForNextScene,
    };

    const startFrame = await Generator.prototype.resolveChainedStartFrameFromLastEnd.call(
      context,
      {
        nextScenePlanEntry: { title: 'Next scene', storyBeat: 'He looks up.' },
        nextSceneContext: { index: 2, total: 6, isFirst: false, isLast: false },
      }
    );

    expect(context.driftCorrectionModel.prompt).toHaveBeenCalled();
    expect(startFrame).toMatchObject({
      image: { path: correctedImagePath },
      json: {
        metadata: {
          driftCorrection: true,
          sourceLastFramePath: '/tmp/raw-last-frame.png',
          driftCorrectionReferencePath: '/tmp/raw-last-frame.png',
          driftCorrectionReferenceSource: 'lastFrame',
        },
      },
    });
  });

  test('can use a fresh camera shot as the FLUX Kontext reference image', async () => {
    const correctedImagePath = '/tmp/corrected-from-camera-reference.png';
    const freshCameraShotPath = '/tmp/fresh-camera-shot.jpg';
    const captureFn = jest.fn().mockResolvedValue(freshCameraShotPath);
    const context = {
      config: {
        driftCorrection: {
          enabled: true,
          referenceImage: {
            captureFn,
            promptSource: '',
          },
          model: {
            model: 'black-forest-labs/FLUX.1-Kontext-dev',
            hfProvider: 'fal-ai',
            num_inference_steps: 28,
            guidance_scale: 2.5,
            negative_prompt: 'different person',
            seed: 0,
          },
        },
      },
      imageDir: '/tmp/dailydoase-shorty-book',
      lastEndFRame: {
        image: { path: '/tmp/raw-last-frame.png' },
        json: { metadata: { prompt: 'previous shot prompt' } },
      },
      driftCorrectionModel: {
        prompt: jest.fn().mockResolvedValue({
          image: { path: correctedImagePath },
          json: {},
        }),
      },
      getDriftCorrectionConfig: Generator.prototype.getDriftCorrectionConfig,
      buildDriftCorrectionPrompt: Generator.prototype.buildDriftCorrectionPrompt,
      resolveDriftCorrectionReferenceImage: Generator.prototype.resolveDriftCorrectionReferenceImage,
      correctLastFrameForNextScene: Generator.prototype.correctLastFrameForNextScene,
    };

    const startFrame = await Generator.prototype.resolveChainedStartFrameFromLastEnd.call(
      context,
      {
        nextScenePlanEntry: { title: 'Next scene', storyBeat: 'He looks up.' },
        nextSceneContext: { index: 2, total: 6, isFirst: false, isLast: false },
      }
    );

    expect(captureFn).toHaveBeenCalledTimes(1);
    expect(context.driftCorrectionModel.prompt).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        imagePath: freshCameraShotPath,
      })
    );
    expect(startFrame).toMatchObject({
      image: { path: correctedImagePath },
      json: {
        metadata: {
          sourceLastFramePath: '/tmp/raw-last-frame.png',
          driftCorrectionReferencePath: freshCameraShotPath,
          driftCorrectionReferenceSource: 'cameraShot',
        },
      },
    });
  });
});
