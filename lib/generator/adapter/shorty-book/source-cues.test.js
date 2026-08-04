import { expect, jest, test } from '@jest/globals';

import {
  buildCollisionSourceCues,
  buildSourceCues,
  normalizeSourceCueMode,
  resolveSceneDramaticFunction,
  resolveSourceCueMixType,
  resolveStaticSourceCues,
} from './source-cues.js';

test('normalizeSourceCueMode enables collision mode explicitly', () => {
  expect(normalizeSourceCueMode('collision')).toBe('collision');
  expect(normalizeSourceCueMode('random')).toBe('mixed');
});

const createSemanticTestStream = (startWord, terms) => {
  let index = 0;
  return {
    startWord,
    getNext: jest.fn(async () => {
      const term = terms[index];
      index += 1;
      return {
        title: term,
        sentences: {
          prev: [],
          next: [`${term} changes the visible room`],
        },
      };
    }),
  };
};

test('buildCollisionSourceCues carries each fresh term into the next scene', async () => {
  const streams = [
    createSemanticTestStream('1983', ['Videotext', 'Sendeschluss']),
    createSemanticTestStream('Kaufhaus', ['Rolltreppe']),
    createSemanticTestStream('Kunstausstellung', ['Sockel']),
  ];

  const sourceCues = await buildCollisionSourceCues({
    streams,
    sceneCount: 4,
  });

  expect(sourceCues[0]).toContain('Anchor (initial configured term): 1983.');
  expect(sourceCues[0]).toContain('Collision A (fresh getNext from 1983): Videotext.');
  expect(sourceCues[1]).toContain('Anchor (carried semantic inheritance): Videotext.');
  expect(sourceCues[1]).toContain('Collision A (fresh getNext from Kaufhaus): Rolltreppe.');
  expect(sourceCues[2]).toContain('Anchor (carried semantic inheritance): Rolltreppe.');
  expect(sourceCues[2]).toContain('Collision A (fresh getNext from Kunstausstellung): Sockel.');
  expect(sourceCues[3]).toContain('Anchor (carried semantic inheritance): Sockel.');
  expect(sourceCues[3]).toContain('Collision A (fresh getNext from 1983): Sendeschluss.');
  expect(sourceCues[3]).toContain('Final-state rule: Sendeschluss remains visible as the final semantic consequence.');
  expect(sourceCues.every((cue) => cue.includes('do not explain or harmonize'))).toBe(true);
  expect(streams[0].getNext).toHaveBeenCalledTimes(2);
  expect(streams[1].getNext).toHaveBeenCalledTimes(1);
  expect(streams[2].getNext).toHaveBeenCalledTimes(1);
});

test('buildCollisionSourceCues supports one stream for any number of scenes', async () => {
  const stream = createSemanticTestStream(
    'Kaufhaus',
    ['Rolltreppe', 'Verdauung', 'Wetterbericht', 'Korallenriff', 'Staatsvertrag']
  );

  const sourceCues = await buildCollisionSourceCues({
    streams: [stream],
    sceneCount: 5,
  });

  expect(sourceCues).toHaveLength(5);
  expect(sourceCues[0]).toContain('Kaufhaus');
  expect(sourceCues[1]).toContain('Anchor (carried semantic inheritance): Rolltreppe.');
  expect(sourceCues[4]).toContain('Anchor (carried semantic inheritance): Korallenriff.');
  expect(sourceCues[4]).toContain('Collision A (fresh getNext from Kaufhaus): Staatsvertrag.');
  expect(stream.getNext).toHaveBeenCalledTimes(5);
});

test('buildCollisionSourceCues retains prompt-creator compatibility without getNext', async () => {
  const promptCreatorImpl = {
    default: jest.fn(async () => 'legacy semantic association'),
  };

  const sourceCues = await buildCollisionSourceCues({
    streams: [{ startWord: 'Legacy' }],
    sceneCount: 2,
    promptCreatorImpl,
  });

  expect(sourceCues[0]).toContain('Collision A (fresh getNext from Legacy): legacy semantic association.');
  expect(sourceCues[1]).toContain('Anchor (carried semantic inheritance): legacy semantic association.');
  expect(promptCreatorImpl.default).toHaveBeenCalledTimes(2);
});

test('buildCollisionSourceCues does not duplicate existing sentence punctuation', async () => {
  const stream = {
    startWord: '1983',
    getNext: jest.fn(async () => ({
      title: 'Videotext',
      sentences: {
        prev: [],
        next: ['Bildschirmzeichen bilden ein leuchtendes Raster.'],
      },
    })),
  };

  const [sourceCue] = await buildCollisionSourceCues({
    streams: [stream],
    sceneCount: 1,
  });

  expect(sourceCue).toContain('Context: Bildschirmzeichen bilden ein leuchtendes Raster.');
  expect(sourceCue).not.toContain('Raster..');
});

test('resolveSceneDramaticFunction derives roles from scene position', () => {
  expect(resolveSceneDramaticFunction(0, 1)).toContain('condensed arc');
  expect(resolveSceneDramaticFunction(0, 5)).toContain('opening');
  expect(resolveSceneDramaticFunction(2, 5)).toContain('escalation');
  expect(resolveSceneDramaticFunction(3, 5)).toContain('rupture');
  expect(resolveSceneDramaticFunction(4, 5)).toContain('consequence');
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
