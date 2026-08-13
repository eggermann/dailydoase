import { afterEach, expect, jest, test } from '@jest/globals';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';

import Generator from './generator.js';

let tempDir = '';

const makeFile = async (name) => {
  const filePath = path.join(tempDir, name);
  await fs.writeFile(filePath, name);
  return filePath;
};

const createGenerator = ({ localPath, monsterPath, openingPath } = {}) => {
  const generator = Object.create(Generator.prototype);
  generator.config = {
    sceneLoop: {
      sceneContextImage: {
        images: [{ path: localPath }],
      },
      openingImage: {
        imagePath: openingPath,
        personaReferencePath: monsterPath,
        monsterContinuityAnchorPath: monsterPath,
        storyRunIndex: 2,
      },
    },
  };
  generator.getDriftCorrectionConfig = () => ({
    enabled: true,
    plannerControlled: true,
    applyToSingleImage: true,
    applyToFirstLast: false,
    localLocationPercent: 100,
    maxConsecutiveRawLastFrames: 2,
    cameraMode: false,
    contextBuffer: { enabled: false },
    model: {
      model: 'runware:106@1',
      hfProvider: 'runware',
      negative_prompt: 'different location',
    },
  });
  generator.getContextBufferConfig = () => ({ enabled: false });
  generator.resolveDriftCorrectionReferenceImage = async ({ lastFrame }) => ({
    path: lastFrame.image.path,
    sourceType: 'lastFrame',
  });
  generator.driftCorrectionModel = {
    prompt: jest.fn(async () => ({ image: { path: path.join(tempDir, 'corrected.png') } })),
  };
  return generator;
};

afterEach(async () => {
  if (tempDir) await fs.remove(tempDir);
  tempDir = '';
});

test('mapped local Kaufhaus image is the first monster-free correction reference', async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'kaufhaus-drift-'));
  const localPath = await makeFile('location-elevators.jpeg');
  const monsterPath = await makeFile('monster.png');
  const lastFramePath = await makeFile('last-frame.png');
  const generator = createGenerator({ localPath, monsterPath, openingPath: monsterPath });
  const scene = {
    sceneFocus: 'location',
    stillPrompt: 'The elevator doors retain a physical dent.',
    consequence: 'A dent remains in the left door.',
  };

  await generator.correctLastFrameForNextScene({
    lastFrame: {
      image: { path: lastFramePath },
      json: { metadata: { prompt: 'COMPLETE PREVIOUS PROVIDER PROMPT' } },
    },
    nextScenePlanEntry: scene,
    nextSceneContext: { index: 1, driftCorrectionReason: 'mapped-location-change' },
  });

  const [prompt, options] = generator.driftCorrectionModel.prompt.mock.calls[0];
  expect(options.images.map((entry) => entry.path)).toEqual([localPath]);
  expect(options.negative_prompt).toContain('green humanoid');
  expect(prompt).toContain(scene.stillPrompt);
  expect(prompt).toContain(scene.consequence);
  expect(prompt).not.toContain('COMPLETE PREVIOUS PROVIDER PROMPT');
});

test('monster-visible correction receives local Kaufhaus then canonical monster', async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'kaufhaus-drift-'));
  const localPath = await makeFile('location-mirrored-columns.jpeg');
  const monsterPath = await makeFile('canonical-monster.png');
  const lastFramePath = await makeFile('last-frame.png');
  const generator = createGenerator({ localPath, monsterPath, openingPath: monsterPath });

  const corrected = await generator.correctLastFrameForNextScene({
    lastFrame: { image: { path: lastFramePath }, json: { metadata: {} } },
    nextScenePlanEntry: { sceneFocus: 'monster', stillPrompt: 'The existing monster turns.' },
    nextSceneContext: { index: 1, driftCorrectionReason: 'unknown-monster-identity' },
  });

  const [prompt, options] = generator.driftCorrectionModel.prompt.mock.calls[0];
  expect(options.images.map((entry) => entry.path)).toEqual([localPath, monsterPath]);
  expect(prompt).toMatch(/^LIVE-ACTION PHOTOGRAPHY ONLY\./);
  expect(prompt.length).toBeLessThanOrEqual(1901);
  expect(prompt).toContain('exact supplied green botanical protagonist');
  expect(prompt).toContain('never redesign it as another species or generic creature');
  expect(corrected.json.metadata).toMatchObject({
    driftCorrectionFocus: 'combined',
    driftCorrectionMonsterReferenceIncluded: true,
    monsterIdentityState: 'canonical',
  });
});

test('fresh location reanchor skips paid drift correction', async () => {
  const context = {
    driftCorrectionModel: {},
    getDriftCorrectionConfig: () => ({ enabled: true }),
  };
  await expect(Generator.prototype.shouldApplyDriftCorrection.call(context, {
    nextScenePlanEntry: { startFrameStrategy: 'locationReanchor' },
    nextSceneContext: { index: 3 },
  })).resolves.toBe(false);
});

test('raw last-frame scene receives deterministic local correction', async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'kaufhaus-drift-'));
  const localPath = await makeFile('location-central-hall.jpeg');
  const lastFramePath = await makeFile('last-frame.png');
  const generator = createGenerator({ localPath, monsterPath: '', openingPath: '' });
  generator.lastEndFRame = {
    image: { path: lastFramePath },
    json: { metadata: { sceneContextImagePath: localPath } },
  };

  await expect(generator.shouldApplyDriftCorrection({
    nextScenePlanEntry: {
      startFrameStrategy: 'rawLastFrame',
      frameSource: 'lastFrame',
      videoMode: 'singleImage',
      sceneFocus: 'trace',
      semanticAnchor: 'Kaufhaus',
      semanticCollision: 'Staub',
    },
    nextSceneContext: { index: 2, rawLastFrameStreak: 1 },
  })).resolves.toBe(true);
});
