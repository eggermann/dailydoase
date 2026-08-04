import { afterEach, describe, expect, jest, test } from '@jest/globals';

import {
  clearWordStreamCache,
  getWordStreamCacheKey,
  getWordStreams,
  initWordStreamsSequentially,
} from '../semantic-stream.js';

describe('semantic-stream initialization', () => {
  test('starts word streams sequentially and preserves their configured order', async () => {
    const events = [];
    const wait = jest.fn(async () => {
      events.push('pause');
    });
    const initSingleStream = jest.fn(async ([word]) => {
      events.push(`start:${word}`);
      return [{ startWord: word }];
    });

    const streams = await initWordStreamsSequentially([
      ['1983', 'de'],
      ['Kaufhaus', 'de'],
      ['Kunstausstellung', 'de'],
    ], {
      initSingleStream,
      pauseBetweenStreamsMs: 1,
      wait,
    });

    expect(events).toEqual([
      'start:1983',
      'pause',
      'start:Kaufhaus',
      'pause',
      'start:Kunstausstellung',
    ]);
    expect(streams.map(({ startWord }) => startWord)).toEqual([
      '1983',
      'Kaufhaus',
      'Kunstausstellung',
    ]);
  });

  test('retries a rate-limited stream before advancing to the next word', async () => {
    const rateLimit = new Error('429: Too Many Requests');
    const initSingleStream = jest.fn()
      .mockRejectedValueOnce(rateLimit)
      .mockResolvedValueOnce([{ startWord: '1983' }]);
    const wait = jest.fn().mockResolvedValue(undefined);

    await expect(initWordStreamsSequentially([['1983', 'de']], {
      initSingleStream,
      rateLimitRetryMs: 10,
      maxAttempts: 2,
      wait,
    })).resolves.toEqual([{ startWord: '1983' }]);

    expect(initSingleStream).toHaveBeenCalledTimes(2);
    expect(wait).toHaveBeenCalledWith(10);
  });
});

describe('semantic-stream cache', () => {
  afterEach(() => {
    clearWordStreamCache();
  });

  test('reuses one semantic-stream instance for the same word config', async () => {
    const streams = [{ startWord: 'horror' }];
    const initStreams = jest.fn(async () => streams);

    const first = await getWordStreams([['horror', 'de']], { initStreams });
    const second = await getWordStreams([['horror', 'de']], { initStreams });

    expect(first).toBe(streams);
    expect(second).toBe(streams);
    expect(second).toBe(first);
    expect(initStreams).toHaveBeenCalledTimes(1);
  });

  test('uses separate cache entries for different word configs', async () => {
    const initStreams = jest.fn(async (words) => [{ startWord: words[0][0] }]);

    const first = await getWordStreams([['horror', 'de']], { initStreams });
    const second = await getWordStreams([['thriller', 'de']], { initStreams });

    expect(first).not.toBe(second);
    expect(initStreams).toHaveBeenCalledTimes(2);
    expect(getWordStreamCacheKey([['horror', 'de']])).not.toBe(
      getWordStreamCacheKey([['thriller', 'de']])
    );
  });
});
