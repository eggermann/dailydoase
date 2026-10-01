import { describe, expect, jest, test } from '@jest/globals';

import { prepareStoryIteration } from './story-iteration.js';

describe('story iteration preparation', () => {
  test('uses source cue Taktmuster as per-scene batches', async () => {
    let draftInput;
    const result = await prepareStoryIteration({
      streams: ['stream'],
      loopConfig: { outputDir: '/tmp/story' },
      storyConfig: {
        mode: 'camera',
        words: [['love', 'en']],
        sourceCuePattern: [2, 4, 4],
        selfomatEnabled: false,
      },
      resolveOpeningCameraShot: async () => ({ imagePath: '/tmp/input.jpg', imageSource: 'test', visionText: 'a person' }),
      nextStoryRunIndex: () => 1,
      resolveSceneCount: () => 3,
      refreshResolvedSceneLengths: async () => [2, 4, 4],
      resolveSceneContextImages: async () => [],
      buildSourceCues: async ({ sourceCueCount }) => Array.from({ length: sourceCueCount }, (_, index) => `cue-${index + 1}`),
      getFrameVision: jest.fn(),
      visionPrompt: 'describe',
      extractVisionStoryContext: () => ({ actors: [] }),
      summarizeVisionStoryContext: () => 'a person',
      storyTransportController: {
        beginIteration: (input) => {
          draftInput = input;
          return { iteration: 1, topic: 'love', cast: {} };
        },
      },
      adaptSelfomatScenePlan: jest.fn(),
      formatStoryTransportForPrompt: () => 'transport prompt',
      persistOpeningPersonaReference: async () => '',
      buildOpeningVisionPayload: (imagePath, text) => ({ imagePath, outputText: text }),
      setOpeningPromptContinuityVision: jest.fn(),
    });

    expect(result.sourceCueCount).toBe(10);
    expect(result.sourceCuePattern).toEqual([2, 4, 4]);
    expect(result.sourceCueBatches).toEqual([
      ['cue-1', 'cue-2'],
      ['cue-3', 'cue-4', 'cue-5', 'cue-6'],
      ['cue-7', 'cue-8', 'cue-9', 'cue-10'],
    ]);
    expect(draftInput.sourceCueCount).toBe(10);
  });

  test('runs input, rhythm, semantic cues, vision, and transport in order', async () => {
    const calls = [];
    const storyTransportDraft = { iteration: 1, topic: 'love', cast: {} };
    const result = await prepareStoryIteration({
      streams: ['stream'],
      loopConfig: { outputDir: '/tmp/story' },
      storyConfig: {
        mode: 'camera',
        words: [['love', 'en']],
        staticTestMode: true,
        staticSourceCues: ['touch'],
        selfomatEnabled: false,
      },
      resolveOpeningCameraShot: async () => {
        calls.push('input');
        return { imagePath: '/tmp/input.jpg', imageSource: 'test', visionText: 'a person' };
      },
      nextStoryRunIndex: () => 1,
      resolveSceneCount: () => 1,
      refreshResolvedSceneLengths: async () => [3],
      resolveSceneContextImages: async () => [],
      buildSourceCues: async () => {
        calls.push('cues');
        return ['touch'];
      },
      getFrameVision: jest.fn(),
      visionPrompt: 'describe',
      extractVisionStoryContext: (text) => ({ actors: [{ description: text }] }),
      summarizeVisionStoryContext: (text) => text,
      storyTransportController: {
        beginIteration: (input) => {
          calls.push('transport');
          expect(input.sourceCues).toEqual(['touch']);
          return storyTransportDraft;
        },
      },
      adaptSelfomatScenePlan: jest.fn(),
      formatStoryTransportForPrompt: () => 'transport prompt',
      persistOpeningPersonaReference: async () => '',
      buildOpeningVisionPayload: (imagePath, text) => ({ imagePath, outputText: text }),
      setOpeningPromptContinuityVision: (text) => calls.push(`vision:${text}`),
    });

    expect(result).toMatchObject({
      openingCameraShot: '/tmp/input.jpg',
      sourceCues: ['touch'],
      storyTransportDraft,
      storyTransportPrompt: 'transport prompt',
    });
    expect(calls).toEqual(['input', 'cues', 'vision:a person', 'transport']);
  });
});
