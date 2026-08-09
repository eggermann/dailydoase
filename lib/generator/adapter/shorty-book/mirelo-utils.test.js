import { expect, jest, test } from '@jest/globals';

import {
  addMireloAudioAndUpload,
  buildSemanticMireloPrompt,
  deriveMireloSeed,
  formatMireloFailureWarning,
} from './mirelo-utils.js';

test('formatMireloFailureWarning creates a prominent red terminal error', () => {
  const warning = formatMireloFailureWarning('generation unavailable');

  expect(warning).toContain('\u001b[1;31m');
  expect(warning).toContain('MIRELO MUSIC / SOUND FX FAILED');
  expect(warning).toContain('generation unavailable');
  expect(warning).toContain('\u001b[0m');
});

test('buildSemanticMireloPrompt turns stream words into changing sound direction', () => {
  const prompt = buildSemanticMireloPrompt({
    semanticWords: ['Department store', 'Landscape', 'Fast food'],
    scenePlan: [{ title: 'Retail Wind' }, { title: 'Fryer Exit' }],
  });

  expect(prompt).toContain('Semantic stream: Department store, Landscape, Fast food.');
  expect(prompt).toContain('checkout conveyor ticks');
  expect(prompt).toContain('fryer hiss');
  expect(prompt).toContain('Retail Wind → Fryer Exit');
});

test('deriveMireloSeed changes for each trailer while remaining reproducible', () => {
  expect(deriveMireloSeed({ baseSeed: 0, fileName: 'trailer-a', prompt: 'sound' }))
    .toBe(deriveMireloSeed({ baseSeed: 0, fileName: 'trailer-a', prompt: 'sound' }));
  expect(deriveMireloSeed({ baseSeed: 0, fileName: 'trailer-a', prompt: 'sound' }))
    .not.toBe(deriveMireloSeed({ baseSeed: 0, fileName: 'trailer-b', prompt: 'sound' }));
});

test('addMireloAudioAndUpload uses Runware when direct Mirelo returns no result', async () => {
  const runwareFallbackGenerator = jest.fn().mockResolvedValue({
    file: '/tmp/trailer-with-runware-sfx.mp4',
    cost: 0.12,
  });

  const result = await addMireloAudioAndUpload({
    mireloAI: {
      prompt: jest.fn().mockResolvedValue(null),
    },
    imageDir: '/tmp',
    fileName: 'trailer',
    startFrame: {
      json: { metadata: { prompt: 'Kaufhaus ambience' } },
    },
    videoData: {
      file: '/tmp/silent-trailer.mp4',
    },
    options: {
      mireloAI: {
        runwareFallback: {
          enabled: true,
          model: 'mirelo:1@1',
          seed: 3,
          steps: 28,
        },
      },
    },
    runwareFallbackGenerator,
  });

  expect(result).toBe('/tmp/trailer-with-runware-sfx.mp4');
  expect(runwareFallbackGenerator).toHaveBeenCalledWith(expect.objectContaining({
    videoInput: '/tmp/silent-trailer.mp4',
    prompt: 'Kaufhaus ambience',
    model: 'mirelo:1@1',
    seed: expect.any(Number),
    steps: 28,
  }));
});
