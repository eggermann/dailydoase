import { describe, expect, test } from '@jest/globals';

import { resolveLoopOutcome, shouldScheduleNextIteration } from '../semantic-stream.js';

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
    expect(resolveLoopOutcome({ success: false, pollingTime: 1000, retryOnFailure: true }))
      .toEqual({ status: 'scheduled-retry', success: false });
  });

  test('marks a polling false result as failed when retry-on-failure is disabled', () => {
    expect(resolveLoopOutcome({ success: false, pollingTime: 1000, retryOnFailure: false }))
      .toEqual({ status: 'failed', success: false });
  });
});

describe('shouldScheduleNextIteration', () => {
  test('schedules before the configured limit', () => {
    expect(shouldScheduleNextIteration({
      iteration: 1,
      maxIterations: 2,
      pollingTime: 10,
      success: true,
    })).toBe(true);
  });

  test('stops exactly at the configured limit', () => {
    expect(shouldScheduleNextIteration({
      iteration: 2,
      maxIterations: 2,
      pollingTime: 10,
      success: true,
    })).toBe(false);
  });
});
