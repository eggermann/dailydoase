import { expect, test } from '@jest/globals';

import {
  compileFluxEditPrompt,
  compileWanMotionPrompt,
  fitPromptSections,
  normalizeSceneAppearance,
  resolveModelPromptLimit,
} from './visual-prompt-compiler.js';

const REFLECTION_SCENE = {
  title: 'Reflection Catches a Star',
  storyBeat: 'An archival actress appears in the visitor glasses.',
  actorAction: 'The visitor raises his hand and leans toward the window.',
  locationAction: 'Window glare moves across his glasses.',
  motionCue: 'Slow restrained head and hand movement.',
  cameraCue: 'Fixed webcam.',
  appearance: {
    subject: 'a photographic woman',
    mode: 'reflection',
    surface: 'both eyeglass lenses',
    integration: [
      'follow lens curvature',
      'remain partly hidden by the glasses frame',
      'share room glare',
    ],
  },
};

test('passes explicit appearance details through without a mode', () => {
  expect(normalizeSceneAppearance(REFLECTION_SCENE.appearance, REFLECTION_SCENE)).toEqual(expect.objectContaining({
    subject: 'a photographic woman',
    surface: 'both eyeglass lenses',
  }));

  expect(normalizeSceneAppearance({}, {
    storyEvent: 'An archival close-up maps into the man glasses via a window reflection.',
  })).toEqual(expect.objectContaining({
    subject: '',
    surface: '',
  }));
});

test('compiles FLUX as current state plus visible delta without previous WAN prose', () => {
  const result = compileFluxEditPrompt({
    scene: REFLECTION_SCENE,
    currentState: 'The current WAN end frame is composition truth.',
    model: 'runware:106@1',
    referenceRoles: [
      { role: 'current frame / composition truth' },
      { role: 'identity truth' },
      { role: 'original room truth' },
    ],
  });

  expect(result.prompt).toContain('EDIT INTENT');
  expect(result.prompt).toContain('both eyeglass lenses');
  expect(result.prompt).toContain('follow lens curvature');
  expect(result.prompt).not.toContain('previous WAN prompt');
  expect(result.length).toBeLessThanOrEqual(3000);
});

test('words in scene prose never create visual instructions', () => {
  const result = compileFluxEditPrompt({
    scene: {
      storyEvent: 'A single archival close-up appears in the man glasses via a window reflection.',
      actorAction: 'The man leans toward the glass.',
    },
    currentState: 'Current webcam frame is visual truth.',
  });

  expect(result.appearance).toEqual({ subject: '', surface: '', integration: [] });
  expect(result.prompt).not.toContain('eyeglass lenses');
});

test('compiles WAN as motion without scene title or story explanation', () => {
  const result = compileWanMotionPrompt({ scene: REFLECTION_SCENE });

  expect(result.prompt).toContain('SUBJECT MOTION');
  expect(result.prompt).toContain('a photographic woman is visibly present at both eyeglass lenses');
  expect(result.prompt).toContain('Fixed webcam');
  expect(result.prompt).not.toContain('Reflection Catches a Star');
  expect(result.prompt).not.toContain('archival actress appears');
  expect(result.length).toBeLessThanOrEqual(1500);
});

test('uses model-specific limits', () => {
  expect(resolveModelPromptLimit('runware:106@1')).toBe(3000);
  expect(resolveModelPromptLimit('bfl:6@1')).toBe(32000);
  expect(resolveModelPromptLimit('alibaba:wan@2.6-flash')).toBe(1500);
});

test('drops optional sections before required sections', () => {
  const result = fitPromptSections({
    limit: 35,
    sections: [
      { key: 'required', label: 'P0', text: 'must remain', priority: 0 },
      { key: 'optional', label: 'P2', text: 'this optional context is deliberately long', priority: 2 },
    ],
  });

  expect(result.prompt).toContain('must remain');
  expect(result.droppedSections).toEqual(['optional']);
});
