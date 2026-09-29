import { expect, jest, test } from '@jest/globals';

import {
  buildSourceCues,
  resolveSemanticSceneCount,
  resolveSourceCueMixType,
  resolveStaticSourceCues,
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

test('resolveStaticSourceCues repeats provided static cues across the requested scene count', () => {
  expect(resolveStaticSourceCues(5, ['alpha', 'beta'])).toEqual([
    'alpha',
    'beta',
    'alpha',
    'beta',
    'alpha',
  ]);
});
