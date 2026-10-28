import { afterEach, describe, expect, jest, test } from '@jest/globals';
import { appendFile, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
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
  test('restores the same pending semantic snapshot and continues the saved WordStream state', async () => {
    temporaryDirectory = await mkdtemp(join(tmpdir(), 'semantic-source-checkpoint-test-'));
    const modulePath = join(temporaryDirectory, 'mock-semantic-stream.mjs');
    const initializationLog = join(temporaryDirectory, 'initializations.log');
    const checkpointPath = join(temporaryDirectory, 'semantic-stream-state.json');
    await writeFile(modulePath, [
      "import { appendFile } from 'node:fs/promises';",
      `const initializationLog = ${JSON.stringify(initializationLog)};`,
      'export class WordStream {',
      '  constructor(word, lang) { this.word = word; this.lang = lang; this.circularLinks = { links: {}, usedLinks: {} }; }',
      '  async getNext() {',
      '    const index = Object.keys(this.circularLinks.usedLinks).length + 1;',
      '    const title = `${this.word} fragment ${index}`;',
      '    this.circularLinks.links[title] = { title };',
      '    this.circularLinks.usedLinks[title] = { cnt: 1 };',
      '    return { title, context: `context ${index}` };',
      '  }',
      '}',
      'export async function initStreams(words) {',
      '  await appendFile(initializationLog, "initialized\\n");',
      '  return words.map(([word, lang]) => new WordStream(word, lang));',
      '}',
    ].join('\n'));

    const options = { words: 'EU', 'stream-module': modulePath };
    const firstSource = await createSemanticSource(options, { checkpointPath });
    const interruptedSnapshot = await firstSource.next();
    const resumedSource = await createSemanticSource(options, { checkpointPath });

    expect(resumedSource.resumedFromCheckpoint).toBe(true);
    expect(await resumedSource.next()).toEqual(interruptedSnapshot);
    await resumedSource.acknowledge(interruptedSnapshot);
    const nextSnapshot = await resumedSource.next();
    expect(nextSnapshot.entries[0].item.title).toBe('EU fragment 2');
    expect((await readFile(initializationLog, 'utf8')).trim().split('\n')).toHaveLength(1);
  });

  test('restores sequence cursor after an acknowledged snapshot', async () => {
    temporaryDirectory = await mkdtemp(join(tmpdir(), 'semantic-sequence-checkpoint-test-'));
    const sequencePath = join(temporaryDirectory, 'sequence.json');
    const checkpointPath = join(temporaryDirectory, 'semantic-stream-state.json');
    const snapshots = [1, 2].map((index) => ({
      provider: 'fixture',
      capturedAt: `2026-10-28T00:00:0${index}.000Z`,
      words: [['EU', 'de']],
      entries: [{ id: `stream-${index}`, seed: ['EU', 'de'], item: { title: `Fragment ${index}` } }],
    }));
    await writeFile(sequencePath, JSON.stringify(snapshots));

    const options = { 'stream-sequence-file': sequencePath };
    const firstSource = await createSemanticSource(options, { checkpointPath });
    const firstSnapshot = await firstSource.next();
    await firstSource.acknowledge(firstSnapshot);
    const resumedSource = await createSemanticSource(options, { checkpointPath });

    expect(await resumedSource.next()).toEqual(snapshots[1]);
  });
});
