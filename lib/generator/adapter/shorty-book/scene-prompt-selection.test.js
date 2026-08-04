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

test('selectWanMotionDirection keeps the semantic action and planned camera behavior explicit', () => {
  const selectedPrompt = selectWanMotionDirection({
    scenePlanEntry: {
      singleImagePrompt: 'Animate the recognizable Kaufhaus location.',
      semanticAction: 'The monster sorts reflections into impossible aisles.',
      motionCue: 'Reflections slide sideways while the columns remain fixed.',
      cameraCue: 'Hold wide, then rack focus from the mirrored column to the monster.',
    },
  });

  expect(selectedPrompt).toContain('The monster sorts reflections into impossible aisles.');
  expect(selectedPrompt).toContain('Physical motion: Reflections slide sideways while the columns remain fixed.');
  expect(selectedPrompt).toContain('Camera behavior: Hold wide, then rack focus from the mirrored column to the monster.');
});
