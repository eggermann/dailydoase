import { expect, jest, test, beforeEach } from '@jest/globals';

const muxVideoAndAudio = jest.fn();
const saveJSON = jest.fn();
const gateConcatAndUpload = jest.fn();
const generateRunwareMireloFallback = jest.fn();

await jest.unstable_mockModule('../../utils.js', () => ({
  muxVideoAndAudio,
}));

await jest.unstable_mockModule('../../save-utils.js', () => ({
  saveJSON,
}));

await jest.unstable_mockModule('../../../helper/yt-upload/gate-and-upload.js', () => ({
  gateConcatAndUpload,
}));

await jest.unstable_mockModule('../../audio/runware/mirelo-video-sound.js', () => ({
  generateRunwareMireloFallback,
}));

const {
  addMireloAudioAndUpload,
} = await import('./mirelo-utils.js');

beforeEach(() => {
  muxVideoAndAudio.mockReset();
  saveJSON.mockReset();
  gateConcatAndUpload.mockReset();
  generateRunwareMireloFallback.mockReset();
  saveJSON.mockImplementation(async (filePath, data = {}) => ({
    path: `${filePath}.json`,
    metadata: data,
    ...data,
  }));
});

test('direct Mirelo success muxes audio and returns the merged video', async () => {
  muxVideoAndAudio.mockResolvedValue('/tmp/merged/trailer-with-sound.mp4');

  const result = await addMireloAudioAndUpload({
    mireloAI: {
      prompt: jest.fn().mockResolvedValue({ file: '/tmp/mirelo.wav' }),
    },
    imageDir: '/tmp/out',
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
    skipGateUpload: true,
    runwareFallbackGenerator: generateRunwareMireloFallback,
  });

  expect(result).toBe('/tmp/merged/trailer-with-sound.mp4');
  expect(muxVideoAndAudio).toHaveBeenCalledWith(
    '/tmp/silent-trailer.mp4',
    '/tmp/mirelo.wav',
    '/tmp/out/merged',
    { outputName: 'trailer-with-sound.mp4' }
  );
  expect(generateRunwareMireloFallback).not.toHaveBeenCalled();
});

test('direct Mirelo prompt failure falls back to Runware when enabled', async () => {
  generateRunwareMireloFallback.mockResolvedValue({
    file: '/tmp/runware-fallback.mp4',
    cost: 0.18,
  });

  const result = await addMireloAudioAndUpload({
    mireloAI: {
      prompt: jest.fn().mockRejectedValue(new Error('mirelo down')),
    },
    imageDir: '/tmp/out',
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
    skipGateUpload: true,
    runwareFallbackGenerator: generateRunwareMireloFallback,
  });

  expect(result).toBe('/tmp/runware-fallback.mp4');
  expect(generateRunwareMireloFallback).toHaveBeenCalledWith(expect.objectContaining({
    videoInput: '/tmp/silent-trailer.mp4',
    prompt: 'Kaufhaus ambience',
    model: 'mirelo:1@1',
    seed: 3,
    steps: 28,
  }));
});

test('direct Mirelo no result returns silent video when Runware fallback is disabled', async () => {
  const fallback = jest.fn();

  const result = await addMireloAudioAndUpload({
    mireloAI: {
      prompt: jest.fn().mockResolvedValue(null),
    },
    imageDir: '/tmp/out',
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
          enabled: false,
        },
      },
    },
    skipGateUpload: true,
    runwareFallbackGenerator: fallback,
  });

  expect(result).toBe('/tmp/silent-trailer.mp4');
  expect(fallback).not.toHaveBeenCalled();
});

test('direct Mirelo audio with mux failure falls back to Runware when enabled', async () => {
  muxVideoAndAudio.mockRejectedValue(new Error('mux failed'));
  generateRunwareMireloFallback.mockResolvedValue({
    file: '/tmp/runware-fallback.mp4',
    cost: 0.22,
  });

  const result = await addMireloAudioAndUpload({
    mireloAI: {
      prompt: jest.fn().mockResolvedValue({ file: '/tmp/mirelo.wav' }),
    },
    imageDir: '/tmp/out',
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
          seed: 7,
          steps: 28,
        },
      },
    },
    skipGateUpload: true,
    runwareFallbackGenerator: generateRunwareMireloFallback,
  });

  expect(result).toBe('/tmp/runware-fallback.mp4');
});

