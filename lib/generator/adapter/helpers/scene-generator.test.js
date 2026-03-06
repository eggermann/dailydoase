import { expect, test } from '@jest/globals';

import { getScenePlanEntry, parseScenePlan } from './scene-generator.js';

test('parseScenePlan parses JSON scene arrays', () => {
  const scenePlan = parseScenePlan(JSON.stringify([
    {
      title: 'Opening',
      beat: 'setup',
      stillPrompt: 'a hand holding a seedling',
      storyBeat: 'introduce the seedling',
      motionCue: 'slow pull back',
      cameraCue: 'gentle rise',
      freshImage: false,
    },
    {
      title: 'Middle',
      beat: 'development',
      stillPrompt: 'a classroom with sketches',
      storyBeat: 'move into a classroom',
      motionCue: 'glide forward',
      cameraCue: 'stable handheld',
      freshImage: true,
    },
  ]), 2);

  expect(scenePlan).toHaveLength(2);
  expect(scenePlan[0].index).toBe(1);
  expect(scenePlan[1].title).toBe('Middle');
  expect(scenePlan[1].freshImage).toBe(true);
});

test('getScenePlanEntry selects by sceneContext index', () => {
  const scenePlan = [
    { index: 1, title: 'Opening' },
    { index: 2, title: 'Middle' },
    { index: 3, title: 'Payoff' },
  ];

  expect(getScenePlanEntry(scenePlan, { index: 2 })).toEqual(scenePlan[1]);
});
