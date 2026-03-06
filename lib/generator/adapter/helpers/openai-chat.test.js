import { expect, jest, test } from '@jest/globals';

import { makePromptCreator } from './openai-chat.js';

test('makePromptCreator awaits async buildUser functions', async () => {
  const create = jest.fn().mockResolvedValue({
    choices: [{ message: { content: 'final prompt' } }],
  });

  const promptCreator = makePromptCreator({
    openai: {
      chat: {
        completions: {
          create,
        },
      },
    },
    model: 'gpt-test',
    system: 'system prompt',
    buildUser: async (startPrompt, sceneContext) =>
      `start=${startPrompt}; scene=${sceneContext.sceneLabel}`,
  });

  const result = await promptCreator('opening frame', { sceneLabel: 'scene 1 of 2' });

  expect(result).toBe('final prompt');
  expect(create).toHaveBeenCalledWith({
    model: 'gpt-test',
    messages: [
      { role: 'system', content: 'system prompt' },
      { role: 'user', content: 'start=opening frame; scene=scene 1 of 2' },
    ],
    temperature: 0.4,
    top_p: 0.95,
  });
});
