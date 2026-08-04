import { expect, test } from '@jest/globals';

import {
  selectFluxStillDirection,
  selectSceneStoryBeat,
  selectWanMotionDirection,
} from './scene-prompt-selection.js';

test('selectFluxStillDirection prefers the dedicated FLUX still prompt', () => {
  const selectedPrompt = selectFluxStillDirection({
    scenePlanEntry: {
      stillPrompt: 'Complete still image direction.',
      imageDescription: 'Plain image description.',
      singleImagePrompt: 'WAN motion direction.',
    },
  });

  expect(selectedPrompt).toBe('Complete still image direction.');
});

test('selectFluxStillDirection supports legacy scene plans in documented order', () => {
  const selectedPrompt = selectFluxStillDirection({
    scenePlanEntry: {
      singleImagePrompt: 'Legacy WAN prompt used as image fallback.',
      videoPrompt: 'Older video fallback.',
    },
    primarySourceCue: 'Semantic cue fallback.',
  });

  expect(selectedPrompt).toBe('Legacy WAN prompt used as image fallback.');
});

test('selectSceneStoryBeat prefers planned story over contextual fallbacks', () => {
  const selectedBeat = selectSceneStoryBeat({
    scenePlanEntry: {
      storyBeat: 'The archive wakes.',
      beat: 'Archive.',
    },
    sceneContext: { storyBeat: 'Context fallback.' },
    primarySourceCue: 'Semantic fallback.',
  });

  expect(selectedBeat).toBe('The archive wakes.');
});

test('selectWanMotionDirection preserves converted transition movement', () => {
  const selectedPrompt = selectWanMotionDirection({
    scenePlanEntry: {
      videoPrompt: 'Travel toward the transformed destination.',
      singleImagePrompt: 'Animate the current frame.',
    },
    wasTransitionBeat: true,
  });

  expect(selectedPrompt).toBe('Travel toward the transformed destination.');
});

test('selectWanMotionDirection uses single-image WAN prompt for native scenes', () => {
  const selectedPrompt = selectWanMotionDirection({
    scenePlanEntry: {
      videoPrompt: 'First-last transition.',
      singleImagePrompt: 'Animate the current frame.',
    },
    wasTransitionBeat: false,
  });

  expect(selectedPrompt).toBe('Animate the current frame.');
});
