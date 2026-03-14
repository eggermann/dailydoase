import { afterEach, describe, expect, jest, test } from '@jest/globals';

import {
  clearWordStreamCache,
  getWordStreamCacheKey,
  getWordStreams,
} from '../semantic-stream.js';

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
