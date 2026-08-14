import { expect, test } from '@jest/globals';

import {
  assertMonsterFreePromptSafety,
  buildEnvironmentFluxPrompt,
  buildFluxPrompt,
  buildMonsterFluxPrompt,
  buildWanPrompt,
  VIEWPOINT_MOTION_RULE,
  enforceMonsterEntryStartFrame,
  needsMonsterIdentitySeed,
  selectFluxStillDirection,
  selectSceneStoryBeat,
  selectWanMotionDirection,
  sanitizeCameraCue,
  sanitizeViewpointCue,
  shouldIncludeMonsterReference,
} from './scene-prompt-selection.js';

test('routes monster references from composed scene content, not focus alone', () => {
  expect(shouldIncludeMonsterReference({
    sceneFocus: 'location',
    monsterPresence: 'not visible',
  })).toBe(false);
  expect(shouldIncludeMonsterReference({
    sceneFocus: 'monster',
    monsterPresence: 'visible near the elevator',
  })).toBe(true);
  expect(shouldIncludeMonsterReference({
    sceneFocus: 'people',
    monsterPresence: 'visible among the shoppers',
    stillPrompt: 'The Green Monster and the shoppers exchange empty baskets.',
  })).toBe(true);
  expect(shouldIncludeMonsterReference({
    sceneFocus: 'mixed',
    monsterPresence: 'off-screen then partial — the head is revealed above the spill',
  })).toBe(true);
  expect(shouldIncludeMonsterReference({
    sceneFocus: 'trace',
    monsterPresence: 'hidden (off-frame)',
  })).toBe(false);
  expect(shouldIncludeMonsterReference({
    sceneFocus: 'mixed',
    monsterPresence: 'off-frame then partial — its silhouette appears in the mirror',
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
  expect(needsMonsterIdentitySeed({
    previousScene: { sceneFocus: 'trace', monsterPresence: 'hidden (off-frame)' },
    scene: { sceneFocus: 'mixed', monsterPresence: 'partially visible in reflection' },
  })).toBe(true);
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

  expect(prompt).toMatch(/^LIVE-ACTION PHOTOGRAPHY ONLY\./);
  expect(prompt).toContain('candid 1983 dark-fantasy production still');
  expect(prompt).toContain('full-scale practical effects');
  expect(prompt).toContain('physically accurate worn materials');
  expect(prompt).toContain('Arriflex 35 III');
  expect(prompt).toContain('heavy irregular 35mm grain');
  expect(prompt).toContain('No illustration, comic, anime');
  expect(prompt).toContain('modern digital sharpness');
  expect(prompt).toContain('Octane or Unreal Engine');
  expect(prompt).not.toContain('Do not show the monster');
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
  expect(prompt).toContain('canonical identity of this exact Green Monster');
  expect(prompt).toContain('only allowed monster identity is the exact supplied green botanical protagonist');
  expect(prompt).toContain('never redesign it as another species or generic creature');
  expect(prompt).toContain('foam-latex and silicone animatronic practical effect');
  expect(prompt).toContain('glass eyes');
  expect(prompt).toContain('practical sculpture physically present');
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

test('selectWanMotionDirection uses compact video prompt, viewpoint, and end result', () => {
  const selectedPrompt = selectWanMotionDirection({
    scenePlanEntry: {
      event: 'The monster sorts reflections into impossible aisles.',
      videoPrompt: 'Reflections slide sideways while the columns remain fixed.',
      consequence: 'Layered reflections remain trapped in the doors.',
      cameraCue: 'Hold wide, then rack focus from the mirrored column to the monster.',
    },
  });

  expect(selectedPrompt).toContain('Reflections slide sideways while the columns remain fixed.');
  expect(selectedPrompt).toContain('Viewpoint: Hold wide, then rack focus from the mirrored column to the monster.');
  expect(selectedPrompt).toContain('End state: Layered reflections remain trapped in the doors.');
});

test('WAN grounds a location-focused scene in subjects established by its start frame', () => {
  const selectedPrompt = selectWanMotionDirection({
    scenePlanEntry: {
      sceneFocus: 'location',
      videoPrompt: 'The elevator opens into an empty lit corridor.',
    },
  });

  expect(selectedPrompt).toContain('only subjects already established by the start frame');
  expect(selectedPrompt).not.toContain('No monster or substitute figure');
});

test('WAN preserves the exact already visible monster without repeating FLUX anatomy', () => {
  const selectedPrompt = selectWanMotionDirection({
    scenePlanEntry: {
      sceneFocus: 'monster',
      videoPrompt: 'The monster crosses the aisle under flickering lamps.',
    },
  });

  expect(selectedPrompt).toContain('exact canonical protagonist already visible');
  expect(selectedPrompt).not.toMatch(/amber eye|leaf ears|mouth tendril|weathered practical sculpture/i);
});

test('monster-free WAN blocks arbitrary humanoid substitutes when people are disabled', () => {
  const prompt = buildWanPrompt({
    scene: { sceneFocus: 'objects', videoPrompt: 'The crates lock into place.' },
    allowPeople: false,
  });

  expect(prompt).toContain('Do not introduce new living figures.');
});

test('viewpoint sanitizer removes acquisition language and unsafe motion', () => {
  expect(sanitizeCameraCue('smooth orbit around the column', { durationSeconds: 2 }))
    .toContain('viewpoint remains nearly fixed');
  expect(sanitizeCameraCue('drone descent through the hall', { durationSeconds: 4 }))
    .toContain('viewpoint makes one small restrained adjustment');
  expect(sanitizeViewpointCue('A handheld phone operator slowly pans right.', { durationSeconds: 3 }))
    .toBe('The viewpoint makes one small restrained adjustment.');
});

test('compact WAN prompt contains one viewpoint rule and no acquisition concepts', () => {
  const prompt = buildWanPrompt({
    scene: {
      sceneFocus: 'monster',
      durationSeconds: 2,
      videoPrompt: 'The visible monster turns toward a moving reflection.',
      cameraCue: 'The viewpoint pans slightly toward the mirrored column.',
      consequence: 'The reflection settles beside the elevator.',
    },
  });

  expect(prompt).toContain('The visible monster turns toward a moving reflection.');
  expect(prompt).toContain('Viewpoint: The viewpoint pans slightly toward the mirrored column.');
  expect(prompt).toContain(VIEWPOINT_MOTION_RULE);
  expect(prompt).toContain('Use one quick organic reframe or micro-sway');
  expect(prompt).toContain('fluorescent light fluctuate gently');
  expect(prompt).toContain('End state: The reflection settles beside the elevator.');
  expect(prompt).toContain('exact canonical protagonist already visible');
  expect(prompt).not.toMatch(/dusty matte concrete floor.*exposed ducts|amber eye|leaf ears|mouth tendril/i);
});

test('WAN prompt has no acquisition-device language', () => {
  const prompt = buildWanPrompt({
    scene: { sceneFocus: 'location', videoPrompt: 'The elevator doors close.' },
  });

  expect(prompt).toContain('Viewpoint:');
  expect(prompt).not.toMatch(/phone|handheld|operator|recording|filming|viewfinder|selfie|hands holding|mobile device/i);
});

test('monster-free provider safety rejects leaked person identity wording', () => {
  expect(() => assertMonsterFreePromptSafety({
    scene: { sceneFocus: 'location' },
    prompt: 'Keep the same real person from the saved webcam anchor image.',
  })).toThrow('Monster-free scene contains forbidden identity');
});

test('FLUX and WAN prompts preserve source-language Semantic Stream terms inside English prose', () => {
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

  expect(fluxPrompt).toContain('Kaufhaus');
  expect(fluxPrompt).toContain('Betriebsform');
  expect(wanPrompt).toContain('Kaufhaus');
  expect(wanPrompt).toContain('Betriebsform');
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

test('WAN prompt ignores previous prompts, rejection messages, and moderation explanations', () => {
  const scene = {
    sceneFocus: 'location',
    durationSeconds: 2,
    videoPrompt: 'A reflected light line moves once across the floor.',
    cameraCue: 'The viewpoint remains nearly fixed.',
    consequence: 'The light settles beside the elevator.',
    previousFluxPrompt: 'FULL PREVIOUS FLUX PROMPT',
    previousWanPrompt: 'FULL PREVIOUS WAN PROMPT',
    rejectionMessage: 'Die Ablehnung passt zum Sicherheitsinhalt.',
    moderationExplanation: 'policy violation category',
    visionStoryContext: 'complete cumulative story transcript',
  };
  const prompt = buildWanPrompt({ scene });

  expect(prompt).toContain(scene.videoPrompt);
  expect(prompt).not.toMatch(/FULL PREVIOUS|Die Ablehnung|policy violation|cumulative story transcript/);
});
