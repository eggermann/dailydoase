import { expect, jest, test } from '@jest/globals';

import {
  addMireloAudioAndUpload,
  formatMireloFailureWarning,
} from './mirelo-utils.js';

test('formatMireloFailureWarning creates a prominent red terminal error', () => {
  const warning = formatMireloFailureWarning('generation unavailable');

  expect(warning).toContain('\u001b[1;31m');
  expect(warning).toContain('MIRELO MUSIC / SOUND FX FAILED');
  expect(warning).toContain('generation unavailable');
  expect(warning).toContain('\u001b[0m');
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
    seed: 3,
    steps: 28,
  }));
});
