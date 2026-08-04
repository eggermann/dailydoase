import { afterEach, describe, expect, jest, test } from '@jest/globals';

import {
  createSemanticStreamLoop,
  resolveLoopOutcome,
  resolveMaxIterations,
  shouldScheduleNextIteration,
} from '../semantic-stream.js';

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

describe('finite semantic-stream runs', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  test('uses -1 as the explicit infinite iteration limit', () => {
    expect(resolveMaxIterations({ model: { maxIterations: -1 } })).toBe(-1);
    expect(resolveMaxIterations({ model: {} })).toBe(-1);
  });

  test('keeps the same loop alive until its finite limit is reached', () => {
    expect(shouldScheduleNextIteration({
      iteration: 1,
      maxIterations: 2,
      wait: 1000,
      success: true,
      retryOnFailure: false,
    })).toBe(true);
    expect(shouldScheduleNextIteration({
      iteration: 2,
      maxIterations: 2,
      wait: 1000,
      success: true,
      retryOnFailure: false,
    })).toBe(false);
  });

  test('passes the same existing word streams into every finite iteration', async () => {
    jest.useFakeTimers();
    const existingWordStreams = [{ currentWord: 'Raster' }];
    const observedStreams = [];
    const model = {
      prompt: jest.fn().mockResolvedValue(true),
    };
    const config = {
      id: 'same-stream-test',
      words: [],
      model: {
        maxIterations: 2,
        pollingTime: 10,
        retryOnFailure: false,
      },
      promptFunktion: jest.fn(async (streams) => {
        observedStreams.push(streams);
        return `round-${observedStreams.length}`;
      }),
    };

    const runSameStream = createSemanticStreamLoop(model, config);
    await runSameStream(existingWordStreams);
    await jest.advanceTimersByTimeAsync(10);

    expect(observedStreams).toEqual([
      existingWordStreams,
      existingWordStreams,
    ]);
    expect(model.prompt).toHaveBeenNthCalledWith(1, 'round-1', config);
    expect(model.prompt).toHaveBeenNthCalledWith(2, 'round-2', config);
  });
});
