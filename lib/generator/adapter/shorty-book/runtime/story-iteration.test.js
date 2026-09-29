import { describe, expect, jest, test } from '@jest/globals';

import { prepareStoryIteration } from './story-iteration.js';

describe('story iteration preparation', () => {
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
