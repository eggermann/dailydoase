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

test('buildSourceCues uses sequential stream steps in camera mode', async () => {
  const promptCreatorImpl = {
    default: jest.fn(async (_streams, { streamMixType }) => `${streamMixType}-cue`),
  };

  const sourceCues = await buildSourceCues({
    streams: [{}, {}],
    sceneCount: 3,
    configMode: 'camera',
    promptCreatorImpl,
  });

  expect(sourceCues).toEqual(['sequential-cue', 'sequential-cue', 'sequential-cue']);
  expect(promptCreatorImpl.default).toHaveBeenCalledTimes(3);
  expect(promptCreatorImpl.default).toHaveBeenNthCalledWith(1, [{}, {}], { streamMixType: 'sequential' });
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

test('buildSourceCues records semantic stream getNext before/current/after words', async () => {
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
    cnt: null,
    prev: ['before semantic word'],
    next: ['after semantic word'],
    beforeWord: 'before semantic word',
    currentWord: 'current semantic word',
    afterWord: 'after semantic word',
  }]);
  expect(groupSourceCueTraceByPattern(trace, [1])).toEqual([trace]);
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
