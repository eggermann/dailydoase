import { expect, test } from '@jest/globals';

import {
  applyPlannedStartFrameStrategy,
  resolveConfiguredStartFrameStrategy,
  resolveSceneStartFrameStrategy,
  shouldDriftCorrectLastFrame,
  shouldGenerateLocationStartFrame,
} from './scene-start-strategy.js';

test('configured boundary strategies override the planner while middle scenes stay semantic', () => {
  const config = {
    firstSceneStrategy: 'locationReanchor',
    lastSceneStrategy: 'rawLastFrame',
  };

  expect(resolveConfiguredStartFrameStrategy({
    scene: { startFrameStrategy: 'driftCorrectedLastFrame' },
    sceneIndex: 0,
    sceneCount: 4,
    config,
  })).toBe('locationReanchor');
  expect(resolveConfiguredStartFrameStrategy({
    scene: { startFrameStrategy: 'driftCorrectedLastFrame' },
    sceneIndex: 2,
    sceneCount: 4,
    config,
  })).toBe('driftCorrectedLastFrame');
  expect(resolveConfiguredStartFrameStrategy({
    scene: { startFrameStrategy: 'locationReanchor' },
    sceneIndex: 3,
    sceneCount: 4,
    config,
  })).toBe('rawLastFrame');
});

test('resolveSceneStartFrameStrategy derives backward-compatible scene starts', () => {
  expect(resolveSceneStartFrameStrategy({}, 0)).toBe('locationReanchor');
  expect(resolveSceneStartFrameStrategy({ frameSource: 'newImage' }, 2)).toBe('locationReanchor');
  expect(resolveSceneStartFrameStrategy({ frameSource: 'lastFrame' }, 2)).toBe('rawLastFrame');
});

test('applyPlannedStartFrameStrategy maps location reanchor to a fresh image', () => {
  expect(applyPlannedStartFrameStrategy({
    startFrameStrategy: 'locationReanchor',
  }, 2)).toMatchObject({
    startFrameStrategy: 'locationReanchor',
    frameSource: 'newImage',
    freshImage: true,
    useCameraShot: true,
  });
});

test('applyPlannedStartFrameStrategy maps both continuity strategies to the last frame', () => {
  expect(applyPlannedStartFrameStrategy({
    startFrameStrategy: 'driftCorrectedLastFrame',
  }, 2)).toMatchObject({
    frameSource: 'lastFrame',
    freshImage: false,
    useCameraShot: false,
  });

  expect(applyPlannedStartFrameStrategy({
    startFrameStrategy: 'rawLastFrame',
  }, 2)).toMatchObject({
    frameSource: 'lastFrame',
    freshImage: false,
    useCameraShot: false,
  });
});

test('runtime helpers honor strategies only when planner control is enabled', () => {
  const driftScene = { startFrameStrategy: 'driftCorrectedLastFrame' };

  expect(shouldGenerateLocationStartFrame({
    scene: driftScene,
    plannerControlEnabled: true,
  })).toBe(false);
  expect(shouldDriftCorrectLastFrame({
    scene: driftScene,
    plannerControlEnabled: true,
  })).toBe(true);
  expect(shouldDriftCorrectLastFrame({
    scene: driftScene,
    plannerControlEnabled: false,
  })).toBeNull();
});
