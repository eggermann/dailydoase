import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { defaultWords } from './planner.mjs';

const json = async (path) => JSON.parse(await readFile(path, 'utf8'));

export const WIKIPEDIA_USER_AGENT = 'dailydoase/1.0 (https://github.com/eggermann/dailydoase)';
export const WIKIPEDIA_REQUEST_POLICY = Object.freeze({
  minIntervalMs: 3000,
  maxAttempts: 3,
  baseDelayMs: 60000,
  maxDelayMs: 300000,
  jitterRatio: 0.2,
});

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
function validateSemantic(semantic) {
  if (!Array.isArray(semantic.entries) || semantic.entries.length < 1 || semantic.entries.length > 12) throw new Error('Expected 1–12 semantic entries');
  const ids = new Set();
  for (const entry of semantic.entries) {
    if (!entry.id || ids.has(entry.id) || !Array.isArray(entry.seed) || !entry.item?.title) throw new Error('Invalid semantic entry');
    ids.add(entry.id);
  }
  return semantic;
}

function wordStreamSnapshot(streams) {
  return streams.map(({ id, seed, stream }) => ({
    id,
    seed,
    links: clone(stream.circularLinks.links),
    usedLinks: clone(stream.circularLinks.usedLinks),
  }));
}

async function saveCheckpoint(path, state) {
  if (!path) return;
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${randomUUID()}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  await rename(temporaryPath, path);
}

async function loadWordStreams(sourceState) {
  const modulePath = sourceState.modulePath || 'semantic-stream';
  const module = await import(modulePath.startsWith('.') || modulePath.startsWith('/')
    ? pathToFileURL(resolve(modulePath)).href
    : modulePath);
  const WordStream = module.WordStream || module.default?.WordStream;
  if (!WordStream) throw new Error('Resuming semantic stream requires WordStream export from semantic-stream module');
  const wordStreamOptions = {
    userAgent: sourceState.userAgent || WIKIPEDIA_USER_AGENT,
    requestPolicy: sourceState.requestPolicy || WIKIPEDIA_REQUEST_POLICY,
  };
  return sourceState.streams.map((saved) => {
    const stream = new WordStream(saved.seed[0], saved.seed[1], wordStreamOptions);
    stream.circularLinks.links = clone(saved.links);
    stream.circularLinks.usedLinks = clone(saved.usedLinks);
    return { id: saved.id, seed: saved.seed, stream };
  });
}

function createCheckpointedSource(state, { checkpointPath, streams = null } = {}) {
  const save = () => saveCheckpoint(checkpointPath, state);
  const sequence = state.source.type === 'sequence' ? state.source.snapshots : null;
  const fixedSnapshot = state.source.type === 'snapshot' ? state.source.snapshot : null;

  async function readNextWordSnapshot() {
    const entries = state.pendingEntries || [];
    for (let index = entries.length; index < streams.length; index += 1) {
      const { id, seed, stream } = streams[index];
      let item;
      for (let attempt = 0; attempt < 20; attempt += 1) {
        item = await stream.getNext();
        if (item?.title && !/doi|isbn|pmid|webarchiv|wayback machine|internet archive/i.test(item.title)) break;
        item = null;
      }
      if (!item) throw new Error(`No usable semantic fragment for ${seed.join('/')}`);
      entries.push({ id, seed, item });
      state.pendingEntries = entries;
      if (checkpointPath) {
        state.streams = wordStreamSnapshot(streams);
        await save();
      }
    }
    return validateSemantic({
      provider: 'semantic-stream',
      capturedAt: state.pendingCapturedAt || new Date().toISOString(),
      words: state.source.words,
      entries,
    });
  }

  return {
    resumedFromCheckpoint: Boolean(state.restoredFromCheckpoint),
    async next() {
      if (state.pendingSemantic) return clone(state.pendingSemantic);
      let semantic;
      if (state.source.type === 'sequence') {
        if (state.cursor >= sequence.length) throw new Error('Semantic sequence exhausted; refusing to repeat or replace fragments');
        semantic = validateSemantic(clone(sequence[state.cursor]));
      } else if (state.source.type === 'snapshot') {
        semantic = validateSemantic(clone(fixedSnapshot));
      } else {
        state.pendingCapturedAt ||= new Date().toISOString();
        semantic = await readNextWordSnapshot();
      }
      state.pendingSemantic = semantic;
      await save();
      return clone(semantic);
    },
    async acknowledge(semantic) {
      if (!state.pendingSemantic) return;
      if (JSON.stringify(state.pendingSemantic) !== JSON.stringify(semantic)) {
        throw new Error('Semantic checkpoint does not match the saved iteration; refusing to advance the stream');
      }
      if (state.source.type === 'sequence') state.cursor += 1;
      state.pendingSemantic = null;
      state.pendingEntries = [];
      state.pendingCapturedAt = null;
      if (checkpointPath && streams) state.streams = wordStreamSnapshot(streams);
      await save();
    },
  };
}

export async function createSemanticSource(options, { checkpointPath = null } = {}) {
  const savedState = checkpointPath && await readFile(checkpointPath, 'utf8').then((contents) => JSON.parse(contents)).catch((error) => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });

  if (savedState) {
    if (savedState.formatVersion !== 1) throw new Error('Unsupported semantic stream checkpoint version');
    const streams = savedState.source.type === 'word-stream'
      ? await loadWordStreams({ ...savedState.source, streams: savedState.streams })
      : null;
    return createCheckpointedSource({ ...savedState, restoredFromCheckpoint: true }, { checkpointPath, streams });
  }

  if (options['stream-sequence-file']) {
    const loaded = await json(resolve(options['stream-sequence-file']));
    const snapshots = Array.isArray(loaded) ? loaded : loaded.snapshots;
    if (!Array.isArray(snapshots) || !snapshots.length) throw new Error('Semantic sequence requires a non-empty snapshots array');
    snapshots.forEach(validateSemantic);
    const state = {
      formatVersion: 1,
      source: { type: 'sequence', snapshots },
      cursor: 0,
      pendingSemantic: null,
      pendingEntries: [],
    };
    await saveCheckpoint(checkpointPath, state);
    return createCheckpointedSource(state, { checkpointPath });
  }

  if (options['stream-file']) {
    const snapshot = validateSemantic(await json(resolve(options['stream-file'])));
    const state = {
      formatVersion: 1,
      source: { type: 'snapshot', snapshot },
      pendingSemantic: null,
      pendingEntries: [],
    };
    await saveCheckpoint(checkpointPath, state);
    return createCheckpointedSource(state, { checkpointPath });
  }

  const words = options['words-file'] ? await json(resolve(options['words-file']))
    : options.words ? options.words.split(',').map((word) => [word.trim(), 'de']) : defaultWords;
  if (!Array.isArray(words) || !words.length || words.length > 12 || words.some((entry) => !Array.isArray(entry) || entry.length !== 2 || !entry.every((value) => typeof value === 'string' && value.trim()) || !/^[a-z]{2,3}$/.test(entry[1]))) {
    throw new Error('Words must be [["EU","de"],["EU","en"],["EU","ru"]], at most 12 pairs');
  }
  const modulePath = options['stream-module'] || process.env.NEWS_SEMANTIC_STREAM_MODULE || 'semantic-stream';
  const module = await import(modulePath.startsWith('.') || modulePath.startsWith('/')
    ? pathToFileURL(resolve(modulePath)).href
    : modulePath);
  const initStreams = module.initStreams || module.default?.initStreams;
  if (!initStreams) throw new Error('semantic-stream does not export initStreams');
  const wordStreamOptions = {
    userAgent: WIKIPEDIA_USER_AGENT,
    requestPolicy: WIKIPEDIA_REQUEST_POLICY,
  };
  const streams = [];
  for (const [index, seed] of words.entries()) {
    console.log(`Semantic stream: ${seed.join(' / ')}`);
    const [stream] = await initStreams([seed], {
      registerExitHandlers: false,
      wordStreamOptions,
    });
    streams.push({ id: `stream-${index + 1}`, seed, stream });
  }
  const state = {
    formatVersion: 1,
    source: { type: 'word-stream', words, modulePath, userAgent: wordStreamOptions.userAgent, requestPolicy: wordStreamOptions.requestPolicy },
    streams: checkpointPath ? wordStreamSnapshot(streams) : null,
    pendingSemantic: null,
    pendingEntries: [],
    pendingCapturedAt: null,
  };
  await saveCheckpoint(checkpointPath, state);
  return createCheckpointedSource(state, { checkpointPath, streams });
}
