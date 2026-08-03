import { expect, jest, test } from '@jest/globals';

import {
  buildCollisionSourceCues,
  buildSourceCues,
  normalizeSourceCueMode,
  resolveSourceCueMixType,
  resolveStaticSourceCues,
} from './source-cues.js';

test('normalizeSourceCueMode enables collision mode explicitly', () => {
  expect(normalizeSourceCueMode('collision')).toBe('collision');
  expect(normalizeSourceCueMode('random')).toBe('mixed');
});

test('buildCollisionSourceCues rotates anchor while preserving conflicting streams', async () => {
  const streams = [
    { startWord: '1983' },
    { startWord: 'Kaufhaus' },
    { startWord: 'Kunstausstellung' },
  ];
  const promptCreatorImpl = {
    default: jest.fn(async ([stream]) => `${stream.startWord}-association`),
  };

  const sourceCues = await buildCollisionSourceCues({
    streams,
    sceneCount: 3,
    promptCreatorImpl,
  });

  expect(sourceCues[0]).toContain('Anchor (1983): 1983-association.');
  expect(sourceCues[0]).toContain('Collision A (Kaufhaus): Kaufhaus-association.');
  expect(sourceCues[1]).toContain('Anchor (Kaufhaus): Kaufhaus-association.');
  expect(sourceCues[1]).toContain('Collision A (1983): 1983-association.');
  expect(sourceCues[2]).toContain('Anchor (Kunstausstellung): Kunstausstellung-association.');
  expect(sourceCues.every((cue) => cue.includes('do not explain or harmonize'))).toBe(true);
  expect(promptCreatorImpl.default).toHaveBeenCalledTimes(9);
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
