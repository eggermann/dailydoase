import { prepareVideoGeneration } from './video-utils.js';
import { jest } from '@jest/globals';

describe('prepareVideoGeneration', () => {
  test('builds a generated first-last endpoint from the current start frame', async () => {
    const startFrame = {
      image: { path: '/tmp/current-shot.png' },
      json: { metadata: { prompt: 'current surveillance frame' } },
    };
    const generatedEndFrame = {
      image: { path: '/tmp/next-shot.png' },
      json: { metadata: { prompt: 'next surveillance frame' } },
    };
    const generateImage = jest.fn().mockResolvedValue(generatedEndFrame);

    const result = await prepareVideoGeneration({
      startFrame,
      streams: {},
      options: { video: {} },
      fileName: 'scene-03',
      useSingleImage: false,
      imageOptions: {
        imagePath: '/tmp/old-persona-reference.jpg',
        images: ['/tmp/old-persona-reference.jpg'],
      },
      videoModelFirstLast: { prompt: jest.fn() },
      videoModelSingle: { prompt: jest.fn() },
      generateImage,
    });

    expect(generateImage).toHaveBeenCalledWith({}, expect.objectContaining({
      imagePath: '/tmp/current-shot.png',
      images: ['/tmp/old-persona-reference.jpg'],
      frameRole: 'end',
    }));
    expect(result.lastEndFrame).toBe(generatedEndFrame);
  });
});
