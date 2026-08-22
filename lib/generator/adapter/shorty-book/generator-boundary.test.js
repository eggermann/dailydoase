import { expect, jest, test } from '@jest/globals';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';

import Generator from './generator.js';

test('locationReturn renders generated scene last frame to fresh camera frame', async () => {
  const imageDir = await fs.mkdtemp(path.join(os.tmpdir(), 'generator-boundary-'));
  const promptDir = path.join(imageDir, 'prompts');
  await fs.ensureDir(promptDir);
  const generator = Object.create(Generator.prototype);
  generator.imageDir = imageDir;
  generator.lastEndFRame = null;
  generator.generateSceneClip = jest.fn(async ({ startFrame, options, endFrameOverride, useSingleImage }) => {
    generator.lastEndFRame = {
      image: { path: `/generated/scene-${options.sceneContext.index}-last.png` },
    };
    return {
      generatedPrompt: `scene ${options.sceneContext.index}`,
      mergedConfig: {},
      videoData: { file: `/video/scene-${options.sceneContext.index}.mp4` },
    };
  });
  generator.resolveChainedStartFrameFromLastEnd = jest.fn(async () => generator.lastEndFRame);
  generator.getAsyncPersonaReferenceConfig = () => ({});
  generator.scheduleAsyncPersonaReferenceCapture = async () => null;
  generator.finalizeSceneLoopResult = async ({ clipResults }) => clipResults;

  const sceneLoop = {
    scenePlan: [
      { title: 'Opening', frameSource: 'newImage', videoMode: 'singleImage', freshImage: true, useCameraShot: true, durationSeconds: 2 },
      { title: 'Next', frameSource: 'lastFrame', videoMode: 'singleImage', freshImage: false, useCameraShot: false, durationSeconds: 3 },
    ],
    firstClipUseSingleImage: true,
    subsequentClipsUseSingleImage: true,
    captureLastFrame: true,
    mireloMode: 'off',
    onSceneBoundary: async () => ({
      command: 'locationReturn',
      reason: 'Return to existing counter.',
      storyBridge: 'Generated shadow reaches real counter.',
      transitionPrompt: 'Track shadow until it resolves on counter.',
      cameraImagePath: '/camera/fresh-room.jpg',
      cameraVisionText: 'Assets: counter.',
      cameraHasPeople: false,
    }),
  };

  await generator.continueSceneLoop({
    streams: [],
    options: {},
    fileName: 'mock',
    sceneLoop,
    clipCount: 2,
    imageOptions: {},
    promptDir,
    clipResults: [],
    startFrame: { image: { path: '/camera/opening.jpg' } },
  });

  expect(generator.generateSceneClip).toHaveBeenCalledTimes(2);
  const secondCall = generator.generateSceneClip.mock.calls[1][0];
  expect(secondCall.startFrame.image.path).toBe('/generated/scene-1-last.png');
  expect(secondCall.endFrameOverride.path).toBe('/camera/fresh-room.jpg');
  expect(secondCall.useSingleImage).toBe(false);
  expect(sceneLoop.scenePlan[1]).toMatchObject({
    frameSource: 'lastFrame',
    videoMode: 'firstLast',
    freshImage: false,
    useCameraShot: true,
  });
});
