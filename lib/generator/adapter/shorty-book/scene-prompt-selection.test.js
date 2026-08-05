import { expect, test } from '@jest/globals';

import {
  assertMonsterFreePromptSafety,
  buildEnvironmentFluxPrompt,
  buildFluxPrompt,
  buildMonsterFluxPrompt,
  buildWanPrompt,
  enforceMonsterEntryStartFrame,
  needsMonsterIdentitySeed,
  selectFluxStillDirection,
  selectSceneStoryBeat,
  selectWanMotionDirection,
  shouldIncludeMonsterReference,
} from './scene-prompt-selection.js';

test('routes monster references from authoritative scene focus', () => {
  expect(shouldIncludeMonsterReference({
    sceneFocus: 'location',
    monsterPresence: 'not visible',
  })).toBe(false);
  expect(shouldIncludeMonsterReference({
    sceneFocus: 'monster',
    monsterPresence: 'visible near the elevator',
  })).toBe(true);
});

test('requires a fresh identity seed when the monster returns after a free scene', () => {
  expect(needsMonsterIdentitySeed({
    previousScene: { sceneFocus: 'trace', monsterPresence: 'absent' },
    scene: { sceneFocus: 'monster', monsterPresence: 'visible beside the elevator' },
  })).toBe(true);
  expect(needsMonsterIdentitySeed({
    previousScene: { sceneFocus: 'monster', monsterPresence: 'visible' },
    scene: { sceneFocus: 'mixed', monsterPresence: 'visible at the tills' },
  })).toBe(false);
});

test('forces a fresh canonical FLUX start when the monster enters', () => {
  const enforced = enforceMonsterEntryStartFrame({
    previousScene: { sceneFocus: 'location', monsterPresence: 'absent' },
    scene: { sceneFocus: 'monster', startFrameStrategy: 'rawLastFrame' },
    sceneIndex: 1,
  });

  expect(enforced).toMatchObject({
    startFrameStrategy: 'locationReanchor',
    frameSource: 'newImage',
    freshImage: true,
    monsterEntryMode: 'freshCanonicalFlux',
  });
});

test('builds an environment FLUX prompt without monster construction', () => {
  const prompt = buildEnvironmentFluxPrompt({
    scene: {
      sceneFocus: 'objects',
      stillPrompt: 'Elevator doors open and close in an impossible rhythm.',
      consequence: 'A queue of empty baskets moves by itself.',
    },
  });

  expect(prompt).toContain('Do not show the monster');
  expect(prompt).not.toMatch(/fresh scene-specific incarnation|newly constructed monster|physical mutation of the monster|rebuild at least one third/i);
});

test('builds a monster FLUX prompt only for visible monster focus', () => {
  const prompt = buildMonsterFluxPrompt({
    scene: {
      sceneFocus: 'monster',
      stillPrompt: 'The Green Monster leans over the elevator rail.',
      monsterPresence: 'visible near the elevator',
    },
    creatureRule: 'Use the separate Green Monster reference only for identity.',
  });

  expect(prompt).toContain('separate Green Monster reference only for identity');
  expect(prompt).toContain('exact same individual Green Monster');
  expect(prompt).toContain('not a similar green creature');
  expect(prompt).toContain('weathered practical sculpture');
  expect(prompt).not.toContain('at least eighty percent');
  expect(buildFluxPrompt({
    scene: { sceneFocus: 'trace', stillPrompt: 'Wet leaves cross the floor.' },
    creatureRule: 'monster identity must not leak',
  })).not.toContain('monster identity must not leak');
});

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
      sceneFocus: 'monster',
      videoPrompt: 'Travel toward the transformed destination.',
      singleImagePrompt: 'Animate the current frame.',
    },
    wasTransitionBeat: true,
  });

  expect(selectedPrompt).toContain('Travel toward the transformed destination.');
});

test('selectWanMotionDirection uses single-image WAN prompt for native scenes', () => {
  const selectedPrompt = selectWanMotionDirection({
    scenePlanEntry: {
      sceneFocus: 'monster',
      videoPrompt: 'First-last transition.',
      singleImagePrompt: 'Animate the current frame.',
    },
    wasTransitionBeat: false,
  });

  expect(selectedPrompt).toContain('Animate the current frame.');
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

test('WAN prevents a location-focused scene from introducing the monster', () => {
  const selectedPrompt = selectWanMotionDirection({
    scenePlanEntry: {
      sceneFocus: 'location',
      videoPrompt: 'The elevator opens into an empty lit corridor.',
    },
  });

  expect(selectedPrompt).toContain('Do not introduce, reveal, imply visually, construct, morph, transform');
  expect(selectedPrompt).toContain('Animate only subjects and objects already present in the start frame.');
});

test('WAN keeps a visible monster physically filmed rather than comic-styled', () => {
  const selectedPrompt = selectWanMotionDirection({
    scenePlanEntry: {
      sceneFocus: 'monster',
      videoPrompt: 'The monster crosses the aisle under flickering lamps.',
    },
  });

  expect(selectedPrompt).toContain('weathered practical sculpture');
  expect(selectedPrompt).toContain('no illustration, comic, cartoon');
});

test('monster-free WAN blocks arbitrary humanoid substitutes when people are disabled', () => {
  const prompt = buildWanPrompt({
    scene: { sceneFocus: 'objects', videoPrompt: 'The crates lock into place.' },
    allowPeople: false,
  });

  expect(prompt).toContain('No humans, humanoids, people-shaped forms, mannequins, statues, portraits, silhouettes');
});

test('monster-free provider safety rejects leaked person identity wording', () => {
  expect(() => assertMonsterFreePromptSafety({
    scene: { sceneFocus: 'location' },
    prompt: 'Keep the same real person from the saved webcam anchor image.',
  })).toThrow('Monster-free scene contains forbidden identity');
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
