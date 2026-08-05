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

test('selectWanMotionDirection uses compact video prompt, camera, and end result', () => {
  const selectedPrompt = selectWanMotionDirection({
    scenePlanEntry: {
      event: 'The monster sorts reflections into impossible aisles.',
      videoPrompt: 'Reflections slide sideways while the columns remain fixed.',
      consequence: 'Layered reflections remain trapped in the doors.',
      cameraCue: 'Hold wide, then rack focus from the mirrored column to the monster.',
    },
  });

  expect(selectedPrompt).toContain('Reflections slide sideways while the columns remain fixed.');
  expect(selectedPrompt).toContain('Camera: Hold wide, then rack focus from the mirrored column to the monster.');
  expect(selectedPrompt).toContain('End with this readable result: Layered reflections remain trapped in the doors.');
});

test('FLUX and WAN prompts replace source-language semantic terms with English translations', () => {
  const scenePlanEntry = {
    semanticAnchor: 'Kaufhaus',
    semanticAnchorEnglish: 'department store',
    semanticCollision: 'Betriebsform',
    semanticCollisionEnglish: 'operating form',
    stillPrompt: 'The Kaufhaus rejects its Betriebsform through warped lamps.',
    singleImagePrompt: 'Inside the Kaufhaus, Betriebsform bends the metal ducts.',
    semanticAction: 'The Betriebsform breaks open beside the Kaufhaus lamps.',
  };

  const fluxPrompt = selectFluxStillDirection({ scenePlanEntry });
  const wanPrompt = selectWanMotionDirection({ scenePlanEntry });

  expect(fluxPrompt).toContain('department store');
  expect(fluxPrompt).toContain('operating form');
  expect(wanPrompt).toContain('department store');
  expect(wanPrompt).toContain('operating form');
  expect(`${fluxPrompt} ${wanPrompt}`).not.toMatch(/Kaufhaus|Betriebsform/);
});

test('production prompts do not concatenate removed semantic fields', () => {
  const scenePlanEntry = {
    stillPrompt: 'Reflections collect inside elevator doors.',
    videoPrompt: 'Reflections peel upward and settle in the doors.',
    event: 'The monster stores moving reflections in elevator doors.',
    monsterPresence: 'Only its reflected hands are visible.',
    consequence: 'Layered reflections remain trapped in the doors.',
    cameraCue: 'Track from floor to doors after the reflections move.',
    semanticAction: 'Legacy field must not be appended.',
    monsterTactic: 'Legacy tactic must not be appended.',
  };

  const fluxPrompt = selectFluxStillDirection({ scenePlanEntry });
  const wanPrompt = selectWanMotionDirection({ scenePlanEntry });

  expect(fluxPrompt).toBe(scenePlanEntry.stillPrompt);
  expect(wanPrompt).toContain(scenePlanEntry.videoPrompt);
  expect(wanPrompt).toContain(scenePlanEntry.consequence);
  expect(`${fluxPrompt} ${wanPrompt}`).not.toContain(scenePlanEntry.semanticAction);
  expect(`${fluxPrompt} ${wanPrompt}`).not.toContain(scenePlanEntry.monsterTactic);
});
