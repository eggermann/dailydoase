import promptCreator from '../../../prompt-creator.js';
import { Taktmuster } from 'taktmuster';
import {
  isReferenceImageActorMode,
} from './LiveContextOrchestrator-config.js';

const normalizeString = (value) => (typeof value === 'string' ? value.trim() : '');

const sentenceList = (value) => (Array.isArray(value)
  ? value.map(normalizeString).filter(Boolean).slice(0, 1)
  : [normalizeString(value)].filter(Boolean));

const readSemanticStreamGetNextResult = (result, { streamIndex, cueIndex } = {}) => ({
  call: 'semanticStream.getNext()',
  streamIndex,
  cueIndex,
  title: normalizeString(result?.title),
  linkWord: normalizeString(result?.linkWord),
  cnt: Number.isFinite(Number(result?.cnt)) ? Number(result.cnt) : null,
  prev: sentenceList(result?.sentences?.prev),
  next: sentenceList(result?.sentences?.next),
});

const readSemanticSceneAspect = (result, { streamIndex, cueIndex } = {}) => ({
  call: 'semanticStream.getNext()',
  role: 'scene-aspect',
  streamIndex,
  cueIndex,
  title: normalizeString(result?.title),
  linkWord: normalizeString(result?.linkWord),
  cnt: Number.isFinite(Number(result?.cnt)) ? Number(result.cnt) : null,
  prev: sentenceList(result?.sentences?.prev),
  next: sentenceList(result?.sentences?.next),
});

export const resolveSourceCuePattern = ({
  pattern = [],
  sceneCount = 1,
  sourceCueCount,
  useTaktmuster = false,
  taktmusterRuntime = null,
  taktCnt = 2,
  zaehler = 4,
  nenner = 4,
  type = 'balanced',
  patternTrace = [],
} = {}) => {
  const normalized = (Array.isArray(pattern) ? pattern : [])
    .map((value) => Math.floor(Number(value)))
    .filter((value) => Number.isFinite(value) && value > 0);
  const count = Math.max(1, Math.floor(Number(sceneCount) || 1));
  if (normalized.length === 0 && useTaktmuster) {
    const taktmuster = taktmusterRuntime || createSourceCueTaktmuster({
      taktCnt,
      zaehler,
      nenner,
      type,
    });
    return Array.from({ length: count }, () => {
      const step = taktmuster.getNext();
      const patternValue = Math.max(1, Math.floor(Number(step?.patternValue ?? step) || 1));
      if (Array.isArray(patternTrace)) {
        patternTrace.push({
          call: 'taktmuster.getNext()',
          result: step,
          patternValue,
        });
      }
      return patternValue;
    });
  }
  if (normalized.length === 0) {
    const totalCueCount = Math.max(
      count,
      Math.floor(Number(sourceCueCount) || 0),
    );
    const base = Math.floor(totalCueCount / count);
    const remainder = totalCueCount % count;
    return Array.from({ length: count }, (_, index) => base + (index < remainder ? 1 : 0));
  }
  return Array.from({ length: count }, (_, index) => normalized[index % normalized.length]);
};

export const sumSourceCuePattern = (pattern = []) => (Array.isArray(pattern) ? pattern : [])
  .reduce((sum, value) => sum + Math.max(0, Math.floor(Number(value) || 0)), 0);

export const groupSourceCuesByPattern = (sourceCues = [], pattern = []) => {
  const cues = Array.isArray(sourceCues) ? sourceCues : [];
  let offset = 0;
  return (Array.isArray(pattern) ? pattern : []).map((size) => {
    const count = Math.max(0, Math.floor(Number(size) || 0));
    const batch = cues.slice(offset, offset + count);
    offset += count;
    return batch;
  });
};

export const groupSourceCueTraceByPattern = (trace = [], pattern = []) => {
  const entries = Array.isArray(trace) ? trace : [];
  const batches = [];
  let offset = 0;
  (Array.isArray(pattern) ? pattern : []).forEach((size) => {
    const count = Math.max(0, Math.floor(Number(size) || 0));
    const end = offset + count;
    batches.push(entries.filter((entry) => Number(entry?.cueIndex) >= offset && Number(entry?.cueIndex) < end));
    offset = end;
  });
  return batches;
};

export const resolveSemanticSceneCount = ({ words = [], min = 1, max = 8 } = {}) => {
  const lowerBound = Math.max(1, Math.floor(Number(min) || 1));
  const upperBound = Math.max(lowerBound, Math.floor(Number(max) || 8));
  const count = Array.isArray(words)
    ? words.filter((word) => (
        Array.isArray(word)
          ? normalizeString(word[0]).length > 0
          : normalizeString(word).length > 0
      )).length
    : 0;
  return Math.min(upperBound, Math.max(lowerBound, count || lowerBound));
};

export const resolveSourceCueMixType = ({
  configMode = 'generated',
  requestedMixType = 'random',
} = {}) => (isReferenceImageActorMode(configMode)
  ? 'sequential'
  : requestedMixType);

export const resolveStaticSourceCues = (cueCount, staticSourceCues = []) => {
  const cues = Array.isArray(staticSourceCues) && staticSourceCues.length > 0
    ? staticSourceCues
    : ['documentary opening', 'detail shot', 'human scene', 'reflective ending'];
  return Array.from({ length: Math.max(1, Number(cueCount) || 1) }, (_, index) => cues[index % cues.length]);
};

export const buildSourceCues = async ({
  streams = [],
  sceneCount = 1,
  sourceCueCount,
  configMode = 'generated',
  staticTestMode = false,
  staticSourceCues = [],
  requestedMixType = 'random',
  promptCreatorImpl = promptCreator,
  streamGetNextTrace = [],
  sceneAspectCues = [],
  sceneAspectTrace = [],
} = {}) => {
  const cueCount = Number.isFinite(Number(sourceCueCount)) && Number(sourceCueCount) > 0
    ? Math.floor(Number(sourceCueCount))
    : Math.max(1, Number(sceneCount) || 1);
  if (staticTestMode) {
    return resolveStaticSourceCues(cueCount, staticSourceCues);
  }

  const streamMixType = resolveSourceCueMixType({
    configMode,
    requestedMixType,
  });
  const sourceCues = [];
  let activeCueIndex = 0;
  const tracedStreams = (Array.isArray(streams) ? streams : []).map((stream, streamIndex) => {
    if (!stream || typeof stream.getNext !== 'function') return stream;
    return new Proxy(stream, {
      get(target, property, receiver) {
        if (property !== 'getNext') return Reflect.get(target, property, receiver);
        return async (...args) => {
          const result = await target.getNext(...args);
          if (Array.isArray(streamGetNextTrace)) {
            streamGetNextTrace.push(readSemanticStreamGetNextResult(result, {
              streamIndex,
              cueIndex: activeCueIndex,
            }));
          }
          return result;
        };
      },
    });
  });
  const usableTracedStreams = tracedStreams
    .filter((stream) => stream && typeof stream.getNext === 'function');
  const usableRawStreams = (Array.isArray(streams) ? streams : [])
    .filter((stream) => stream && typeof stream.getNext === 'function');

  for (let index = 0; index < cueCount; index += 1) {
    activeCueIndex = index;
    if (usableTracedStreams.length === 0) {
      sourceCues.push(await promptCreatorImpl.default([], { streamMixType }));
      continue;
    }

    const streamIndex = index % usableTracedStreams.length;
    sourceCues.push(await promptCreatorImpl.default(
      [usableTracedStreams[streamIndex]],
      { streamMixType: 'sequential' },
    ));

  }

  // One second pull per scene supplies an independent environment/aspect
  // cue. Keep it out of sourceCueCount: it shapes room, location, object,
  // light, or atmosphere, while primary cues remain story causes. Pull once
  // per scene, not once per source-cue batch, so large Taktmuster batches do
  // not create huge planner input.
  for (let sceneIndex = 0; sceneIndex < Math.max(1, Number(sceneCount) || 1); sceneIndex += 1) {
    if (usableRawStreams.length === 0) break;
    const streamIndex = sceneIndex % usableRawStreams.length;
    const aspectResult = await usableRawStreams[streamIndex].getNext();
    const aspectTrace = readSemanticSceneAspect(aspectResult, {
      streamIndex,
      cueIndex: sceneIndex,
    });
    if (Array.isArray(sceneAspectTrace)) {
      sceneAspectTrace.push(aspectTrace);
    }
    if (Array.isArray(sceneAspectCues)) {
      sceneAspectCues.push(aspectTrace.title || aspectTrace.linkWord || '');
    }
  }

  return sourceCues;
};

export const createSourceCueTaktmuster = ({
  taktCnt = 2,
  zaehler = 4,
  nenner = 4,
  type = 'balanced',
} = {}) => {
  const taktmuster = new Taktmuster();
  taktmuster.setTakt(
    Math.max(1, Math.floor(Number(taktCnt) || 2)),
    Math.max(1, Math.floor(Number(zaehler) || 4)),
    Math.max(1, Math.floor(Number(nenner) || 4))
  );
  taktmuster.setType(type);
  return taktmuster;
};

export default {
  buildSourceCues,
  createSourceCueTaktmuster,
  groupSourceCueTraceByPattern,
  groupSourceCuesByPattern,
  resolveSourceCueMixType,
  resolveSourceCuePattern,
  resolveStaticSourceCues,
  sumSourceCuePattern,
};
