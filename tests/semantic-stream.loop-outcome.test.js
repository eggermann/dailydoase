import { describe, expect, test } from '@jest/globals';

import { resolveLoopOutcome } from '../semantic-stream.js';

describe('resolveLoopOutcome', () => {
  test('throws when a non-polling generation returns false', () => {
    expect(() => resolveLoopOutcome({ success: false, pollingTime: null }))
      .toThrow('Generator returned false');
  });

  test('marks a non-polling generation as completed when it succeeds', () => {
    expect(resolveLoopOutcome({ success: true, pollingTime: null }))
      .toEqual({ status: 'completed', success: true });
  });

  test('marks a polling false result as scheduled retry', () => {
    expect(resolveLoopOutcome({ success: false, pollingTime: 1000 }))
      .toEqual({ status: 'scheduled-retry', success: false });
  });
});
