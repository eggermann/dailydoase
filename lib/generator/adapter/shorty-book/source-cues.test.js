import { expect, jest, test } from '@jest/globals';

import {
  buildSourceCues,
  resolveSourceCueMixType,
  resolveStaticSourceCues,
} from './source-cues.js';

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

test('resolveSourceCueMixType keeps an explicit sequential stream for camera-grounded mode', () => {
  expect(resolveSourceCueMixType({
    configMode: 'reference-image-actor',
    requestedMixType: 'sequential',
  })).toBe('sequential');
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

test('buildSourceCues calls getNext once for every semantic stream in a sequential cue', async () => {
  const streams = ['Kaufhaus', 'animal', 'isolation strategy', 'Art_critic'].map((word) => ({
    getNext: jest.fn(async () => ({
      title: word,
      sentences: { prev: [''], next: [`${word} next`] },
    })),
  }));

  const [cue] = await buildSourceCues({
    streams,
    sceneCount: 1,
    configMode: 'reference-image-actor',
    requestedMixType: 'sequential',
  });

  expect(cue).toContain('Kaufhaus next');
  expect(cue).toContain('animal next');
  expect(cue).toContain('isolation strategy next');
  expect(cue).toContain('Art_critic next');
  streams.forEach((stream) => expect(stream.getNext).toHaveBeenCalledTimes(1));
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
