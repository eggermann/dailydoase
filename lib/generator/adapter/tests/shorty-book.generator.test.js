import { afterEach, describe, expect, jest, test } from '@jest/globals';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';

import {
  capVideoDurationForBackend,
  resolveIterationStartDecision,
  resolveSceneCount,
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

describe('resolveSceneCount', () => {
  test('keeps a one-scene Taktmuster plan as one render clip', async () => {
    await expect(resolveSceneCount({
      scenePlan: [{ title: 'One-beat iteration' }],
    })).resolves.toBe(1);
  });
});

describe('resolveIterationStartDecision', () => {
  test('lets GPT choose continuation, first-last transition, or camera reset', () => {
    const decide = (firstScene) => resolveIterationStartDecision({
      sceneLoop: {
        iterationStartMode: 'storyDriven',
        scenePlan: [firstScene],
      },
      hasPreviousLastFrame: true,
    });

    expect(decide({ frameSource: 'lastFrame', videoMode: 'singleImage' })).toMatchObject({
      mode: 'continue',
      startFromPreviousLastFrame: true,
    });
    expect(decide({ frameSource: 'lastFrame', videoMode: 'firstLast' })).toMatchObject({
      mode: 'firstLast',
      startFromPreviousLastFrame: true,
    });
    expect(decide({ frameSource: 'newImage', videoMode: 'singleImage' })).toMatchObject({
      mode: 'cameraReset',
      startFromPreviousLastFrame: false,
    });
  });

  test('first iteration always starts from camera because no previous film exists', () => {
    expect(resolveIterationStartDecision({
      sceneLoop: {
        iterationStartMode: 'storyDriven',
        scenePlan: [{ frameSource: 'lastFrame', videoMode: 'singleImage' }],
      },
      hasPreviousLastFrame: false,
    })).toMatchObject({
      mode: 'cameraReset',
      startFromPreviousLastFrame: false,
    });
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

describe('capVideoDurationForBackend', () => {
  test('caps public WAN first-last durations at the backend limit', () => {
    expect(capVideoDurationForBackend(5.4, {
      useSingleImage: false,
      videoType: {
        runtime: { selfHostedHugginfaceModel: false },
        config: { folderName: 'wan22FirstLast' },
      },
    })).toBe(5.1);
  });

  test('does not cap single-image or self-hosted video durations', () => {
    expect(capVideoDurationForBackend(5.4, {
      useSingleImage: true,
      videoType: {
        runtime: { selfHostedHugginfaceModel: false },
        config: { folderName: 'wan22FirstLast' },
      },
    })).toBe(5.4);
    expect(capVideoDurationForBackend(5.4, {
      useSingleImage: false,
      videoType: {
        runtime: { selfHostedHugginfaceModel: true },
        config: { folderName: 'wan22FirstLast' },
      },
    })).toBe(5.4);
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
      generateOpeningFluxContextFrame: jest.fn().mockResolvedValue(null),
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

  test('generates a FLUX-Kontext opening frame from the camera shot when the mode is active', async () => {
    tempDir = await createTempDir();
    const openingImagePath = path.join(tempDir, 'opening-camera.jpg');
    await fs.writeFile(openingImagePath, 'fresh-camera-shot');

    const prompt = 'the warning lands in the same kitchen with a charged stillness';
    const openingFluxContextModel = {
      prompt: jest.fn().mockResolvedValue({
        image: { path: path.join(tempDir, 'opening-flux-context.png') },
        json: {},
      }),
    };

    const context = {
      lastEndFRame: null,
      openingFluxContextModel,
      shouldGenerateOpeningFluxContextImage: Generator.prototype.shouldGenerateOpeningFluxContextImage,
      generateOpeningFluxContextFrame: Generator.prototype.generateOpeningFluxContextFrame,
      generateImage: jest.fn(),
    };

    const startFrame = await Generator.prototype.resolveStartFrame.call(
      context,
      [],
      {},
      {
        active: true,
        mode: 'fluxContext',
        imagePath: openingImagePath,
        referenceImagePath: openingImagePath,
        generatedPrompt: prompt,
        interval: 3,
        storyRunIndex: 3,
        model: {
          model: 'black-forest-labs/FLUX.1-Kontext-dev',
          hfProvider: 'fal-ai',
        },
      },
      {
        index: 1,
        total: 6,
        isFirst: true,
        isLast: false,
      },
      { allowLastEndFrame: false }
    );

    expect(openingFluxContextModel.prompt).toHaveBeenCalledWith(prompt, expect.objectContaining({
      imagePath: openingImagePath,
      prompt,
      model: 'black-forest-labs/FLUX.1-Kontext-dev',
      hfProvider: 'fal-ai',
    }));
    expect(startFrame).toEqual(expect.objectContaining({
      image: { path: path.join(tempDir, 'opening-flux-context.png') },
      json: expect.objectContaining({
        metadata: expect.objectContaining({
          prompt,
          openingImageMode: 'fluxContext',
          openingImageReferencePath: openingImagePath,
          openingImageStoryRunIndex: 3,
          openingImageInterval: 3,
        }),
      }),
    }));
    expect(context.generateImage).not.toHaveBeenCalled();
  });

  test('generates a FLUX-Kontext opening frame from the first scene context image with the protagonist as reference', async () => {
    tempDir = await createTempDir();
    const protagonistPath = path.join(tempDir, 'protagonist-reference.jpg');
    const sceneContextPath = path.join(tempDir, 'scene-context-01.jpg');
    await fs.writeFile(protagonistPath, 'protagonist-reference');
    await fs.writeFile(sceneContextPath, 'scene-context');

    const prompt = 'the room keeps moving but the person stays the same';
    const openingFluxContextModel = {
      prompt: jest.fn().mockResolvedValue({
        image: { path: path.join(tempDir, 'opening-flux-context.png') },
        json: {},
      }),
    };

    const context = {
      lastEndFRame: null,
      openingFluxContextModel,
      shouldGenerateOpeningFluxContextImage: Generator.prototype.shouldGenerateOpeningFluxContextImage,
      generateOpeningFluxContextFrame: Generator.prototype.generateOpeningFluxContextFrame,
      generateImage: jest.fn(),
    };

    const startFrame = await Generator.prototype.resolveStartFrame.call(
      context,
      [],
      {},
      {
        active: true,
        mode: 'fluxContext',
        imagePath: protagonistPath,
        referenceImagePath: protagonistPath,
        sceneContextReferencePath: sceneContextPath,
        generatedPrompt: prompt,
        interval: 3,
        storyRunIndex: 3,
        model: {
          model: 'black-forest-labs/FLUX.1-Kontext-dev',
          hfProvider: 'fal-ai',
        },
      },
      {
        index: 1,
        total: 6,
        isFirst: true,
        isLast: false,
      },
      { allowLastEndFrame: false }
    );

    expect(openingFluxContextModel.prompt).toHaveBeenCalledWith(prompt, expect.objectContaining({
      imagePath: sceneContextPath,
      images: [{ path: protagonistPath }],
      contextReference: { enabled: true },
      prompt,
      model: 'black-forest-labs/FLUX.1-Kontext-dev',
      hfProvider: 'fal-ai',
    }));
    expect(startFrame).toEqual(expect.objectContaining({
      image: { path: path.join(tempDir, 'opening-flux-context.png') },
      json: expect.objectContaining({
        metadata: expect.objectContaining({
          prompt,
          openingImageMode: 'fluxContext',
          openingImageReferencePath: protagonistPath,
          openingImageSceneContextReferencePath: sceneContextPath,
          openingImageStoryRunIndex: 3,
          openingImageInterval: 3,
        }),
      }),
    }));
    expect(context.generateImage).not.toHaveBeenCalled();
  });
});

describe('Generator.generateImage', () => {
  let tempDir = '';

  afterEach(async () => {
    if (tempDir) {
      await fs.remove(tempDir);
      tempDir = '';
    }
  });

  test('mixes selected cast frames into one Runware context image before video generation', async () => {
    tempDir = await createTempDir();
    const startImagePath = path.join(tempDir, 'current-room.jpg');
    const castImagePath = path.join(tempDir, 'cast-memory.jpg');
    await fs.writeFile(startImagePath, 'current-room');
    await fs.writeFile(castImagePath, 'cast-memory');
    const castContextImageModel = {
      prompt: jest.fn().mockResolvedValue({
        image: { path: path.join(tempDir, 'mixed-cast-context.png') },
        json: {},
      }),
    };
    const context = {
      config: {
        sceneLoop: {
          castContext: {
            enabled: true,
            model: { model: 'bfl:6@1', hfProvider: 'runware' },
          },
        },
      },
      castContextImageModel,
      getCastContextConfig: Generator.prototype.getCastContextConfig,
    };

    const mixedFrame = await Generator.prototype.generateCastContextFrame.call(context, {
      startFrame: { image: { path: startImagePath } },
      scenePlanEntry: {
        castSelection: ['cast-002'],
        castUse: 'returns as a red echo behind the display',
        stillPrompt: 'The display opens around the returning visitor.',
        castReferences: [{
          personaId: 'cast-002',
          referenceImage: castImagePath,
          description: 'red bag, background right',
        }],
      },
      sceneContext: { index: 2 },
      imageOptions: {
        width: 1184,
        height: 880,
        model: {
          model: 'Qwen/Qwen-Image-Edit-2511',
          hfProvider: 'fal-ai',
        },
      },
    });

    expect(mixedFrame.image.path).toContain('mixed-cast-context.png');
    expect(castContextImageModel.prompt).toHaveBeenCalledWith(
      expect.stringContaining('returns as a red echo behind the display'),
      expect.objectContaining({
        imagePath: startImagePath,
        images: [{ path: castImagePath }],
        model: 'bfl:6@1',
        hfProvider: 'runware',
        contextReference: { enabled: true },
        frameRole: 'cast-context',
      })
    );
  });

  test('skips a timed-out cast context frame so video rendering can continue', async () => {
    tempDir = await createTempDir();
    const startImagePath = path.join(tempDir, 'current-room.jpg');
    const castImagePath = path.join(tempDir, 'cast-memory.jpg');
    await fs.writeFile(startImagePath, 'current-room');
    await fs.writeFile(castImagePath, 'cast-memory');
    const castContextImageModel = {
      prompt: jest.fn().mockRejectedValue(new Error('Runware request timed out after 120000ms')),
    };
    const context = {
      config: {
        sceneLoop: {
          castContext: {
            enabled: true,
            timeoutMs: 120000,
            model: { model: 'bfl:6@1', hfProvider: 'runware' },
          },
        },
      },
      castContextImageModel,
      getCastContextConfig: Generator.prototype.getCastContextConfig,
    };

    const mixedFrame = await Generator.prototype.generateCastContextFrame.call(context, {
      startFrame: { image: { path: startImagePath } },
      scenePlanEntry: {
        castSelection: ['cast-002'],
        castReferences: [{
          personaId: 'cast-002',
          referenceImage: castImagePath,
        }],
      },
      sceneContext: { index: 2 },
    });

    expect(mixedFrame).toBeNull();
    expect(castContextImageModel.prompt).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ runwareTimeoutMs: 120000 })
    );
  });

  test('uses the saved opening webcam shot as the persona reference for fresh stills', async () => {
    tempDir = await createTempDir();
    const personaReferencePath = path.join(tempDir, 'opening-persona-reference.jpg');
    await fs.writeFile(personaReferencePath, 'persona-reference');

    const personaReferenceImageModel = {
      prompt: jest.fn().mockResolvedValue({
        image: { path: path.join(tempDir, 'fresh-scene.png') },
        json: {},
      }),
    };
    const flux = {
      prompt: jest.fn(),
    };
    const context = {
      config: {
        image: {},
        sceneLoop: {
          openingImage: {
            usePersonaReferenceForFreshImages: true,
            personaReferencePath,
            personaReferenceDescription: 'middle-aged man with dark glasses, short hair, trimmed beard, black shirt, direct frontal webcam view',
            personaReferenceStrength: 92,
          },
        },
      },
      flux,
      personaReferenceImageModel,
      addStaticPrompt: jest.fn((prompt) => prompt),
      getOpeningImageConfig: Generator.prototype.getOpeningImageConfig,
      shouldUsePersonaReferenceImageModel: Generator.prototype.shouldUsePersonaReferenceImageModel,
      buildPersonaReferenceIdentityClause: Generator.prototype.buildPersonaReferenceIdentityClause,
      buildPersonaReferenceImageOptions: Generator.prototype.buildPersonaReferenceImageOptions,
    };

    await Generator.prototype.generateImage.call(
      context,
      [],
      {
        sceneContext: {
          index: 2,
          total: 6,
        },
        frameRole: 'start',
      },
      'Keep the same person, but move deeper into the scene.'
    );

    expect(personaReferenceImageModel.prompt).toHaveBeenCalledWith(
      expect.stringContaining('Keep the exact same real person as the saved webcam anchor image. Match this detected person exactly: middle-aged man with dark glasses, short hair, trimmed beard, black shirt, direct frontal webcam view.'),
      expect.objectContaining({
        imagePath: personaReferencePath,
        images: [{ path: personaReferencePath }],
        contextReference: { enabled: true },
      })
    );
    expect(flux.prompt).not.toHaveBeenCalled();
  });

  test('captures an updated persona reference for the next scene', async () => {
    tempDir = await createTempDir();
    const capturedPath = path.join(tempDir, 'captured-reference.jpg');
    await fs.writeFile(capturedPath, 'captured-reference');

    const context = {
      imageDir: tempDir,
      config: {
        sceneLoop: {
          openingImage: {
            asyncPersonaReference: {
              enabled: true,
              intervalScenes: 1,
              captureFn: jest.fn().mockResolvedValue({
                path: capturedPath,
                metadata: {
                  personDescription: 'A man in dark glasses faces the camera clearly.',
                  personStrength: 88,
                  provider: 'localMistral',
                  visionText: 'PERSON_PRESENT: yes\nPERSON_STRENGTH: 88\nPERSON_DESCRIPTION: A man in dark glasses faces the camera clearly.',
                },
              }),
            },
          },
        },
      },
      personaReferenceCapturePromise: null,
      getOpeningImageConfig: Generator.prototype.getOpeningImageConfig,
      getAsyncPersonaReferenceConfig: Generator.prototype.getAsyncPersonaReferenceConfig,
      updateOpeningPersonaReferencePath: Generator.prototype.updateOpeningPersonaReferencePath,
      persistCapturedPersonaReferenceImage: Generator.prototype.persistCapturedPersonaReferenceImage,
      scheduleAsyncPersonaReferenceCapture: Generator.prototype.scheduleAsyncPersonaReferenceCapture,
    };

    const savedReferencePath = await Generator.prototype.scheduleAsyncPersonaReferenceCapture.call(
      context,
      { index: 1 }
    );

    expect(savedReferencePath).toContain('persona-reference-scene-01');
    await expect(fs.pathExists(savedReferencePath)).resolves.toBe(true);
    expect(context.config.sceneLoop.openingImage.personaReferencePath).toBe(savedReferencePath);
    expect(context.config.sceneLoop.openingImage.referenceImagePath).toBe(savedReferencePath);
    expect(context.config.sceneLoop.openingImage.personaReferenceDescription).toBe('A man in dark glasses faces the camera clearly.');
    expect(context.config.sceneLoop.openingImage.personaReferenceStrength).toBe(88);
  });

  test('refreshes the active persona reference immediately from a live camera shot', async () => {
    tempDir = await createTempDir();
    const capturedPath = path.join(tempDir, 'live-camera-shot.jpg');
    await fs.writeFile(capturedPath, 'live-camera-shot');

    const context = {
      imageDir: tempDir,
      config: {
        sceneLoop: {
          openingImage: {
            usePersonaReferenceForFreshImages: true,
            personaReferencePath: path.join(tempDir, 'opening-persona-reference.jpg'),
          },
        },
      },
      getOpeningImageConfig: Generator.prototype.getOpeningImageConfig,
      updateOpeningPersonaReferencePath: Generator.prototype.updateOpeningPersonaReferencePath,
      persistCapturedPersonaReferenceImage: Generator.prototype.persistCapturedPersonaReferenceImage,
      refreshPersonaReferenceFromCameraShot: Generator.prototype.refreshPersonaReferenceFromCameraShot,
    };

    const savedReferencePath = await Generator.prototype.refreshPersonaReferenceFromCameraShot.call(
      context,
      capturedPath,
      { index: 2 }
    );

    expect(savedReferencePath).toContain('persona-reference-scene-02');
    await expect(fs.pathExists(savedReferencePath)).resolves.toBe(true);
    expect(context.config.sceneLoop.openingImage.personaReferencePath).toBe(savedReferencePath);
    expect(context.config.sceneLoop.openingImage.referenceImagePath).toBe(savedReferencePath);
  });

  test('marks a timed persona refresh as due after the minimum beat elapses', () => {
    const now = Date.now();
    const context = {
      lastPersonaReferenceCaptureAt: now - 51_000,
      shouldCapturePersonaReferenceForBeat: Generator.prototype.shouldCapturePersonaReferenceForBeat,
    };

    const due = Generator.prototype.shouldCapturePersonaReferenceForBeat.call(
      context,
      { minBeatMs: 50_000, intervalScenes: 99 },
      { index: 2 }
    );

    expect(due).toBe(true);
  });

  test('allows forced timed persona capture even when the scene interval would normally skip it', async () => {
    tempDir = await createTempDir();
    const capturedPath = path.join(tempDir, 'captured-reference-timed.jpg');
    await fs.writeFile(capturedPath, 'captured-reference-timed');

    const context = {
      imageDir: tempDir,
      config: {
        sceneLoop: {
          openingImage: {
            asyncPersonaReference: {
              enabled: true,
              intervalScenes: 99,
              minBeatMs: 50_000,
              captureFn: jest.fn().mockResolvedValue({
                path: capturedPath,
                metadata: {
                  personDescription: 'strong timed camera anchor',
                  personStrength: 95,
                  provider: 'localMistral',
                  visionText: 'PERSON_PRESENT: yes\nPERSON_STRENGTH: 95\nPERSON_DESCRIPTION: strong timed camera anchor',
                },
              }),
            },
          },
        },
      },
      personaReferenceCapturePromise: null,
      lastPersonaReferenceCaptureAt: Date.now() - 60_000,
      getOpeningImageConfig: Generator.prototype.getOpeningImageConfig,
      getAsyncPersonaReferenceConfig: Generator.prototype.getAsyncPersonaReferenceConfig,
      updateOpeningPersonaReferencePath: Generator.prototype.updateOpeningPersonaReferencePath,
      persistCapturedPersonaReferenceImage: Generator.prototype.persistCapturedPersonaReferenceImage,
      markPersonaReferenceCaptureTimestamp: Generator.prototype.markPersonaReferenceCaptureTimestamp,
      scheduleAsyncPersonaReferenceCapture: Generator.prototype.scheduleAsyncPersonaReferenceCapture,
    };

    const savedReferencePath = await Generator.prototype.scheduleAsyncPersonaReferenceCapture.call(
      context,
      { index: 2 },
      { forceByBeat: true }
    );

    expect(savedReferencePath).toContain('persona-reference-scene-02');
    expect(context.config.sceneLoop.openingImage.personaReferenceDescription).toBe('strong timed camera anchor');
    expect(context.lastPersonaReferenceCaptureAt).toBeGreaterThan(0);
  });

  test('adds the saved persona description to drift correction prompts', () => {
    const context = {
      config: {
        sceneLoop: {
          openingImage: {
            continuityAnchor: 'same room, same camera height, same glasses',
            continuityVisionText: 'Subject: same man in black shirt',
            personaReferenceDescription: 'middle-aged man with dark glasses, short hair, trimmed beard, black shirt, direct frontal webcam view',
            personaReferenceStrength: 91,
          },
        },
        driftCorrection: {
          level: 'aggressive',
        },
      },
      getOpeningImageConfig: Generator.prototype.getOpeningImageConfig,
      getDriftCorrectionConfig: jest.fn(() => ({ level: 'aggressive' })),
      buildPersonaReferenceIdentityClause: Generator.prototype.buildPersonaReferenceIdentityClause,
      buildDriftCorrectionPrompt: Generator.prototype.buildDriftCorrectionPrompt,
    };

    const prompt = Generator.prototype.buildDriftCorrectionPrompt.call(context, {
      lastFrame: {
        json: {
          metadata: {
            prompt: 'same face, same room, visible glasses',
          },
        },
      },
      nextScenePlanEntry: {
        title: 'closer reaction',
        storyBeat: 'he looks toward the artwork',
      },
      nextSceneContext: {},
    });

    expect(prompt).toContain('Keep the exact same real person as the saved webcam anchor image. Match this detected person exactly: middle-aged man with dark glasses, short hair, trimmed beard, black shirt, direct frontal webcam view.');
    expect(prompt).toContain('Canonical opening continuity: same room, same camera height, same glasses');
  });
});

describe('Generator.continueSceneLoop', () => {
  let tempDir = '';

  afterEach(async () => {
    if (tempDir) {
      await fs.remove(tempDir);
      tempDir = '';
    }
  });

  test('uses a cast-context image as a smooth planned first-last destination, not the next clip start', async () => {
    tempDir = await createTempDir();
    const promptDir = path.join(tempDir, 'parts', 'scene-prompts');
    await fs.ensureDir(promptDir);
    const previousFrame = {
      image: { path: path.join(tempDir, 'previous-last-frame.png') },
      json: { metadata: { prompt: 'previous room frame' } },
    };
    const castTarget = {
      image: { path: path.join(tempDir, 'cast-transition-target.png') },
      json: { metadata: { prompt: 'the returned visitor appears at the shelf' } },
    };
    const context = {
      imageDir: tempDir,
      continueSceneLoop: Generator.prototype.continueSceneLoop,
      generateCastContextFrame: jest.fn().mockResolvedValue(castTarget),
      generateSceneClip: jest.fn().mockResolvedValue({
        videoData: { file: path.join(tempDir, 'scene-02.mp4') },
        generatedPrompt: 'move toward the visitor',
        mergedConfig: {},
      }),
      finalizeSceneLoopResult: jest.fn().mockResolvedValue({ file: path.join(tempDir, 'scene-loop.mp4') }),
      resolveChainedStartFrameFromLastEnd: jest.fn().mockImplementation(function keepLastFrame() {
        return this.lastEndFRame;
      }),
      lastEndFRame: previousFrame,
    };

    await Generator.prototype.continueSceneLoop.call(context, {
      streams: [],
      options: {},
      fileName: 'cast-transition',
      sceneLoop: {
        captureLastFrame: false,
        scenePlan: [
          { title: 'Previous shot', videoMode: 'singleImage', frameSource: 'lastFrame' },
          { title: 'Return of the visitor', videoMode: 'firstLast', frameSource: 'lastFrame' },
        ],
      },
      clipCount: 2,
      imageOptions: {},
      promptDir,
      clipResults: [],
      startFrame: previousFrame,
      startIndex: 1,
      loopStartsFromLastFrame: false,
    });

    expect(context.generateSceneClip).toHaveBeenCalledWith(expect.objectContaining({
      startFrame: previousFrame,
      useSingleImage: false,
      endFrameOverride: {
        path: castTarget.image.path,
        prompt: 'the returned visitor appears at the shelf',
      },
    }));
  });

  test('keeps a planned single-image continuation single and skips its cast-context target', async () => {
    tempDir = await createTempDir();
    const promptDir = path.join(tempDir, 'parts', 'scene-prompts');
    await fs.ensureDir(promptDir);
    const previousFrame = {
      image: { path: path.join(tempDir, 'previous-last-frame.png') },
      json: { metadata: { prompt: 'previous room frame' } },
    };
    const context = {
      imageDir: tempDir,
      continueSceneLoop: Generator.prototype.continueSceneLoop,
      generateCastContextFrame: jest.fn(),
      generateSceneClip: jest.fn().mockResolvedValue({
        videoData: { file: path.join(tempDir, 'scene-02.mp4') },
        generatedPrompt: 'continue movement from the previous frame',
        mergedConfig: {},
      }),
      finalizeSceneLoopResult: jest.fn().mockResolvedValue({ file: path.join(tempDir, 'scene-loop.mp4') }),
      resolveChainedStartFrameFromLastEnd: jest.fn().mockImplementation(function keepLastFrame() {
        return this.lastEndFRame;
      }),
      lastEndFRame: previousFrame,
    };

    await Generator.prototype.continueSceneLoop.call(context, {
      streams: [],
      options: {},
      fileName: 'single-image-continuation',
      sceneLoop: {
        captureLastFrame: false,
        scenePlan: [
          { title: 'Previous shot', videoMode: 'singleImage', frameSource: 'lastFrame' },
          {
            title: 'Continue with remembered cast',
            videoMode: 'singleImage',
            frameSource: 'lastFrame',
            castReferences: [{ referenceImage: path.join(tempDir, 'cast-memory.jpg') }],
          },
        ],
      },
      clipCount: 2,
      imageOptions: {},
      promptDir,
      clipResults: [],
      startFrame: previousFrame,
      startIndex: 1,
      loopStartsFromLastFrame: false,
    });

    expect(context.generateCastContextFrame).not.toHaveBeenCalled();
    expect(context.generateSceneClip).toHaveBeenCalledWith(expect.objectContaining({
      startFrame: previousFrame,
      useSingleImage: true,
      endFrameOverride: null,
    }));
    const decision = await fs.readJson(path.join(promptDir, '02-scene-decision.json'));
    expect(decision).toMatchObject({
      stage: 'before-video-generation',
      planned: {
        videoMode: 'singleImage',
        frameSource: 'lastFrame',
      },
      applied: {
        videoMode: 'singleImage',
        startFramePath: previousFrame.image.path,
        endFramePath: null,
        castContext: 'skipped: planned singleImage continuation preserves previous frame',
      },
    });
  });

  test('uses the opening camera frame as first anchor when first-last is configured', async () => {
    tempDir = await createTempDir();
    const promptDir = path.join(tempDir, 'parts', 'scene-prompts');
    await fs.ensureDir(promptDir);
    const openingFrame = {
      image: { path: path.join(tempDir, 'opening-camera-frame.png') },
      json: { metadata: { prompt: 'real opening room frame' } },
    };
    const castTarget = {
      image: { path: path.join(tempDir, 'opening-transition-target.png') },
      json: { metadata: { prompt: 'same room after the first story event' } },
    };
    const context = {
      imageDir: tempDir,
      continueSceneLoop: Generator.prototype.continueSceneLoop,
      generateCastContextFrame: jest.fn().mockResolvedValue(castTarget),
      generateSceneClip: jest.fn().mockResolvedValue({
        videoData: { file: path.join(tempDir, 'scene-01.mp4') },
        generatedPrompt: 'move through the opening room',
        mergedConfig: {},
      }),
      finalizeSceneLoopResult: jest.fn().mockResolvedValue({ file: path.join(tempDir, 'scene-loop.mp4') }),
    };

    await Generator.prototype.continueSceneLoop.call(context, {
      streams: [],
      options: {},
      fileName: 'opening-transition',
      sceneLoop: {
        captureLastFrame: false,
        firstClipUseSingleImage: false,
        scenePlan: [
          { title: 'Opening transition', videoMode: 'firstLast', frameSource: 'newImage' },
        ],
      },
      clipCount: 1,
      imageOptions: {},
      promptDir,
      clipResults: [],
      startFrame: openingFrame,
      startIndex: 0,
      loopStartsFromLastFrame: false,
    });

    expect(context.generateSceneClip).toHaveBeenCalledWith(expect.objectContaining({
      startFrame: openingFrame,
      useSingleImage: false,
      endFrameOverride: {
        path: castTarget.image.path,
        prompt: 'same room after the first story event',
      },
    }));
  });

  test('promotes a fresh live camera start shot into the active persona reference', async () => {
    tempDir = await createTempDir();
    const promptDir = path.join(tempDir, 'parts', 'scene-prompts');
    await fs.ensureDir(promptDir);

    const liveStartImagePath = path.join(tempDir, 'live-camera-start.jpg');
    await fs.writeFile(liveStartImagePath, 'live-camera-start');

    const context = {
      imageDir: tempDir,
      config: {
        sceneLoop: {
          openingImage: {
            usePersonaReferenceForFreshImages: true,
            personaReferencePath: path.join(tempDir, 'opening-persona-reference.jpg'),
            asyncPersonaReference: {
              enabled: false,
            },
          },
        },
      },
      continueSceneLoop: Generator.prototype.continueSceneLoop,
      getOpeningImageConfig: Generator.prototype.getOpeningImageConfig,
      getAsyncPersonaReferenceConfig: Generator.prototype.getAsyncPersonaReferenceConfig,
      updateOpeningPersonaReferencePath: Generator.prototype.updateOpeningPersonaReferencePath,
      persistCapturedPersonaReferenceImage: Generator.prototype.persistCapturedPersonaReferenceImage,
      refreshPersonaReferenceFromCameraShot: Generator.prototype.refreshPersonaReferenceFromCameraShot,
      scheduleAsyncPersonaReferenceCapture: jest.fn().mockResolvedValue(''),
      generateSceneClip: jest.fn().mockResolvedValue({
        videoData: { file: path.join(tempDir, 'scene-02.mp4') },
        generatedPrompt: 'keep the same person in the same room',
        mergedConfig: {},
      }),
      finalizeSceneLoopResult: jest.fn().mockResolvedValue({
        file: path.join(tempDir, 'scene-loop.mp4'),
      }),
      lastEndFRame: {
        image: { path: path.join(tempDir, 'previous-last-frame.png') },
        json: { metadata: { prompt: 'previous room hold' } },
      },
    };

    await Generator.prototype.continueSceneLoop.call(context, {
      streams: [],
      options: {},
      fileName: 'test-scene-loop',
      sceneLoop: {
        openingImage: context.config.sceneLoop.openingImage,
        liveStartImage: {
          imagePath: liveStartImagePath,
          promptSource: 'fresh webcam reanchor',
        },
        firstClipUseSingleImage: true,
        subsequentClipsUseSingleImage: true,
        captureLastFrame: false,
        scenePlan: [
          {
            title: 'Opening',
            videoMode: 'singleImage',
            frameSource: 'newImage',
            freshImage: true,
            useCameraShot: true,
          },
          {
            title: 'Reanchor',
            videoMode: 'singleImage',
            frameSource: 'newImage',
            freshImage: true,
            useCameraShot: true,
          },
        ],
      },
      clipCount: 2,
      imageOptions: {},
      promptDir,
      clipResults: [],
      startFrame: {
        image: { path: path.join(tempDir, 'opening-shot.jpg') },
        json: { metadata: { prompt: 'opening shot' } },
      },
      startIndex: 1,
      loopStartsFromLastFrame: false,
    });

    const savedReferencePath = context.config.sceneLoop.openingImage.personaReferencePath;
    expect(savedReferencePath).toContain('persona-reference-scene-02');
    await expect(fs.pathExists(savedReferencePath)).resolves.toBe(true);
    expect(context.generateSceneClip).toHaveBeenCalledWith(expect.objectContaining({
      startFrame: expect.objectContaining({
        image: { path: liveStartImagePath },
      }),
    }));
    expect(context.scheduleAsyncPersonaReferenceCapture).not.toHaveBeenCalled();
  });

  test('waits for the camera-person refresh before rendering the next scene', async () => {
    tempDir = await createTempDir();
    const promptDir = path.join(tempDir, 'parts', 'scene-prompts');
    await fs.ensureDir(promptDir);
    const refreshedReferencePath = path.join(tempDir, 'persona-reference-next.jpg');
    await fs.writeFile(refreshedReferencePath, 'next-person');

    let releaseCapture;
    const captureBarrier = new Promise((resolve) => {
      releaseCapture = resolve;
    });
    const generatedSceneIndexes = [];
    const context = {
      imageDir: tempDir,
      config: {
        sceneLoop: {
          openingImage: {
            asyncPersonaReference: { enabled: true },
          },
        },
      },
      continueSceneLoop: Generator.prototype.continueSceneLoop,
      getOpeningImageConfig: Generator.prototype.getOpeningImageConfig,
      getAsyncPersonaReferenceConfig: Generator.prototype.getAsyncPersonaReferenceConfig,
      shouldCapturePersonaReferenceForBeat: jest.fn(() => false),
      scheduleAsyncPersonaReferenceCapture: jest.fn(async () => {
        await captureBarrier;
        return refreshedReferencePath;
      }),
      generateSceneClip: jest.fn(async ({ options }) => {
        generatedSceneIndexes.push(options.sceneContext.index);
        return {
          videoData: { file: path.join(tempDir, `scene-${options.sceneContext.index}.mp4`) },
          generatedPrompt: `scene ${options.sceneContext.index}`,
          mergedConfig: {},
        };
      }),
      finalizeSceneLoopResult: jest.fn().mockResolvedValue({
        file: path.join(tempDir, 'scene-loop.mp4'),
      }),
      resolveChainedStartFrameFromLastEnd: jest.fn(async function resolveNextFrame() {
        return this.lastEndFRame;
      }),
      lastEndFRame: {
        image: { path: path.join(tempDir, 'last-frame.png') },
        json: { metadata: { prompt: 'last frame' } },
      },
    };

    const loopPromise = Generator.prototype.continueSceneLoop.call(context, {
      streams: [],
      options: {},
      fileName: 'sync-persona-loop',
      sceneLoop: {
        openingImage: context.config.sceneLoop.openingImage,
        firstClipUseSingleImage: true,
        subsequentClipsUseSingleImage: true,
        captureLastFrame: false,
        scenePlan: [
          { title: 'Shot one', videoMode: 'singleImage', frameSource: 'lastFrame' },
          { title: 'Shot two', videoMode: 'singleImage', frameSource: 'lastFrame' },
        ],
      },
      clipCount: 2,
      imageOptions: {},
      promptDir,
      clipResults: [],
      startFrame: context.lastEndFRame,
      startIndex: 0,
      loopStartsFromLastFrame: true,
    });

    for (let attempt = 0; attempt < 10 && generatedSceneIndexes.length === 0; attempt += 1) {
      await new Promise((resolve) => setImmediate(resolve));
    }
    expect(generatedSceneIndexes).toEqual([1]);

    releaseCapture();
    await loopPromise;

    expect(generatedSceneIndexes).toEqual([1, 2]);
    expect(context.pendingPersonaReferencePath).toBe(refreshedReferencePath);
  });
});

describe('Generator.generateSceneClip', () => {
  test('adds the current camera-person anchor to the next video prompt', () => {
    const context = {
      config: {},
      addStaticPrompt: (prompt) => prompt,
      getOpeningImageConfig: jest.fn(() => ({
        personaReferenceDescription: 'a new visitor stands at frame left',
        personaReferenceStrength: 93,
      })),
      buildPersonaReferenceIdentityClause: Generator.prototype.buildPersonaReferenceIdentityClause,
      buildVideoConfig: Generator.prototype.buildVideoConfig,
    };

    const mergedConfig = Generator.prototype.buildVideoConfig.call(
      context,
      'The visitor follows the Kaufhaus light.',
      { model: {} },
      { json: { metadata: { prompt: '' } } },
      {}
    );

    expect(mergedConfig.prompt).toContain('a new visitor stands at frame left');
    expect(mergedConfig.prompt).toContain('The visitor follows the Kaufhaus light.');
  });

  test('retries the same scene render without rebuilding the prompt or start frame', async () => {
    const context = {
      prepareVideoGeneration: jest.fn().mockResolvedValue({
        videoType: {
          runtime: { selfHostedHugginfaceModel: true },
          config: { folderName: 'wan22SingleImage-primary' },
        },
        videoTypeCandidates: [],
        videoModel: {
          model: {
            maxRetriesOnFailure: 1,
            retryDelayMs: 1,
          },
        },
        generatedPrompt: 'Hold the same room and retry the motion.',
      }),
      buildVideoConfig: jest.fn().mockReturnValue({
        duration_seconds: 3.2,
        prompt: 'Hold the same room and retry the motion.',
      }),
      generateVideoData: jest.fn()
        .mockRejectedValueOnce(new Error('temporary video backend failure'))
        .mockResolvedValueOnce({
          file: '/tmp/test-scene-retry.mp4',
        }),
      finalizeGeneratedVideo: jest.fn().mockResolvedValue({}),
    };

    const startFrame = {
      image: { path: '/tmp/start-frame.png' },
      json: { metadata: { prompt: 'start prompt' } },
    };

    const result = await Generator.prototype.generateSceneClip.call(context, {
      startFrame,
      streams: [],
      options: {
        sceneContext: {
          index: 2,
          total: 6,
          durationSeconds: 3.2,
        },
        mireloAI: {},
      },
      fileName: 'scene-02',
      useSingleImage: true,
      imageOptions: {},
    });

    expect(context.prepareVideoGeneration).toHaveBeenCalledTimes(1);
    expect(context.buildVideoConfig).toHaveBeenCalledTimes(1);
    expect(context.generateVideoData).toHaveBeenCalledTimes(2);
    expect(context.finalizeGeneratedVideo).toHaveBeenCalledTimes(1);
    expect(result.videoData).toEqual({
      file: '/tmp/test-scene-retry.mp4',
    });
  });

  test('caps public WAN first-last duration before request submission', async () => {
    const context = {
      prepareVideoGeneration: jest.fn().mockResolvedValue({
        videoType: {
          runtime: { selfHostedHugginfaceModel: false },
          config: { folderName: 'wan22FirstLast' },
        },
        videoTypeCandidates: [],
        videoModel: {},
        generatedPrompt: 'Move into the destination.',
      }),
      buildVideoConfig: jest.fn().mockReturnValue({
        duration_seconds: 5.4,
        prompt: 'Move into the destination.',
      }),
      generateVideoData: jest.fn().mockResolvedValue({
        file: '/tmp/test-first-last.mp4',
      }),
      finalizeGeneratedVideo: jest.fn().mockResolvedValue({}),
    };

    const startFrame = {
      image: { path: '/tmp/start-frame.png' },
      json: { metadata: { prompt: 'start prompt' } },
    };

    await Generator.prototype.generateSceneClip.call(context, {
      startFrame,
      streams: [],
      options: {
        sceneContext: {
          index: 2,
          total: 6,
          durationSeconds: 5.4,
        },
        mireloAI: {},
      },
      fileName: 'scene-02',
      useSingleImage: false,
      imageOptions: {},
    });

    expect(context.generateVideoData).toHaveBeenCalledWith(
      expect.objectContaining({
        runtime: { selfHostedHugginfaceModel: false },
      }),
      startFrame,
      expect.objectContaining({
        duration_seconds: 5.1,
      }),
      false,
      expect.any(Object)
    );
    expect(context.finalizeGeneratedVideo).toHaveBeenCalledWith(expect.objectContaining({
      requestedDuration: 5.1,
    }));
  });

  test('caps camera first-last durations to the shorter transition window', async () => {
    const context = {
      config: {
        story: {
          mode: 'camera',
          cameraFirstLastMaxDurationSeconds: 3.2,
        },
      },
      prepareVideoGeneration: jest.fn().mockResolvedValue({
        videoType: {
          runtime: { selfHostedHugginfaceModel: true },
          config: { folderName: 'wan22FirstLast' },
        },
        videoTypeCandidates: [],
        videoModel: {},
        generatedPrompt: 'Move into the destination.',
      }),
      buildVideoConfig: jest.fn().mockReturnValue({
        duration_seconds: 5.4,
        prompt: 'Move into the destination.',
      }),
      generateVideoData: jest.fn().mockResolvedValue({
        file: '/tmp/test-camera-first-last.mp4',
      }),
      finalizeGeneratedVideo: jest.fn().mockResolvedValue({}),
    };

    await Generator.prototype.generateSceneClip.call(context, {
      startFrame: {
        image: { path: '/tmp/start-frame.png' },
        json: { metadata: { prompt: 'start prompt' } },
      },
      streams: [],
      options: {
        sceneContext: {
          index: 3,
          total: 6,
          durationSeconds: 5.4,
        },
        mireloAI: {},
      },
      fileName: 'scene-03',
      useSingleImage: false,
      imageOptions: {},
    });

    expect(context.generateVideoData).toHaveBeenCalledWith(
      expect.any(Object),
      expect.any(Object),
      expect.objectContaining({
        duration_seconds: 3.2,
      }),
      false,
      expect.any(Object)
    );
    expect(context.finalizeGeneratedVideo).toHaveBeenCalledWith(expect.objectContaining({
      requestedDuration: 3.2,
    }));
  });
});

describe('Generator.prompt', () => {
  test('resumes a stored failed prompt generation before starting a fresh pass', async () => {
    const resumedResult = { file: '/tmp/resumed-scene-loop.mp4' };
    const context = {
      imageDir: '/tmp/dailydoase-shorty-book',
      repeatPromptGeneration: jest.fn().mockResolvedValue(resumedResult),
      runRepeatPromptGeneration: Generator.prototype.runRepeatPromptGeneration,
      runRepeatVideoGeneration: jest.fn(),
      resolveStartFrame: jest.fn(),
      prepareVideoGeneration: jest.fn(),
    };

    const result = await Generator.prototype.prompt.call(context, [], {
      sceneLoop: { enabled: true },
      image: {},
      video2: {},
    });

    expect(context.repeatPromptGeneration).toHaveBeenCalledTimes(1);
    expect(context.resolveStartFrame).not.toHaveBeenCalled();
    expect(context.prepareVideoGeneration).not.toHaveBeenCalled();
    expect(result).toBe(resumedResult);
  });

  test('passes prepared video fallback candidates into generateVideoData', async () => {
    const startFrame = {
      image: { path: '/tmp/start-frame.png' },
      json: { metadata: { prompt: 'start prompt' } },
    };
    const primaryVideoType = {
      runtime: { selfHostedHugginfaceModel: false },
      config: { folderName: 'wan22SingleImage-primary' },
    };
    const fallbackVideoType = {
      runtime: { selfHostedHugginfaceModel: true },
      config: { folderName: 'wan22SingleImage-fallback' },
    };
    const context = {
      imageDir: '/tmp/dailydoase-shorty-book',
      resolveStartFrame: jest.fn().mockResolvedValue(startFrame),
      prepareVideoGeneration: jest.fn().mockResolvedValue({
        videoType: primaryVideoType,
        videoTypeCandidates: [primaryVideoType, fallbackVideoType],
        videoModel: {},
        generatedPrompt: 'Hold the room, then let it slip.',
      }),
      buildVideoConfig: jest.fn().mockReturnValue({
        duration_seconds: 3.2,
        prompt: 'Hold the room, then let it slip.',
      }),
      generateVideoData: jest.fn().mockResolvedValue({
        file: '/tmp/test-single-image.mp4',
      }),
      finalizeGeneratedVideo: jest.fn().mockResolvedValue({}),
      addMireloAudioAndUpload: jest.fn().mockResolvedValue({
        file: '/tmp/test-single-image.mp4',
      }),
    };

    await Generator.prototype.prompt.call(context, [], {
      useSingleImage: true,
      image: {},
      video2: {},
    });

    expect(context.generateVideoData).toHaveBeenCalledWith(
      primaryVideoType,
      startFrame,
      expect.objectContaining({
        duration_seconds: 3.2,
      }),
      true,
      {
        videoTypeCandidates: [primaryVideoType, fallbackVideoType],
      }
    );
  });
});

describe('Generator.resolveChainedStartFrameFromLastEnd', () => {
  test('uses the awaited persona shot as the next drift reference without recapturing', async () => {
    const tempDir = await createTempDir();
    try {
      const personaShotPath = path.join(tempDir, 'awaited-persona-shot.jpg');
      await fs.writeFile(personaShotPath, 'persona-shot');
      const captureFn = jest.fn();
      const context = {
        imageDir: tempDir,
        pendingPersonaReferencePath: personaShotPath,
        getDriftCorrectionConfig: jest.fn(() => ({
          referenceImage: { captureFn },
        })),
        getOpeningImageConfig: jest.fn(() => ({
          personaReferenceDescription: 'the newly detected visitor',
        })),
        buildPersonaReferenceIdentityClause: Generator.prototype.buildPersonaReferenceIdentityClause,
      };

      const reference = await Generator.prototype.resolveDriftCorrectionReferenceImage.call(context, {
        lastFrame: {
          image: { path: path.join(tempDir, 'generated-last-frame.png') },
          json: { metadata: { prompt: 'previous generated shot' } },
        },
      });

      expect(reference).toEqual(expect.objectContaining({
        path: personaShotPath,
        sourceType: 'cameraShot',
      }));
      expect(captureFn).not.toHaveBeenCalled();
      expect(context.pendingPersonaReferencePath).toBe('');
    } finally {
      await fs.remove(tempDir);
    }
  });

  test('builds a gentler prompt for moderate drift handling', () => {
    const prompt = Generator.prototype.buildDriftCorrectionPrompt.call(
      {
        config: {
          driftCorrection: {
            level: 'moderate',
          },
        },
        getDriftCorrectionConfig: Generator.prototype.getDriftCorrectionConfig,
        getOpeningImageConfig: Generator.prototype.getOpeningImageConfig,
      },
      {
        lastFrame: {
          image: { path: '/tmp/raw-last-frame.png' },
          json: { metadata: { prompt: 'previous shot prompt' } },
        },
        nextScenePlanEntry: {
          title: 'Next scene',
          storyBeat: 'He looks up.',
        },
        nextSceneContext: { index: 2, total: 6, isFirst: false, isLast: false },
      }
    );

    expect(prompt).toContain('Apply only moderate drift handling');
  });

  test('returns the raw last frame when drift correction is disabled', async () => {
    const lastFrame = {
      image: { path: '/tmp/raw-last-frame.png' },
      json: { metadata: { prompt: 'previous shot prompt' } },
    };
    const context = {
      config: { driftCorrection: { enabled: false } },
      lastEndFRame: lastFrame,
      getDriftCorrectionConfig: Generator.prototype.getDriftCorrectionConfig,
      shouldApplyDriftCorrection: Generator.prototype.shouldApplyDriftCorrection,
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
          applyToSingleImage: true,
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
      getOpeningImageConfig: Generator.prototype.getOpeningImageConfig,
      shouldApplyDriftCorrection: Generator.prototype.shouldApplyDriftCorrection,
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
        nextScenePlanEntry: {
          title: 'Next scene',
          storyBeat: 'He looks up.',
          videoMode: 'singleImage',
          frameSource: 'lastFrame',
        },
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
          applyToSingleImage: true,
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
      getOpeningImageConfig: Generator.prototype.getOpeningImageConfig,
      shouldApplyDriftCorrection: Generator.prototype.shouldApplyDriftCorrection,
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
        nextScenePlanEntry: {
          title: 'Next scene',
          storyBeat: 'He looks up.',
          videoMode: 'singleImage',
          frameSource: 'lastFrame',
        },
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

  test('keeps the raw last frame for singleImage last-frame continuations by default in camera drift correction', async () => {
    const lastFrame = {
      image: { path: '/tmp/raw-last-frame.png' },
      json: { metadata: { prompt: 'previous shot prompt' } },
    };
    const context = {
      config: {
        driftCorrection: {
          enabled: true,
          applyToSingleImage: false,
          contextBuffer: {
            enabled: false,
          },
        },
      },
      lastEndFRame: lastFrame,
      driftCorrectionModel: {
        prompt: jest.fn(),
      },
      getDriftCorrectionConfig: Generator.prototype.getDriftCorrectionConfig,
      shouldApplyDriftCorrection: Generator.prototype.shouldApplyDriftCorrection,
      correctLastFrameForNextScene: jest.fn(),
    };

    const startFrame = await Generator.prototype.resolveChainedStartFrameFromLastEnd.call(
      context,
      {
        nextScenePlanEntry: {
          title: 'Next scene',
          storyBeat: 'He looks up.',
          videoMode: 'singleImage',
          frameSource: 'lastFrame',
        },
        nextSceneContext: { index: 2, total: 6, isFirst: false, isLast: false },
      }
    );

    expect(startFrame).toBe(lastFrame);
    expect(context.correctLastFrameForNextScene).not.toHaveBeenCalled();
    expect(context.driftCorrectionModel.prompt).not.toHaveBeenCalled();
  });

  test('keeps the raw last frame for firstLast transitions by default in camera drift correction', async () => {
    const lastFrame = {
      image: { path: '/tmp/raw-last-frame.png' },
      json: { metadata: { prompt: 'previous shot prompt' } },
    };
    const context = {
      config: {
        driftCorrection: {
          enabled: true,
          applyToSingleImage: true,
          applyToFirstLast: false,
          contextBuffer: {
            enabled: false,
          },
        },
      },
      lastEndFRame: lastFrame,
      driftCorrectionModel: {
        prompt: jest.fn(),
      },
      getDriftCorrectionConfig: Generator.prototype.getDriftCorrectionConfig,
      shouldApplyDriftCorrection: Generator.prototype.shouldApplyDriftCorrection,
      correctLastFrameForNextScene: jest.fn(),
    };

    const startFrame = await Generator.prototype.resolveChainedStartFrameFromLastEnd.call(
      context,
      {
        nextScenePlanEntry: {
          title: 'Transition scene',
          storyBeat: 'He turns toward the window.',
          videoMode: 'firstLast',
          frameSource: 'lastFrame',
        },
        nextSceneContext: { index: 4, total: 6, isFirst: false, isLast: false },
      }
    );

    expect(startFrame).toBe(lastFrame);
    expect(context.correctLastFrameForNextScene).not.toHaveBeenCalled();
    expect(context.driftCorrectionModel.prompt).not.toHaveBeenCalled();
  });

  test('keeps single-image drift correction active when selected cast context is skipped', async () => {
    const lastFrame = {
      image: { path: '/tmp/raw-last-frame.png' },
      json: { metadata: { prompt: 'previous shot prompt' } },
    };
    const correctedFrame = {
      image: { path: '/tmp/corrected-last-frame.png' },
      json: { metadata: { prompt: 'corrected room frame' } },
    };
    const context = {
      config: {
        driftCorrection: {
          enabled: true,
          applyToSingleImage: true,
        },
      },
      lastEndFRame: lastFrame,
      driftCorrectionModel: { prompt: jest.fn() },
      getDriftCorrectionConfig: Generator.prototype.getDriftCorrectionConfig,
      getCastContextConfig: () => ({ enabled: true }),
      shouldApplyDriftCorrection: Generator.prototype.shouldApplyDriftCorrection,
      correctLastFrameForNextScene: jest.fn().mockResolvedValue(correctedFrame),
    };

    const startFrame = await Generator.prototype.resolveChainedStartFrameFromLastEnd.call(context, {
      nextScenePlanEntry: {
        title: 'Cast returns',
        videoMode: 'singleImage',
        frameSource: 'lastFrame',
        castReferences: [{ referenceImage: '/tmp/cast-memory.jpg' }],
      },
    });

    expect(startFrame).toBe(correctedFrame);
    expect(context.correctLastFrameForNextScene).toHaveBeenCalledWith({
      lastFrame,
      nextScenePlanEntry: expect.objectContaining({
        videoMode: 'singleImage',
        frameSource: 'lastFrame',
      }),
      nextSceneContext: undefined,
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
      imageDir: tempDir,
      config: {
        driftCorrection: {
          enabled: true,
          applyToSingleImage: true,
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
        sceneLoop: {
          openingImage: {
            imagePath: screenshotPaths[7],
            continuityAnchor: 'Location: white wall room. Actor: bald man in dark jacket.',
          },
        },
      },
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
      getOpeningImageConfig: Generator.prototype.getOpeningImageConfig,
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
    const expectedSecondaryRefs = [screenshotPaths[7], screenshotPaths[8], ...expectedBuffer];
    expect(context.contextScreenshotBuffer).toEqual(expectedBuffer);
    expect(context.driftCorrectionModel.prompt).toHaveBeenCalledWith(
      expect.stringContaining('Canonical opening continuity: Location: white wall room. Actor: bald man in dark jacket.'),
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

  test('does not duplicate the last valid camera image when a running iteration reuses it', () => {
    const context = {
      contextScreenshotBuffer: ['/tmp/camera-1.jpg', '/tmp/camera-2.jpg'],
      trimContextScreenshotBuffer: Generator.prototype.trimContextScreenshotBuffer,
    };

    const result = Generator.prototype.pushContextScreenshotPath.call(
      context,
      '/tmp/camera-2.jpg',
      { maxSize: 10 }
    );

    expect(result).toEqual(['/tmp/camera-1.jpg', '/tmp/camera-2.jpg']);
  });
});
