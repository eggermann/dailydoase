import { expect, jest, test } from '@jest/globals';

import {
  buildSourceCues,
  groupSourceCueTraceByPattern,
  groupSourceCuesByPattern,
  resolveSemanticSceneCount,
  resolveSourceCueMixType,
  resolveSourceCuePattern,
  resolveStaticSourceCues,
  sumSourceCuePattern,
} from './source-cues.js';

test('resolveSemanticSceneCount maps configured semantic words to bounded scene count', () => {
  expect(resolveSemanticSceneCount({ words: [['love', 'en'], ['animal', 'en']] })).toBe(2);
  expect(resolveSemanticSceneCount({ words: [['love', 'en']], min: 3 })).toBe(3);
  expect(resolveSemanticSceneCount({
    words: Array.from({ length: 12 }, (_, index) => [`w${index}`, 'en']),
    max: 5,
  })).toBe(5);
});

test('resolveSourceCueMixType defaults camera mode to sequential', () => {
  expect(resolveSourceCueMixType({
    configMode: 'camera',
    requestedMixType: 'random',
  })).toBe('sequential');
});

test('resolveSourceCueMixType keeps generated mode on the requested mix type', () => {
  expect(resolveSourceCueMixType({
    configMode: 'generated',
    requestedMixType: 'random',
  })).toBe('random');
});

test('buildSourceCues gives each cue exactly one rotating stream', async () => {
  const promptCreatorImpl = {
    default: jest.fn(async (streams, { streamMixType }) => `${streamMixType}-${streams.length}-cue`),
  };

  const sourceCues = await buildSourceCues({
    streams: [{ getNext: async () => ({}) }, { getNext: async () => ({}) }],
    sceneCount: 3,
    configMode: 'camera',
    promptCreatorImpl,
  });

  expect(sourceCues).toEqual(['sequential-1-cue', 'sequential-1-cue', 'sequential-1-cue']);
  expect(promptCreatorImpl.default).toHaveBeenCalledTimes(3);
  expect(promptCreatorImpl.default).toHaveBeenNthCalledWith(
    1,
    [expect.any(Object)],
    { streamMixType: 'sequential' },
  );
});

test('three source cues call getNext once each, across three streams', async () => {
  const streams = [0, 1, 2].map((streamIndex) => ({
    getNext: jest.fn(async () => ({ title: `stream-${streamIndex}` })),
  }));
  const trace = [];

  const sourceCues = await buildSourceCues({
    streams,
    sceneCount: 3,
    sourceCueCount: 3,
    streamGetNextTrace: trace,
    promptCreatorImpl: {
      default: async ([stream]) => (await stream.getNext()).title,
    },
  });

  expect(sourceCues).toEqual(['stream-0', 'stream-1', 'stream-2']);
  expect(streams.map((stream) => stream.getNext.mock.calls.length)).toEqual([2, 2, 2]);
  expect(trace.map((entry) => entry.streamIndex)).toEqual([0, 1, 2]);
  expect(trace.map((entry) => entry.cueIndex)).toEqual([0, 1, 2]);
});

test('takes one extra semantic item per scene for environment aspects', async () => {
  const stream = {
    getNext: jest.fn()
      .mockResolvedValueOnce({ title: 'gambling' })
      .mockResolvedValueOnce({ title: 'dream' })
      .mockResolvedValueOnce({ title: 'neon light' })
      .mockResolvedValueOnce({ title: 'threshold' }),
  };
  const sceneAspectCues = [];
  const sceneAspectTrace = [];

  await buildSourceCues({
    streams: [stream],
    sceneCount: 2,
    sourceCueCount: 2,
    sceneAspectCues,
    sceneAspectTrace,
    promptCreatorImpl: {
      default: async ([activeStream]) => (await activeStream.getNext()).title,
    },
  });

  expect(sceneAspectCues).toEqual(['neon light', 'threshold']);
  expect(sceneAspectTrace).toEqual([
    expect.objectContaining({ role: 'scene-aspect', title: 'neon light', cueIndex: 0 }),
    expect.objectContaining({ role: 'scene-aspect', title: 'threshold', cueIndex: 1 }),
  ]);
  expect(stream.getNext).toHaveBeenCalledTimes(4);
});

test('buildSourceCues keeps source cue count independent from scene count', async () => {
  const promptCreatorImpl = {
    default: jest.fn(async () => 'cue'),
  };

  const sourceCues = await buildSourceCues({
    streams: [{}],
    sceneCount: 3,
    sourceCueCount: 8,
    promptCreatorImpl,
  });

  expect(sourceCues).toHaveLength(8);
  expect(promptCreatorImpl.default).toHaveBeenCalledTimes(8);
});

test('buildSourceCues preserves provider prev/next snippets unchanged', async () => {
  const trace = [];
  const stream = {
    getNext: jest.fn(async () => ({
      title: 'current semantic word',
      sentences: { prev: ['before semantic word'], next: ['after semantic word'] },
    })),
  };
  const sourceCues = await buildSourceCues({
    streams: [stream],
    sceneCount: 1,
    sourceCueCount: 1,
    streamGetNextTrace: trace,
    promptCreatorImpl: {
      default: async (streams) => (await streams[0].getNext()).title,
    },
  });

  expect(sourceCues).toEqual(['current semantic word']);
  expect(trace).toEqual([{
    call: 'semanticStream.getNext()',
    streamIndex: 0,
    cueIndex: 0,
      title: 'current semantic word',
      linkWord: '',
      cnt: null,
    prev: ['before semantic word'],
    next: ['after semantic word'],
  }]);
  expect(groupSourceCueTraceByPattern(trace, [1])).toEqual([trace]);
});

test('buildSourceCues keeps at most one prev and next snippet per stream item', async () => {
  const trace = [];
  const stream = {
    getNext: jest.fn(async () => ({
      title: 'animal',
      sentences: {
        prev: ['first before', 'second before'],
        next: ['first after', 'second after'],
      },
    })),
  };

  await buildSourceCues({
    streams: [stream],
    sceneCount: 1,
    sourceCueCount: 1,
    streamGetNextTrace: trace,
    promptCreatorImpl: {
      default: async (streams) => (await streams[0].getNext()).title,
    },
  });

  expect(trace[0].prev).toEqual(['first before']);
  expect(trace[0].next).toEqual(['first after']);
});

test('source cue Taktmuster distributes semantic material by scene', () => {
  const pattern = resolveSourceCuePattern({ pattern: [2, 4, 4], sceneCount: 3 });
  const batches = groupSourceCuesByPattern(
    ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'],
    pattern
  );

  expect(pattern).toEqual([2, 4, 4]);
  expect(sumSourceCuePattern(pattern)).toBe(10);
  expect(batches).toEqual([
    ['a', 'b'],
    ['c', 'd', 'e', 'f'],
    ['g', 'h', 'i', 'j'],
  ]);
});

test('flat source cue count still creates scene batches for planner trace', () => {
  const pattern = resolveSourceCuePattern({
    sceneCount: 3,
    sourceCueCount: 8,
  });
  const trace = Array.from({ length: 8 }, (_, cueIndex) => ({
    cueIndex,
    title: `cue-${cueIndex}`,
    prev: [],
    next: [],
  }));

  expect(pattern).toEqual([3, 3, 2]);
  expect(groupSourceCueTraceByPattern(trace, pattern).map((batch) => batch.length)).toEqual([3, 3, 2]);
});

test('source cue Taktmuster uses one package getNext value per scene', () => {
  const patternTrace = [];
  expect(resolveSourceCuePattern({
    sceneCount: 5,
    useTaktmuster: true,
    taktCnt: 2,
    zaehler: 4,
    nenner: 4,
    type: 'balanced',
    patternTrace,
  })).toEqual([4, 1, 2, 1, 3]);
  expect(patternTrace).toHaveLength(5);
  expect(patternTrace[0]).toMatchObject({ call: 'taktmuster.getNext()', patternValue: 4 });
});

test('resolveStaticSourceCues repeats provided static cues across the requested scene count', () => {
  expect(resolveStaticSourceCues(5, ['alpha', 'beta'])).toEqual([
    'alpha',
    'beta',
    'alpha',
    'beta',
    'alpha',
  ]);
});
