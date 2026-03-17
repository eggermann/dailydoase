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
          contextBuffer: {
            enabled: false,
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
      contextScreenshotBuffer: [],
      getDriftCorrectionConfig: Generator.prototype.getDriftCorrectionConfig,
      getContextBufferConfig: Generator.prototype.getContextBufferConfig,
      trimContextScreenshotBuffer: Generator.prototype.trimContextScreenshotBuffer,
      pushContextScreenshotPath: Generator.prototype.pushContextScreenshotPath,
      updateContextScreenshotBuffer: Generator.prototype.updateContextScreenshotBuffer,
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
          contextBuffer: {
            enabled: false,
          },
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
      contextScreenshotBuffer: [],
      getDriftCorrectionConfig: Generator.prototype.getDriftCorrectionConfig,
      getContextBufferConfig: Generator.prototype.getContextBufferConfig,
      trimContextScreenshotBuffer: Generator.prototype.trimContextScreenshotBuffer,
      pushContextScreenshotPath: Generator.prototype.pushContextScreenshotPath,
      updateContextScreenshotBuffer: Generator.prototype.updateContextScreenshotBuffer,
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
        imagePath: '/tmp/raw-last-frame.png',
        images: [{ path: freshCameraShotPath }],
        contextReference: expect.objectContaining({
          enabled: true,
        }),
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

  test('submits an 8-frame FIFO screenshot buffer as context reference for kontext drift correction', async () => {
    const tempDir = await createTempDir();
    const screenshotPaths = [];
    for (let index = 0; index < 10; index += 1) {
      const imagePath = path.join(tempDir, `camera-${String(index + 1).padStart(2, '0')}.jpg`);
      await fs.writeFile(imagePath, `camera-${index + 1}`);
      screenshotPaths.push(imagePath);
    }

    const context = {
      config: {
        driftCorrection: {
          enabled: true,
          contextBuffer: {
            enabled: true,
            size: 8,
            columns: 4,
            rows: 2,
            captureBeforeEachCall: true,
          },
          referenceImage: {
            captureFn: jest
              .fn()
              .mockResolvedValueOnce(screenshotPaths[8])
              .mockResolvedValueOnce(screenshotPaths[9]),
            promptSource: '',
          },
          model: {
            model: 'black-forest-labs/FLUX.1-Kontext-dev',
            hfProvider: 'fal-ai',
          },
        },
      },
      imageDir: tempDir,
      contextScreenshotBuffer: screenshotPaths.slice(0, 8),
      driftCorrectionModel: {
        prompt: jest.fn().mockResolvedValue({
          image: { path: path.join(tempDir, 'corrected.png') },
          json: {
            contextReferenceBoardPath: path.join(tempDir, 'context-reference', 'board.png'),
          },
        }),
      },
      getDriftCorrectionConfig: Generator.prototype.getDriftCorrectionConfig,
      getContextBufferConfig: Generator.prototype.getContextBufferConfig,
      trimContextScreenshotBuffer: Generator.prototype.trimContextScreenshotBuffer,
      pushContextScreenshotPath: Generator.prototype.pushContextScreenshotPath,
      updateContextScreenshotBuffer: Generator.prototype.updateContextScreenshotBuffer,
      buildDriftCorrectionPrompt: Generator.prototype.buildDriftCorrectionPrompt,
      resolveDriftCorrectionReferenceImage: Generator.prototype.resolveDriftCorrectionReferenceImage,
      correctLastFrameForNextScene: Generator.prototype.correctLastFrameForNextScene,
    };

    await Generator.prototype.correctLastFrameForNextScene.call(context, {
      lastFrame: {
        image: { path: screenshotPaths[0] },
        json: { metadata: { prompt: 'previous shot prompt' } },
      },
      nextScenePlanEntry: { title: 'Next scene', storyBeat: 'He looks up.' },
      nextSceneContext: { index: 2, total: 6, isFirst: false, isLast: false },
    });

    const expectedBuffer = [...screenshotPaths.slice(1, 8), screenshotPaths[9]];
    const expectedSecondaryRefs = [screenshotPaths[8], ...expectedBuffer];
    expect(context.contextScreenshotBuffer).toEqual(expectedBuffer);
    expect(context.driftCorrectionModel.prompt).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        imagePath: screenshotPaths[0],
        contextReference: {
          enabled: true,
          name: 'flux-context-board',
          layout: {
            maxImages: 8,
            columns: 4,
            rows: 2,
          },
        },
        images: expectedSecondaryRefs.map((entryPath) => ({ path: entryPath })),
      })
    );
  });
});
