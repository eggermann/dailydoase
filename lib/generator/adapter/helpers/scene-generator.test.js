import { expect, test } from '@jest/globals';

import {
  getScenePlanEntry,
  parseScenePlan,
  resolveSceneCountFromConfig,
  resolveSceneLengthsInput,
} from './scene-generator.js';

test('parseScenePlan parses JSON scene objects with scenes arrays', () => {
  const scenePlan = parseScenePlan(JSON.stringify({
    scenes: [
      {
        title: 'Opening',
        beat: 'setup',
        stillPrompt: 'a hand holding a seedling',
        imageDescription: 'close-up hand holding a seedling in warm light',
        storyBeat: 'introduce the seedling',
        motionCue: 'slow pull back',
        cameraCue: 'gentle rise',
        frameSource: 'lastFrame',
        videoMode: 'singleImage',
        durationSeconds: 1,
        videoPrompt: 'Move from the opening frame into a brighter workshop reveal.',
        singleImagePrompt: 'Subtle motion from the current frame with a gentle rise.',
        freshImage: false,
        useCameraShot: false,
      },
      {
        title: 'Middle',
        beat: 'development',
        stillPrompt: 'a classroom with sketches',
        imageDescription: 'students in a bright classroom examining sketches',
        storyBeat: 'move into a classroom',
        motionCue: 'glide forward',
        cameraCue: 'stable handheld',
        frameSource: 'newImage',
        videoMode: 'firstLast',
        durationSeconds: 2,
        videoPrompt: 'Move from the classroom into a clear destination reveal.',
        singleImagePrompt: 'Begin in the classroom and add restrained forward motion.',
        freshImage: true,
        useCameraShot: false,
      },
    ],
  }), 2);

  expect(scenePlan).toHaveLength(2);
  expect(scenePlan[0].index).toBe(1);
  expect(scenePlan[1].title).toBe('Middle');
  expect(scenePlan[1].freshImage).toBe(true);
  expect(scenePlan[1].frameSource).toBe('newImage');
  expect(scenePlan[1].videoMode).toBe('firstLast');
  expect(scenePlan[1].durationSeconds).toBe(2);
  expect(scenePlan[1].videoPrompt.length).toBeGreaterThan(0);
  expect(scenePlan[1].singleImagePrompt.length).toBeGreaterThan(0);
});

test('getScenePlanEntry selects by sceneContext index', () => {
  const scenePlan = [
    { index: 1, title: 'Opening' },
    { index: 2, title: 'Middle' },
    { index: 3, title: 'Payoff' },
  ];

  expect(getScenePlanEntry(scenePlan, { index: 2 })).toEqual(scenePlan[1]);
});

test('resolveSceneCountFromConfig uses sceneLengths length when no explicit scene count is set', () => {
  expect(resolveSceneCountFromConfig({
    sceneLengths: [3, 3, 3],
    defaultSceneCount: 6,
  })).toBe(3);
});

test('resolveSceneCountFromConfig prefers explicit scene count over sceneLengths length', () => {
  expect(resolveSceneCountFromConfig({
    sceneLengths: [3, 3, 3],
    sceneCount: 5,
    defaultSceneCount: 6,
  })).toBe(5);
});

test('resolveSceneLengthsInput accepts function results like tm.getNext()', async () => {
  let step = 0;
  const sceneLengths = await resolveSceneLengthsInput(() => {
    const values = [
      { timeoutMillis: 625 },
      { timeoutMillis: 1400 },
      { durationSeconds: 2 },
    ];
    const value = values[step];
    step += 1;
    return value;
  }, 3, 3);

  expect(sceneLengths).toEqual([1, 1, 2]);
});
