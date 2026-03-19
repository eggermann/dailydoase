import { expect, test } from '@jest/globals';

import {
  normalizeDriftCorrectionLevel,
  resolveDriftCorrectionProfile,
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
