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

test('buildOpeningFluxContextPrompt grounds the first cue in the visible camera shot', () => {
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

  expect(prompt.toLowerCase()).toContain('storm warning');
  expect(prompt.toLowerCase()).toContain('kitchen');
});

test('Selfomat opening restyles only the current visitor before adding cast memory', () => {
  const prompt = buildOpeningFluxContextPrompt({
    scenePlanEntry: {
      selfomat: true,
      singleImagePrompt: 'The current visitor and an earlier visitor celebrate.',
    },
    openingVisionText: 'Actors: current visitor.',
  });

  expect(prompt).toContain('current visitor');
  expect(prompt).toContain('later cast-context step adds the earlier visitor');
  expect(prompt).not.toContain('exactly one person in frame');
});
