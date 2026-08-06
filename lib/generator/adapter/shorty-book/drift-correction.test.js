import { expect, test } from '@jest/globals';

import {
  deterministicPercentDecision,
  normalizeDriftCorrectionLevel,
  resolveDriftCorrectionFocus,
  resolveDriftCorrectionModelConfig,
  resolveDriftCorrectionProfile,
  uniquePaths,
} from './drift-correction.js';

test('normalizeDriftCorrectionLevel resolves moderate aliases', () => {
  expect(normalizeDriftCorrectionLevel('medium')).toBe('moderate');
  expect(normalizeDriftCorrectionLevel('balanced')).toBe('moderate');
  expect(normalizeDriftCorrectionLevel('full')).toBe('aggressive');
});

test('resolveDriftCorrectionProfile enables moderate drift handling for camera single-image continuity', () => {
  expect(resolveDriftCorrectionProfile({
    level: 'moderate',
    configMode: 'camera',
  })).toEqual({
    enabled: true,
    level: 'moderate',
    applyToSingleImage: true,
    applyToFirstLast: false,
  });
});

test('resolveDriftCorrectionProfile preserves previous default camera behavior when no level is requested', () => {
  expect(resolveDriftCorrectionProfile({
    enabled: true,
    level: 'default',
    configMode: 'camera',
  })).toEqual({
    enabled: true,
    level: 'default',
    applyToSingleImage: false,
    applyToFirstLast: false,
  });
});

test('resolveDriftCorrectionModelConfig applies moderate quality defaults when env does not override them', () => {
  expect(resolveDriftCorrectionModelConfig({
    model: {
      model: 'black-forest-labs/FLUX.1-Kontext-dev',
      hfProvider: 'fal-ai',
      num_inference_steps: 28,
      guidance_scale: 2.5,
    },
    level: 'moderate',
  })).toEqual({
    model: 'black-forest-labs/FLUX.1-Kontext-dev',
    hfProvider: 'fal-ai',
    num_inference_steps: 24,
    guidance_scale: 3.4,
  });
});

test('resolveDriftCorrectionModelConfig preserves explicit steps and guidance overrides', () => {
  expect(resolveDriftCorrectionModelConfig({
    model: {
      model: 'black-forest-labs/FLUX.1-Kontext-dev',
      hfProvider: 'fal-ai',
      num_inference_steps: 18,
      guidance_scale: 4.1,
    },
    level: 'moderate',
    hasExplicitSteps: true,
    hasExplicitGuidance: true,
  })).toEqual({
    model: 'black-forest-labs/FLUX.1-Kontext-dev',
    hfProvider: 'fal-ai',
    num_inference_steps: 18,
    guidance_scale: 4.1,
  });
});

test('deterministic drift selection is stable for one semantic key', () => {
  const key = 'run-2|scene-4|Public|Terrorism';
  expect(deterministicPercentDecision(key, 35)).toBe(deterministicPercentDecision(key, 35));
  expect(deterministicPercentDecision(key, 0)).toBe(false);
  expect(deterministicPercentDecision(key, 100)).toBe(true);
});

test('drift focus follows scene focus', () => {
  expect(resolveDriftCorrectionFocus({ sceneFocus: 'location' })).toBe('location');
  expect(resolveDriftCorrectionFocus({ sceneFocus: 'monster' })).toBe('combined');
  expect(resolveDriftCorrectionFocus({ sceneFocus: 'mixed' })).toBe('combined');
});

test('uniquePaths resolves and removes duplicate references', () => {
  expect(uniquePaths(['/tmp/location.jpg', '/tmp/location.jpg', '', '/tmp/monster.png']))
    .toEqual(['/tmp/location.jpg', '/tmp/monster.png']);
});
