import { describe, expect, test } from '@jest/globals';

import {
  buildRunwareH3MaxTurboPrompt,
  normalizeRunwareH3MaxTurboRequestDuration,
  normalizeRunwareH3MaxTurboResolution,
} from './h3MaxTurbo.js';

describe('Runware H3 Max Turbo fields', () => {
  test('uses the cheapest supported resolution by default', () => {
    expect(normalizeRunwareH3MaxTurboResolution()).toBe('480p');
    expect(normalizeRunwareH3MaxTurboResolution('768p')).toBe('768p');
    expect(() => normalizeRunwareH3MaxTurboResolution('720p')).toThrow('Unsupported Runware H3 Max Turbo resolution');
  });

  test('requests at least five seconds, caps provider duration at fifteen seconds', () => {
    expect(normalizeRunwareH3MaxTurboRequestDuration(2)).toBe(5);
    expect(normalizeRunwareH3MaxTurboRequestDuration(8.4)).toBe(8);
    expect(normalizeRunwareH3MaxTurboRequestDuration(15)).toBe(15);
    expect(() => normalizeRunwareH3MaxTurboRequestDuration(16)).toThrow('supports clips up to 15 seconds');
  });

  test('adds optional spoken/audio direction in a Runware Sound clause', () => {
    expect(buildRunwareH3MaxTurboPrompt('The visitor turns.', 'soft room tone and one chair creak.'))
      .toBe('The visitor turns.\n\nSound: soft room tone and one chair creak.');
    expect(buildRunwareH3MaxTurboPrompt('The visitor turns.', '')).toBe('The visitor turns.');
  });
});
