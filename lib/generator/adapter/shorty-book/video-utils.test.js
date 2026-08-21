import { buildVideoConfig, prepareVideoGeneration } from './video-utils.js';
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

  test('passes an explicit first-last endpoint into the video model config', () => {
    const config = buildVideoConfig({
      config: {},
      addStaticPrompt: (prompt) => prompt,
      generatedPrompt: 'Move toward the new cast arrangement.',
      videoModel: { model: {} },
      startFrame: { json: { metadata: { prompt: 'current frame' } } },
      options: {
        endImageStream: '/tmp/cast-transition-target.png',
        sceneContext: { index: 2, total: 3 },
      },
    });

    expect(config.endImageStream).toBe('/tmp/cast-transition-target.png');
  });
});
