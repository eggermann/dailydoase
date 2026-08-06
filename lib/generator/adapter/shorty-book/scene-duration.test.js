import { expect, test } from '@jest/globals';

import {
  applySceneLengthCurve,
  applySceneLengthMaximum,
  applySceneLengthMinimum,
  quantizeRunwareWan26FlashDuration,
  resolveProviderDuration,
} from './scene-duration.js';

const sum = (values) => values.reduce((total, value) => total + value, 0);

test('linear rhythm curve preserves source values', () => {
  expect(applySceneLengthCurve([1, 2, 3, 1], { mode: 'linear' })).toEqual([1, 2, 3, 1]);
});

test('power exponent one preserves source values', () => {
  expect(applySceneLengthCurve([1, 2, 3, 1], {
    mode: 'power',
    exponent: 1,
  })).toEqual([1, 2, 3, 1]);
});

test('power curve expands contrast and preserves total duration', () => {
  const source = [1, 2, 3, 1];
  const curved = applySceneLengthCurve(source, {
    mode: 'power',
    exponent: 1.3,
    preserveTotal: true,
  });
  expect(Math.max(...curved) - Math.min(...curved)).toBeGreaterThan(2);
  expect(Number(sum(curved).toFixed(2))).toBe(Number(sum(source).toFixed(2)));
});

test('log curve preserves total duration', () => {
  const source = [1, 2, 3, 1];
  const curved = applySceneLengthCurve(source, { mode: 'log', preserveTotal: true });
  expect(Number(sum(curved).toFixed(2))).toBe(Number(sum(source).toFixed(2)));
});

test('minimum and maximum remain separate post-curve stages', () => {
  expect(applySceneLengthMinimum([0.9, 2.4], 2)).toEqual([2, 2.4]);
  expect(applySceneLengthMaximum([2.4, 19], 15)).toEqual([2.4, 15]);
});

test('invalid power exponent falls back safely', () => {
  expect(applySceneLengthCurve([1, 2, 3], {
    mode: 'power',
    exponent: 0,
  })).toEqual([1, 2, 3]);
});

test.each([
  [1, 2],
  [2, 2],
  [2.4, 2],
  [2.6, 3],
  [4.5, 5],
  [15.8, 15],
])('Runware Wan 2.6 Flash quantizes %s to %s', (source, expected) => {
  expect(quantizeRunwareWan26FlashDuration(source)).toBe(expected);
});

test('provider duration resolution rounds only active Runware Wan 2.6 Flash', () => {
  expect(resolveProviderDuration({
    durationSeconds: 3.7,
    videoModelType: 'runwareImageToVideo',
    model: 'alibaba:wan@2.6-flash',
  })).toEqual({
    durationSeconds: 4,
    rule: 'runware-wan-2.6-flash-integer-2-15',
  });
  expect(resolveProviderDuration({
    durationSeconds: 3.7,
    videoModelType: 'falImageToVideo',
    model: 'fal-ai/wan/v2.2-5b/image-to-video',
  })).toEqual({
    durationSeconds: 3.7,
    rule: 'provider-native-duration',
  });
});
