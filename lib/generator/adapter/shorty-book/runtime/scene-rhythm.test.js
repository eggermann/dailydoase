import { describe, expect, test } from '@jest/globals';

import { createSceneRhythmController } from './scene-rhythm.js';

describe('scene rhythm controller', () => {
  test('uses configured initial takt pattern before regular takt values', () => {
    const rhythm = createSceneRhythmController({
      story: {
        count: null,
        lengths: [],
        words: [['love', 'en'], ['animal', 'en']],
        sceneCountMode: 'taktmuster',
        useTaktmusterLengths: true,
        sceneCountInitialPattern: [5],
        sceneCountTaktmusterCount: 2,
        sceneCountTaktmusterZaehler: 3,
        sceneCountTaktmusterNenner: 4,
        sceneCountTaktmusterType: 'balanced',
        sceneLengthTaktmusterTakt: 4,
        sceneLengthTaktmusterType: 'balanced',
        sceneCountBias: 0,
      },
      resolveSceneCountFromConfig: ({ defaultSceneCount }) => defaultSceneCount,
      resolveSemanticSceneCount: () => 2,
      resolveSceneLengthsInput: async (_source, sceneCount) => Array(sceneCount).fill(3),
    });

    expect(rhythm.resolveSceneCount()).toBe(5);
  });

  test('advances one scene-count step per iteration and applies the +1 offset', () => {
    const rhythm = createSceneRhythmController({
      story: {
        count: null,
        lengths: [],
        words: [['love', 'en']],
        sceneCountMode: 'taktmuster',
        useTaktmusterLengths: true,
        sceneCountInitialPattern: [],
        sceneCountTaktmusterCount: 2,
        sceneCountTaktmusterZaehler: 4,
        sceneCountTaktmusterNenner: 4,
        sceneCountTaktmusterType: 'balanced',
        sceneCountBias: 1,
      },
      resolveSceneCountFromConfig: ({ defaultSceneCount }) => defaultSceneCount,
      resolveSemanticSceneCount: () => 1,
      resolveSceneLengthsInput: async (_source, sceneCount) => Array(sceneCount).fill(3),
    });

    expect([
      rhythm.resolveSceneCount(),
      rhythm.resolveSceneCount(),
      rhythm.resolveSceneCount(),
      rhythm.resolveSceneCount(),
    ]).toEqual([5, 2, 3, 2]);
  });

  test('keeps takt mode authoritative even when a fixed count is present', () => {
    const rhythm = createSceneRhythmController({
      story: {
        count: 3,
        lengths: [3, 3, 3],
        sceneCountMode: 'taktmuster',
        useTaktmusterLengths: true,
        sceneCountInitialPattern: [2],
        sceneCountTaktmusterCount: 2,
        sceneCountTaktmusterZaehler: 4,
        sceneCountTaktmusterNenner: 4,
        sceneCountTaktmusterType: 'balanced',
        sceneCountBias: 1,
      },
      resolveSceneCountFromConfig: ({ defaultSceneCount }) => defaultSceneCount,
      resolveSemanticSceneCount: () => 3,
      resolveSceneLengthsInput: async (_source, sceneCount) => Array(sceneCount).fill(3),
    });

    expect(rhythm.resolveSceneCount()).toBe(3);
  });

  test('applies duration floor, multiplier, bias, and single-image cap in order', async () => {
    const rhythm = createSceneRhythmController({
      story: {
        mode: 'reference-image-actor',
        count: 2,
        lengths: [],
        useTaktmusterLengths: true,
        sceneCountInitialPattern: [],
        sceneCountTaktmusterCount: 2,
        sceneCountTaktmusterZaehler: 3,
        sceneCountTaktmusterNenner: 4,
        sceneCountTaktmusterType: 'balanced',
        sceneLengthTaktmusterTakt: 4,
        sceneLengthTaktmusterType: 'balanced',
        minSceneDurationSeconds: 2,
        sceneLengthMultiplier: 2,
        sceneLengthBias: 1,
        cameraSingleImageStabilityMaxDuration: 4,
        singleImageMaxDuration: 5,
      },
      resolveSceneCountFromConfig: ({ sceneCount }) => sceneCount,
      resolveSemanticSceneCount: () => 2,
      resolveSceneLengthsInput: async () => [1, 3],
    });

    await expect(rhythm.refreshResolvedSceneLengths(2)).resolves.toEqual([3, 7]);
    expect(rhythm.currentSceneDuration()).toBe(3);
    expect(rhythm.currentSingleImageDuration()).toBe(3);
    expect(rhythm.applyRequestedSceneDurations([
      { videoMode: 'singleImage', durationSeconds: 10 },
      { videoMode: 'firstLast', durationSeconds: 10 },
    ])).toEqual([
      { videoMode: 'singleImage', durationSeconds: 10, requestedDurationSeconds: 4 },
      { videoMode: 'firstLast', durationSeconds: 10, requestedDurationSeconds: 10 },
    ]);
  });
});
