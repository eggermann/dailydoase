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

  test('runs two fresh recovery iterations after a failure before returning to normal polling', async () => {
    jest.useFakeTimers();
    const existingWordStreams = [{ currentWord: 'Raster' }];
    const model = {
      prompt: jest.fn()
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(true),
    };
    const config = {
      id: 'advance-after-failure-test',
      words: [],
      model: {
        maxIterations: 4,
        pollingTime: 100,
        retryOnFailure: true,
        advanceOnFailure: true,
        failureRecoveryIterations: 2,
        failureRecoveryDelayMs: 10,
      },
      promptFunktion: jest.fn(async () => `round-${model.prompt.mock.calls.length + 1}`),
    };

    const runSameStream = createSemanticStreamLoop(model, config);
    await runSameStream(existingWordStreams);
    await jest.advanceTimersByTimeAsync(20);

    expect(model.prompt).toHaveBeenNthCalledWith(1, 'round-1', config);
    expect(model.prompt).toHaveBeenNthCalledWith(2, 'round-2', config);
    expect(model.prompt).toHaveBeenNthCalledWith(3, 'round-3', config);

    await jest.advanceTimersByTimeAsync(99);
    expect(model.prompt).toHaveBeenCalledTimes(3);
    await jest.advanceTimersByTimeAsync(1);
    expect(model.prompt).toHaveBeenNthCalledWith(4, 'round-4', config);
  });

  test('keeps the stream alive when an iteration throws', async () => {
    jest.useFakeTimers();
    const model = {
      prompt: jest.fn()
        .mockRejectedValueOnce(new Error('Runware request failed'))
        .mockResolvedValueOnce(true),
    };
    const config = {
      id: 'thrown-iteration-recovery-test',
      words: [],
      model: {
        maxIterations: 2,
        pollingTime: 100,
        retryOnFailure: true,
        advanceOnFailure: true,
        failureRecoveryIterations: 1,
        failureRecoveryDelayMs: 10,
      },
      promptFunktion: jest.fn(async () => `round-${model.prompt.mock.calls.length + 1}`),
    };

    const runSameStream = createSemanticStreamLoop(model, config);
    await runSameStream([{ currentWord: 'Raster' }]);
    await jest.advanceTimersByTimeAsync(10);

    expect(model.prompt).toHaveBeenNthCalledWith(1, 'round-1', config);
    expect(model.prompt).toHaveBeenNthCalledWith(2, 'round-2', config);
  });
});
