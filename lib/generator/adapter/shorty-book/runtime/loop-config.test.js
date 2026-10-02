import { describe, expect, test } from '@jest/globals';

import { createSceneLoopConfig } from './loop-config.js';

const createConfig = () => ({
  story: {
    chainFromPreviousLoopLastFrame: true,
    restartFromPreviousMovieLastFrame: true,
    mireloMode: 'off',
    audioAdapter: 'minimax',
    addSelfieOpener: false,
    concatTrimLeadingSeconds: 0,
    firstClipVideoMode: 'singleImage',
    mode: 'reference-image-actor',
    realityIntrusionMode: 'off',
    useLocationContinuityForDriftCorrection: false,
  },
  render: {
    openingStart: { enabled: false, mode: 'off', interval: 1, model: {} },
    castContext: { enabled: true, timeoutMs: 1000, model: {} },
  },
  camera: { imagePath: '' },
});

const createOptions = (selfomatEnabled) => ({
  config: createConfig(),
  imageOnly: false,
  dryRun: false,
  selfomatEnabled,
  resolveSceneCount: () => 3,
  resolveLaterClipSingleImageMode: false,
  isReferenceImageActorMode: () => false,
  resolveRunningIterationCameraShot: async () => ({ imagePath: '' }),
  useWebcamPersonaReference: false,
  captureBestPersonaReferenceShot: async () => '',
});

describe('createSceneLoopConfig', () => {
  test('starts every Selfomat iteration from its new opening selfie', () => {
    const options = createOptions(true);
    options.config.story.addSelfieOpener = true;
    const sceneLoop = createSceneLoopConfig(options);

    expect(sceneLoop.startEveryIterationFromOpeningImage).toBe(true);
    expect(sceneLoop.addSelfieOpener).toBe(true);
    expect(sceneLoop.chainFromPreviousLoopLastFrame).toBe(false);
    expect(sceneLoop.restartFromPreviousMovieLastFrame).toBe(false);
  });

  test('keeps explicit previous-frame chaining available for non-Selfomat runs', () => {
    const sceneLoop = createSceneLoopConfig(createOptions(false));

    expect(sceneLoop.startEveryIterationFromOpeningImage).toBe(false);
    expect(sceneLoop.addSelfieOpener).toBe(false);
    expect(sceneLoop.chainFromPreviousLoopLastFrame).toBe(true);
    expect(sceneLoop.restartFromPreviousMovieLastFrame).toBe(true);
  });
});
