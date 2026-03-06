import { describe, expect, test } from '@jest/globals';

import { isCameraStartImageEnabled } from '../lib/helper/getIamge.js';

describe('isCameraStartImageEnabled', () => {
  test('accepts common enabled values', () => {
    expect(isCameraStartImageEnabled('1')).toBe(true);
    expect(isCameraStartImageEnabled('true')).toBe(true);
    expect(isCameraStartImageEnabled('YES')).toBe(true);
    expect(isCameraStartImageEnabled('On')).toBe(true);
  });

  test('rejects disabled or missing values', () => {
    expect(isCameraStartImageEnabled('0')).toBe(false);
    expect(isCameraStartImageEnabled('false')).toBe(false);
    expect(isCameraStartImageEnabled(undefined)).toBe(false);
  });
});
