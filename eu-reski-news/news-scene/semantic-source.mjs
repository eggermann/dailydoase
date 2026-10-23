import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { defaultWords } from './planner.mjs';

const json = async (path) => JSON.parse(await readFile(path, 'utf8'));

function validateSemantic(semantic) {
  if (!Array.isArray(semantic.entries) || semantic.entries.length < 1 || semantic.entries.length > 12) throw new Error('Expected 1–12 semantic entries');
  const ids = new Set();
  for (const entry of semantic.entries) {
    if (!entry.id || ids.has(entry.id) || !Array.isArray(entry.seed) || !entry.item?.title) throw new Error('Invalid semantic entry');
    ids.add(entry.id);
  }
  return semantic;
}

export async function createSemanticSource(options) {
  if (options['stream-sequence-file']) {
    const saved = await json(resolve(options['stream-sequence-file']));
    const snapshots = Array.isArray(saved) ? saved : saved.snapshots;
    if (!Array.isArray(snapshots) || !snapshots.length) throw new Error('Semantic sequence requires a non-empty snapshots array');
    snapshots.forEach(validateSemantic);
    let cursor = 0;
    return { next: async () => {
      if (cursor >= snapshots.length) throw new Error('Semantic sequence exhausted; refusing to repeat or replace fragments');
      return structuredClone(snapshots[cursor++]);
    } };
  }
  if (options['stream-file']) {
    return { next: async () => validateSemantic(await json(resolve(options['stream-file']))) };
  }
  const words = options['words-file'] ? await json(resolve(options['words-file']))
    : options.words ? options.words.split(',').map((word) => [word.trim(), 'de']) : defaultWords;
  if (!Array.isArray(words) || !words.length || words.length > 12 || words.some((entry) => !Array.isArray(entry) || entry.length !== 2 || !entry.every((value) => typeof value === 'string' && value.trim()) || !/^[a-z]{2,3}$/.test(entry[1]))) {
    throw new Error('Words must be [["EU","de"],["EU","en"],["EU","ru"]], at most 12 pairs');
  }
  const modulePath = options['stream-module'] || process.env.NEWS_SEMANTIC_STREAM_MODULE;
  const module = await import(modulePath ? pathToFileURL(resolve(modulePath)).href : 'semantic-stream');
  const initStreams = module.initStreams || module.default?.initStreams;
  if (!initStreams) throw new Error('semantic-stream does not export initStreams');
  const streams = [];
  // Keep each stream alive for the full run; getNext advances it between iterations.
  for (const [index, seed] of words.entries()) {
    console.log(`Semantic stream: ${seed.join(' / ')}`);
    const [stream] = await initStreams([seed], {
      registerExitHandlers: false,
      wordStreamOptions: { requestPolicy: { maxAttempts: 5, minIntervalMs: 500 } },
    });
    streams.push({ id: `stream-${index + 1}`, seed, stream });
  }
  return {
    next: async () => {
      const entries = [];
      // Sequential reads respect semantic-stream's source throttling.
      for (const { id, seed, stream } of streams) {
        let item;
        for (let attempt = 0; attempt < 20; attempt += 1) {
          item = await stream.getNext();
          if (item?.title && !/doi|isbn|pmid|webarchiv|wayback machine|internet archive/i.test(item.title)) break;
          item = null;
        }
        if (!item) throw new Error(`No usable semantic fragment for ${seed.join('/')}`);
        entries.push({ id, seed, item });
      }
      return validateSemantic({ provider: 'semantic-stream', capturedAt: new Date().toISOString(), words, entries });
    },
  };
}

