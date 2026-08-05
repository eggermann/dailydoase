import { afterEach, describe, expect, jest, test } from '@jest/globals';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';

import Generator, {
  capVideoDurationForBackend,
  compactFluxPromptForProvider,
  resolveRequestedDurationOption,
  restorePreviousMovieLastFrame,
} from '../shorty-book/generator.js';

const createTempDir = async () => fs.mkdtemp(path.join(os.tmpdir(), 'dailydoase-shorty-book-'));

test('compactFluxPromptForProvider preserves the semantic chain below provider limit', () => {
  const scenePlanEntry = {
    semanticAnchor: 'exhibition',
    semanticCollision: 'hunger',
    inheritedConsequence: 'A line of extinguished lamps reaches the elevator.',
    semanticCollisionPhysicalization: 'The monster removes glowing filaments from each lamp.',
    monsterTactic: 'It stores each filament inside its ribs.',
    semanticAction: 'Its tendrils pull filaments from the ceiling lamps.',
    offscreenMonsterAction: 'It removes the next filament after the camera turns away.',
    visibleEvidenceOfAgency: 'The next lamp extinguishes outside direct focus.',
    monsterPresence: 'Only its tendrils cross the upper frame.',
    localConsequence: 'A longer path of extinguished lamps remains.',
    stillPrompt: 'The real Kaufhaus contains a dark lamp route above one green monster.',
  };
  const compacted = compactFluxPromptForProvider({
    prompt: 'Duplicated production prose. '.repeat(300),
    scenePlanEntry,
  });

  expect(compacted.length).toBeLessThanOrEqual(2950);
  for (const value of Object.values(scenePlanEntry)) {
    expect(compacted).toContain(value);
  }
  expect(compacted).toContain('Preserve the exact Kaufhaus camera viewpoint');
});

test('compactFluxPromptForProvider uses English terms instead of source-language words', () => {
  const compacted = compactFluxPromptForProvider({
    prompt: 'Duplicated production prose. '.repeat(300),
    scenePlanEntry: {
      semanticAnchor: 'Kaufhaus',
      semanticAnchorEnglish: 'department store',
      semanticCollision: 'Rolltreppe',
      semanticCollisionEnglish: 'escalator',
      semanticCollisionPhysicalization: 'The escalator steps fold into a moving wall.',
    },
  });

  expect(compacted).toContain('Inherited semantic anchor: department store');
  expect(compacted).toContain('Fresh semantic collision: escalator');
  expect(compacted).not.toContain('Inherited semantic anchor: Kaufhaus');
  expect(compacted).not.toContain('Fresh semantic collision: Rolltreppe');
});

test('compactFluxPromptForProvider replaces leaked source-language terms in semantic prose', () => {
  const compacted = compactFluxPromptForProvider({
    prompt: 'Duplicated production prose. '.repeat(300),
    scenePlanEntry: {
      semanticAnchor: 'Kaufhaus',
      semanticAnchorEnglish: 'department store',
      semanticCollision: 'Betriebsform',
      semanticCollisionEnglish: 'operating form',
      semanticCollisionPhysicalization: 'Betriebsform bends the Kaufhaus ducts.',
      stillPrompt: 'Kaufhaus lamps fail under the Betriebsform.',
    },
  });

  expect(compacted).toContain('operating form bends the department store ducts');
  expect(compacted).not.toMatch(/Betriebsform|Kaufhaus/);
});

test('compactFluxPromptForProvider translates a provider-ready prompt without compaction', () => {
  const compacted = compactFluxPromptForProvider({
    prompt: 'The Kaufhaus lamps collapse under the Betriebsform.',
    scenePlanEntry: {
      semanticAnchor: 'Kaufhaus',
      semanticAnchorEnglish: 'department store',
      semanticCollision: 'Betriebsform',
      semanticCollisionEnglish: 'operating form',
    },
  });

  expect(compacted).toBe('The department store lamps collapse under the operating form.');
});

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

  test('captures updated persona reference screenshots asynchronously after a scene', async () => {
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
    expect(context.scheduleAsyncPersonaReferenceCapture).toHaveBeenCalledWith(
      expect.objectContaining({ index: 2 }),
      expect.objectContaining({ forceByBeat: false })
    );
  });
});

describe('Generator.generateSceneClip', () => {
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

describe('Generator.promptSceneImagesOnly', () => {
  let tempDir = '';

  afterEach(async () => {
    if (tempDir) {
      await fs.remove(tempDir);
      tempDir = '';
    }
  });

  test('saves every scene from one run in the shared image-only folder', async () => {
    tempDir = await createTempDir();
    const firstGeneratedImage = path.join(tempDir, 'generated-first.png');
    const secondGeneratedImage = path.join(tempDir, 'generated-second.png');
    await fs.writeFile(firstGeneratedImage, 'first-scene');
    await fs.writeFile(secondGeneratedImage, 'second-scene');

    const context = {
      imageDir: tempDir,
      generateSceneContextFluxFrame: jest.fn()
        .mockResolvedValueOnce({ image: { path: firstGeneratedImage } })
        .mockResolvedValueOnce({ image: { path: secondGeneratedImage } }),
    };
    const scenePlan = [
      {
        title: 'First collision',
        storyBeat: 'The display window remembers rain.',
        startFrameStrategy: 'locationReanchor',
        stillPrompt: 'A wet retail memory under hard fluorescent light.',
        semanticDerivation: {
          anchorContribution: 'The display protects its objects.',
          collisionContribution: 'Rain enters every opening.',
          contradiction: 'Protection requires an opening to remain exposed.',
          physicalization: 'Rain runs upward across the display window.',
          causalResult: 'A wet route remains across the glass.',
        },
        semanticAnchorEnglish: 'exhibition',
        semanticCollisionEnglish: 'rain',
        tensionCause: 'The wet route advances toward the sealed display.',
        consequenceId: 'scene-01-wet-route',
        inheritsConsequenceId: '',
        clueSource: 'consequence',
        offscreenMonsterAction: 'The monster redirects rain outside direct view.',
        visibleEvidenceOfAgency: 'Droplets reverse direction after the camera turns away.',
      },
      {
        title: 'Second collision',
        storyBeat: 'The escalator carries an impossible shadow.',
        startFrameStrategy: 'driftCorrectedLastFrame',
        stillPrompt: 'An impossible shadow crosses the real Kaufhaus.',
      },
    ];

    await Generator.prototype.promptSceneImagesOnly.call(context, {
      image: { width: 1280, height: 720 },
      sceneLoop: {
        imageOnly: { enabled: true, runIndex: 2 },
        scenePlan,
      },
    }, 'image-only-test');

    const outputDir = path.join(tempDir, 'parts', 'image-only-scenes');
    await expect(fs.readFile(path.join(outputDir, 'run-02-scene-01.png'), 'utf8'))
      .resolves.toBe('first-scene');
    await expect(fs.readFile(path.join(outputDir, 'run-02-scene-02.png'), 'utf8'))
      .resolves.toBe('second-scene');

    const summary = await fs.readJson(path.join(outputDir, 'run-02-summary.json'));
    expect(summary).toEqual(expect.objectContaining({
      mode: 'image-only',
      runIndex: 2,
      requestName: 'image-only-test',
    }));
    expect(summary.scenes).toHaveLength(2);
    expect(summary.scenes[0]).toMatchObject({
      semanticDerivation: scenePlan[0].semanticDerivation,
      semanticAnchorEnglish: 'exhibition',
      semanticCollisionEnglish: 'rain',
      tensionCause: scenePlan[0].tensionCause,
      consequenceId: scenePlan[0].consequenceId,
      inheritsConsequenceId: '',
      clueSource: 'consequence',
      offscreenMonsterAction: scenePlan[0].offscreenMonsterAction,
      visibleEvidenceOfAgency: scenePlan[0].visibleEvidenceOfAgency,
    });
    expect(context.generateSceneContextFluxFrame).toHaveBeenCalledTimes(2);
    expect(context.generateSceneContextFluxFrame).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        contextImageOverride: null,
        protagonistAlreadyCompositedOverride: undefined,
      })
    );
    expect(context.generateSceneContextFluxFrame).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        contextImageOverride: {
          path: path.join(outputDir, 'run-02-scene-01.png'),
        },
        protagonistAlreadyCompositedOverride: true,
      })
    );
    expect(summary.scenes[1].semanticSourceMode).toBe('previousSceneImage');

    const retriedSecondImage = path.join(tempDir, 'retried-second.png');
    await fs.writeFile(retriedSecondImage, 'retried-second-scene');
    context.generateSceneContextFluxFrame.mockResolvedValueOnce({
      image: { path: retriedSecondImage },
    });
    await Generator.prototype.promptSceneImagesOnly.call(context, {
      image: { width: 1280, height: 720 },
      sceneLoop: {
        imageOnly: {
          enabled: true,
          runIndex: 2,
          sceneNumberOffset: 1,
          previousScenePath: path.join(outputDir, 'run-02-scene-01.png'),
        },
        scenePlan: [scenePlan[1]],
      },
    }, 'image-only-retry');

    const retriedSummary = await fs.readJson(path.join(outputDir, 'run-02-summary.json'));
    expect(retriedSummary.scenes.map((scene) => scene.sceneIndex)).toEqual([1, 2]);
    await expect(fs.readFile(path.join(outputDir, 'run-02-scene-02.png'), 'utf8'))
      .resolves.toBe('retried-second-scene');
  });
});

describe('Generator.buildSceneContextFluxPrompt', () => {
  test('uses translated semantic-stream terms in production prompts', () => {
    const context = {
      getOpeningImageConfig: () => ({}),
      getSceneContextImageConfig: () => ({
        allowPeople: false,
        protagonistAlreadyComposited: false,
        protagonistReferenceMode: 'promptOnly',
      }),
      buildPersonaReferenceIdentityClause: () => '',
    };
    const prompt = Generator.prototype.buildSceneContextFluxPrompt.call(context, {
      scenePlanEntry: {
        semanticAnchor: 'Kaufhaus',
        semanticAnchorEnglish: 'department store',
        semanticCollision: 'Rolltreppe',
        semanticCollisionEnglish: 'escalator',
        stillPrompt: 'The escalator steps fold into a moving wall.',
      },
    });

    expect(prompt).toContain('Semantic Anchor: department store.');
    expect(prompt).toContain('Semantic Collision: escalator.');
    expect(prompt).not.toContain('Semantic Collision: Rolltreppe.');
  });

  test('keeps the Kaufhaus recognizable while semantic words visibly mutate the scene', () => {
    const context = {
      getOpeningImageConfig: () => ({
        continuityVisionText: 'isolated green monster with amber eyes',
      }),
      getSceneContextImageConfig: () => ({
        allowPeople: false,
        lockActorCount: true,
        protagonistAlreadyComposited: true,
      }),
      buildPersonaReferenceIdentityClause: () => 'Preserve the exact Green Monster identity.',
    };

    const prompt = Generator.prototype.buildSceneContextFluxPrompt.call(context, {
      scenePlanEntry: {
        semanticCue: 'Anchor (initial configured term): 1983. Collision A (fresh getNext from 1983): NATO-Doppelbeschluss. Dramatic function: opening.',
        stillPrompt: 'The monster bends fluorescent light into rigid shards.',
        storyBeat: 'The lamps fracture around the monster.',
      },
      sceneContext: { index: 2, total: 6 },
      contextImage: { path: '/tmp/location-elevators.jpeg' },
    });

    expect(prompt).toContain('Keep the real Kaufhaus unmistakably recognizable');
    expect(prompt).toContain('only protagonist and only living figure');
    expect(prompt).toContain('no humanoid sculpture');
    expect(prompt).toContain('Semantic Anchor: 1983.');
    expect(prompt).toContain('Semantic Collision: NATO-Doppelbeschluss.');
    expect(prompt).toContain('Preserve at least eighty percent of the visible room unchanged');
    expect(prompt).toContain('nearest overhead lamps, and nearby floor reflections or shadows');
    expect(prompt).toContain('The untouched Kaufhaus photograph remains the dominant image');
    expect(prompt).not.toContain('Visual realization:');
  });

  test('constructs a fresh semantic monster from separate location and identity references', () => {
    const context = {
      getOpeningImageConfig: () => ({}),
      getSceneContextImageConfig: () => ({
        allowPeople: false,
        lockActorCount: true,
        protagonistAlreadyComposited: false,
        protagonistReferenceMode: 'promptOnly',
      }),
      buildPersonaReferenceIdentityClause: () => '',
    };

    const prompt = Generator.prototype.buildSceneContextFluxPrompt.call(context, {
      scenePlanEntry: {
        semanticCue: 'Anchor (initial configured term): 1983. Collision A (fresh getNext from 1983): NATO-Doppelbeschluss. Dramatic function: opening.',
        stillPrompt: 'One Green Monster fractures nearby lamps.',
        storyBeat: 'The monster translates political rigidity into broken light.',
      },
      sceneContext: { index: 1, total: 6 },
      contextImage: { path: '/tmp/raw-kaufhaus.jpeg' },
    });

    expect(prompt).toContain('Semantic Anchor: 1983.');
    expect(prompt).toContain('Semantic Collision: NATO-Doppelbeschluss.');
    expect(prompt).toContain('exactly one fresh scene-specific incarnation');
    expect(prompt).toContain('visibly rebuild its pose, silhouette, branching anatomy');
    expect(prompt).toContain('not merely a decorative glow or unchanged reference cutout');
    expect(prompt).toContain('Build identity from the realistic Green Monster vocabulary');
    expect(prompt).toContain('without reproducing one fixed silhouette');
    expect(prompt).toContain('Never create a generic dark warehouse or fantasy interior');
    expect(prompt).toContain('The untouched raw Kaufhaus photograph must remain the dominant image');
    expect(prompt).not.toContain('Still image direction:');
  });
});

describe('Generator.buildSceneContextSemanticReconstructionPrompt', () => {
  test('requires semantic body mutation while preserving the photographed room', () => {
    const prompt = Generator.prototype.buildSceneContextSemanticReconstructionPrompt({
      scenePlanEntry: {
        semanticCue: 'Anchor (initial configured term): 1983. Collision A (fresh getNext from 1983): NATO-Doppelbeschluss. Dramatic function: opening.',
        storyBeat: 'The monster fractures the nearest lamps into rigid shards.',
        stillPrompt: 'The monster twists as three attached lamps shatter into rigid shards.',
      },
      sceneContext: { index: 1, total: 6 },
    });

    expect(prompt).toContain('Semantic Anchor: 1983.');
    expect(prompt).toContain('Semantic Collision: NATO-Doppelbeschluss.');
    expect(prompt).toContain('visibly change its pose, silhouette, branching anatomy');
    expect(prompt).toContain('one visible consequence in a nearby lamp');
    expect(prompt).toContain('at least eighty percent of the visible room');
    expect(prompt).toContain('Required visible subject action:');
  });
});

describe('Generator.shouldApplyDriftCorrection', () => {
  const decide = (strategy) => Generator.prototype.shouldApplyDriftCorrection.call({
    driftCorrectionModel: {},
    getDriftCorrectionConfig: () => ({
      enabled: true,
      plannerControlled: true,
      applyToSingleImage: true,
    }),
  }, {
    nextScenePlanEntry: {
      videoMode: 'singleImage',
      frameSource: 'lastFrame',
      startFrameStrategy: strategy,
    },
    nextSceneContext: { index: 2 },
  });

  test('runs image-to-image repair only for the planned drift strategy', () => {
    expect(decide('driftCorrectedLastFrame')).toBe(true);
    expect(decide('rawLastFrame')).toBe(false);
    expect(decide('locationReanchor')).toBe(false);
  });
});

describe('Generator.resolveChainedStartFrameFromLastEnd', () => {
  test('continues unchanged when no previous end frame exists', async () => {
    const analyzeFrame = jest.fn();
    const context = {
      lastEndFRame: null,
      config: {
        sceneLoop: {
          endFrameAnalysis: {
            enabled: true,
            analyzeFrame,
          },
        },
      },
      getEndFrameAnalysisConfig: Generator.prototype.getEndFrameAnalysisConfig,
      analyzeLastFrameForNextScene: Generator.prototype.analyzeLastFrameForNextScene,
      shouldApplyDriftCorrection: jest.fn(),
    };

    const startFrame = await Generator.prototype.resolveChainedStartFrameFromLastEnd.call(
      context,
      {
        nextScenePlanEntry: { title: 'Next scene' },
        nextSceneContext: { index: 2, total: 6 },
      }
    );

    expect(startFrame).toBeNull();
    expect(analyzeFrame).not.toHaveBeenCalled();
  });

  test('adds visible end-frame continuity before the next raw-last-frame scene', async () => {
    const lastFrame = {
      image: { path: '/tmp/raw-last-frame.png' },
      json: { metadata: { prompt: 'previous shot prompt' } },
    };
    const analyzeFrame = jest.fn().mockResolvedValue([
      'Subject: Green Monster with amber eyes and piston tendrils.',
      'Setting: old Kaufhaus floor.',
      'Framing: centered wide shot.',
      'Lighting: cold fluorescent ceiling lamps.',
      'Continuity: preserve the piston tendrils, gears, and room geometry.',
    ].join(' '));
    const context = {
      lastEndFRame: lastFrame,
      config: {
        driftCorrection: { enabled: false },
        sceneLoop: {
          endFrameAnalysis: {
            enabled: true,
            analyzeFrame,
          },
        },
      },
      getDriftCorrectionConfig: Generator.prototype.getDriftCorrectionConfig,
      getEndFrameAnalysisConfig: Generator.prototype.getEndFrameAnalysisConfig,
      buildEndFrameAnalysisPrompt: Generator.prototype.buildEndFrameAnalysisPrompt,
      analyzeLastFrameForNextScene: Generator.prototype.analyzeLastFrameForNextScene,
      shouldApplyDriftCorrection: Generator.prototype.shouldApplyDriftCorrection,
      correctLastFrameForNextScene: jest.fn(),
    };

    const startFrame = await Generator.prototype.resolveChainedStartFrameFromLastEnd.call(
      context,
      {
        nextScenePlanEntry: { title: 'Betriebsform', storyBeat: 'Tendrils become pistons.' },
        nextSceneContext: { index: 2, total: 6 },
      }
    );

    expect(analyzeFrame).toHaveBeenCalledWith(
      lastFrame,
      expect.objectContaining({ prompt: expect.stringContaining('Betriebsform') })
    );
    expect(startFrame).toMatchObject({
      image: { path: '/tmp/raw-last-frame.png' },
      json: {
        metadata: {
          endFrameAnalysisForScene: '2',
          endFrameContinuity: expect.stringContaining('piston tendrils'),
        },
      },
    });
    expect(context.correctLastFrameForNextScene).not.toHaveBeenCalled();
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
});
