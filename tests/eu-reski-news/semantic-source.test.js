import { afterEach, describe, expect, jest, test } from '@jest/globals';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WordStream } from 'semantic-stream';

import {
  createSemanticSource,
  WIKIPEDIA_REQUEST_POLICY,
  WIKIPEDIA_USER_AGENT,
} from '../../eu-reski-news/news-scene/semantic-source.mjs';

let temporaryDirectory;

afterEach(async () => {
  if (temporaryDirectory) {
    await rm(temporaryDirectory, { recursive: true, force: true });
    temporaryDirectory = undefined;
  }
});

describe('EU-RESKI semantic source', () => {
  test('stops after bounded 429 retries instead of falling back to another search', async () => {
    const throttled = Object.assign(new Error('Too Many Requests'), { status: 429 });
    const page = jest.fn(() => Promise.reject(throttled));
    const search = jest.fn();
    const stream = new WordStream('EU', 'de', {
      wikiFactory: () => ({ page, search }),
      scheduleWikipediaRequest: (operation) => operation(),
      requestPolicy: {
        maxAttempts: 3,
        baseDelayMs: 0,
        maxDelayMs: 0,
        jitterRatio: 0,
        wait: async () => {},
        onRetry: () => {},
      },
    });

    await expect(stream.start()).rejects.toBe(throttled);
    expect(page).toHaveBeenCalledTimes(3);
    expect(search).not.toHaveBeenCalled();
  });

  test('passes conservative Wikipedia policy and identifiable User-Agent to streams', async () => {
    temporaryDirectory = await mkdtemp(join(tmpdir(), 'semantic-source-test-'));
    const optionsPath = join(temporaryDirectory, 'captured-options.json');
    const modulePath = join(temporaryDirectory, 'mock-semantic-stream.mjs');

    await writeFile(modulePath, [
      "import { writeFile } from 'node:fs/promises';",
      `export async function initStreams(words, options) { await writeFile(${JSON.stringify(optionsPath)}, JSON.stringify(options)); return [{ getNext: async () => ({ title: 'Test article' }) }]; }`,
    ].join('\n'));

    const source = await createSemanticSource({ words: 'EU', 'stream-module': modulePath });
    const capturedOptions = JSON.parse(await readFile(optionsPath, 'utf8'));
    const semantic = await source.next();

    expect(capturedOptions.wordStreamOptions).toEqual({
      userAgent: WIKIPEDIA_USER_AGENT,
      requestPolicy: WIKIPEDIA_REQUEST_POLICY,
    });
    expect(semantic.entries[0].item.title).toBe('Test article');
    expect(WIKIPEDIA_REQUEST_POLICY).toEqual({
      minIntervalMs: 3000,
      maxAttempts: 3,
      baseDelayMs: 60000,
      maxDelayMs: 300000,
      jitterRatio: 0.2,
    });
  });
});
