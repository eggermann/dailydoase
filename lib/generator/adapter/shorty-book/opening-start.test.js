import { expect, test } from '@jest/globals';

import {
  buildOpeningFluxContextPrompt,
  normalizeOpeningStartMode,
  shouldUseOpeningFluxContextImage,
} from './opening-start.js';

test('normalizeOpeningStartMode resolves flux-context aliases', () => {
  expect(normalizeOpeningStartMode('flux-context')).toBe('fluxContext');
  expect(normalizeOpeningStartMode('kontext')).toBe('fluxContext');
  expect(normalizeOpeningStartMode('camera')).toBe('cameraShot');
});

test('shouldUseOpeningFluxContextImage respects the configured interval', () => {
  expect(shouldUseOpeningFluxContextImage({
    enabled: true,
    mode: 'fluxContext',
    interval: 3,
    iteration: 2,
  })).toBe(false);

  expect(shouldUseOpeningFluxContextImage({
    enabled: true,
    mode: 'fluxContext',
    interval: 3,
    iteration: 3,
  })).toBe(true);
});

test('buildOpeningFluxContextPrompt uses planned monster-free scene text without persona grounding', () => {
  const prompt = buildOpeningFluxContextPrompt({
    scenePlanEntry: {
      singleImagePrompt: 'the man stiffens as the storm warning reaches him',
      storyBeat: 'storm warning',
      stillPrompt: 'a tense medium close-up in the kitchen',
      motionCue: 'his eyes flick to the window',
      cameraCue: 'a slight push inward',
    },
    sourceCues: ['storm warning'],
    openingVisionText: 'Location: a kitchen. Actors: [{"reference":"subject","description":"one anxious man"}]. Description: medium close-up under soft window light.',
    promptFlavor: 'ltx',
  });

  expect(prompt.toLowerCase()).toContain('tense medium close-up');
  expect(prompt.toLowerCase()).toContain('kitchen');
  expect(prompt).not.toMatch(/same real person|webcam anchor|protagonist reference|canonical monster/i);
});

test('buildOpeningFluxContextPrompt leaves human presence open when actor count is unlocked', () => {
  const prompt = buildOpeningFluxContextPrompt({
    scenePlanEntry: {
      singleImagePrompt: 'A visitor enters beside the green monster.',
      storyBeat: 'A visitor enters beside the green monster.',
    },
    sourceCues: ['Anchor (1983) Collision (Kaufhaus)'],
    openingVisionText: 'Location: empty Kaufhaus hall. Actors: none visible.',
    lockActorCount: false,
  });

  expect(prompt).toContain('visitor');
  expect(prompt).not.toContain('Keep the shot non-human');
  expect(prompt).not.toContain('Do not introduce any person or actor');
});

test('buildOpeningFluxContextPrompt prefers complete still direction over WAN motion prompt', () => {
  const prompt = buildOpeningFluxContextPrompt({
    scenePlanEntry: {
      stillPrompt: 'Wide symmetrical Kaufhaus tableau, sick green fluorescent light, rough concrete texture, 35mm lens.',
      singleImagePrompt: 'The monster runs while the camera circles quickly.',
      storyBeat: 'The archive wakes inside the room.',
    },
    openingVisionText: 'Location: old Kaufhaus hall. Actors: none visible.',
    lockActorCount: false,
  });

  expect(prompt).toContain('Wide symmetrical Kaufhaus tableau');
  expect(prompt).not.toContain('monster runs');
});
