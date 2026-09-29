import path from 'node:path';
import { jest } from '@jest/globals';

import { createCameraInputController } from './camera-input.js';

test('resolves a configured local camera image without touching capture', async () => {
  const captureWebcamImage = jest.fn();
  const controller = createCameraInputController({
    cameraOutputDir: '/tmp/selfomat-camera-test',
    camera: {
      imagePath: './fixtures/input.jpg',
      protagonistImageUrl: '',
      imageUrls: [],
      outputDir: '/tmp/selfomat-camera-test',
      fallbackImagePath: '',
      width: 640,
      height: 480,
      quality: 90,
      warmupSeconds: 0,
      device: false,
    },
    sceneContextImage: {
      enabled: false,
      urls: [],
      folderUrl: '',
      apiUrl: '',
      startAfterProtagonist: false,
    },
    captureWebcamImage,
  });

  await expect(controller.resolveSceneContextImages({ sceneCount: 3 })).resolves.toEqual([]);
  await expect(controller.resolveConfiguredCameraImage()).resolves.toEqual({
    imagePath: path.resolve('./fixtures/input.jpg'),
    imageSource: 'configured',
  });
  expect(captureWebcamImage).not.toHaveBeenCalled();
});
