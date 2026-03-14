import { describe, expect, test } from '@jest/globals';
import dotenv from 'dotenv';
import fs from 'fs-extra';
import OpenAI from 'openai';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractVisionStoryContext, summarizeVisionStoryContext } from './frame-vision.js';

import {
  createWebcamFrameVision,
  createWebcamSceneGenerator,
  captureWebcamImage,
  describeWebcamCameraScenePlanIssues,
  resolveWebcamScenePlanSystemPrompt,
  resolveWebcamVisionSettings,
  sanitizeWebcamCameraScenePlan,
} from '../shorty-book/webcam-defaults.js';

/**
 * Copy/paste from /Users/eggermann/Projekte/dailydoase/lib/generator/adapter/helpers:
 * RUN_LIVE_OPENAI_TESTS=1 npm test -- scene-generator.camera.live.test.js --runInBand
 *
 * Copy/paste from /Users/eggermann/Projekte/dailydoase:
 * RUN_LIVE_OPENAI_TESTS=1 npm test -- lib/generator/adapter/helpers/scene-generator.camera.live.test.js --runInBand
 */

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const LIVE_FIXTURE_DIR = path.join(__dirname, 'test-data');
const CAMERA_OUTPUT_DIR = path.resolve(__dirname, '../tests/GENERATIONS/camera-snapshot');

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const OPENAI_VISION_MODEL = process.env.OPENAI_VISION_MODEL || OPENAI_MODEL;
const CONFIG_MODE = 'camera';
const RUN_LIVE_OPENAI_TESTS = ['1', 'true', 'yes', 'on'].includes(
  String(process.env.RUN_LIVE_OPENAI_TESTS || '').trim().toLowerCase()
);

const { prompt: VISION_PROMPT } = resolveWebcamVisionSettings({
  middlePrompt: process.env.SCENE_GENERATOR_CAMERA_VISION_PROMPT || process.env.FRESHWEB_MIDDLE_VISION_PROMPT,
  testPrompt: process.env.FRESHWEB_TEST_VISION_PROMPT,
  middleProviders: process.env.SCENE_GENERATOR_CAMERA_VISION_PROVIDERS || process.env.FRESHWEB_MIDDLE_VISION_PROVIDERS,
  testProviders: process.env.FRESHWEB_TEST_VISION_PROVIDERS,
});

const VISION_PROVIDERS = ['openai'];
const SCENE_PLAN_SYSTEM_PROMPT = resolveWebcamScenePlanSystemPrompt({
  configMode: CONFIG_MODE,
  scenePlanSystemPrompt:
    process.env.SCENE_GENERATOR_CAMERA_SCENE_PLAN_SYSTEM_PROMPT
    || process.env.FRESHWEB_MIDDLE_SCENE_PLAN_SYSTEM_PROMPT
    || process.env.FRESHWEB_TEST_SCENE_PLAN_SYSTEM_PROMPT,
  cameraScenePlanSystemPrompt:
    process.env.SCENE_GENERATOR_CAMERA_CAMERA_SCENE_PLAN_SYSTEM_PROMPT
    || process.env.FRESHWEB_MIDDLE_CAMERA_SCENE_PLAN_SYSTEM_PROMPT
    || process.env.FRESHWEB_TEST_CAMERA_SCENE_PLAN_SYSTEM_PROMPT,
});

const maybeDescribe = RUN_LIVE_OPENAI_TESTS && OPENAI_API_KEY ? describe : describe.skip;



const saveLiveFixture = async (fileName, payload) => {
  await fs.ensureDir(LIVE_FIXTURE_DIR);
  const parsed = path.parse(fileName);
  const legacyPath = path.join(LIVE_FIXTURE_DIR, fileName);
  const targetPath = path.join(LIVE_FIXTURE_DIR, `${parsed.name}-1${parsed.ext || '.json'}`);
  const backupPath2 = path.join(LIVE_FIXTURE_DIR, `${parsed.name}-2${parsed.ext || '.json'}`);
  const backupPath3 = path.join(LIVE_FIXTURE_DIR, `${parsed.name}-3${parsed.ext || '.json'}`);

  if (await fs.pathExists(backupPath3)) {
    await fs.remove(backupPath3);
  }
  if (await fs.pathExists(backupPath2)) {
    await fs.move(backupPath2, backupPath3, { overwrite: true });
  }
  if (await fs.pathExists(targetPath)) {
    await fs.move(targetPath, backupPath2, { overwrite: true });
  }
  if (await fs.pathExists(legacyPath)) {
    await fs.remove(legacyPath);
  }

  await fs.writeJson(targetPath, payload, { spaces: 2 });
  return targetPath;
};

const resolveRequestedSceneCount = () =>7;// Math.max(1, Number(process.env.SCENE_GENERATOR_CAMERA_SCENE_COUNT) || 3);

const resolveSceneCount = () => resolveRequestedSceneCount();

const parseScenePlanLengthMismatch = (error) => {
  const message = String(error?.message || error || '');
  const match = message.match(/Scene plan length mismatch: expected (\d+), received (\d+)/i);
  if (!match) {
    return null;
  }

  return {
    expected: Number(match[1]),
    received: Number(match[2]),
  };
};

const generateScenePlanWithFallback = async ({
  generateScenes,
  sceneCount,
  sceneLengths,
  configMode,
  visualDirection,
  visionStoryContext,
  sourceCues,
}) => {
  let targetSceneCount = sceneCount;

  while (targetSceneCount >= 1) {
    try {
      const activeSceneLengths = sceneLengths.slice(0, targetSceneCount);
      const scenePlan = await generateScenes({
        sceneCount: targetSceneCount,
        sceneLengths: activeSceneLengths,
        configMode,
        visualDirection,
        visionStoryContext,
        sourceCues,
      });

      return {
        scenePlan,
        effectiveSceneCount: targetSceneCount,
        effectiveSceneLengths: activeSceneLengths,
      };
    } catch (error) {
      const mismatch = parseScenePlanLengthMismatch(error);
      if (!mismatch) {
        throw error;
      }

      const nextSceneCount = Math.max(1, Math.min(targetSceneCount - 1, mismatch.received));
      if (nextSceneCount >= targetSceneCount) {
        throw error;
      }

      console.warn(
        `[scene-generator.camera.live] scene-plan count fallback: requested ${targetSceneCount}, received ${mismatch.received}, retrying with ${nextSceneCount}`
      );
      targetSceneCount = nextSceneCount;
    }
  }

  throw new Error('Unable to generate a valid scene plan.');
};

const resolveSceneLengths = (sceneCount) => {
  const durationSeconds = Math.max(1, Number(process.env.SCENE_GENERATOR_CAMERA_SCENE_SECONDS) || 3);
  return Array.from({ length: sceneCount }, () => durationSeconds);
};

const resolveExistingImagePath = async (rawPath) => {
  if (typeof rawPath !== 'string' || rawPath.trim().length === 0) {
    return null;
  }
  const resolvedPath = path.resolve(rawPath.trim());
  return (await fs.pathExists(resolvedPath)) ? resolvedPath : null;
};

const captureOrReuseCameraImage = async () => {
  const explicitImagePath = await resolveExistingImagePath(process.env.SCENE_GENERATOR_CAMERA_IMAGE_PATH);
  if (explicitImagePath) {
    return {
      imagePath: explicitImagePath,
      imageSource: 'explicit',
    };
  }

  const fallbackImagePath = await resolveExistingImagePath(
    process.env.SCENE_GENERATOR_CAMERA_FALLBACK_IMAGE_PATH
    || path.resolve(__dirname, '../tests/GENERATIONS/camera-snapshot/1772808930515-camera.jpg')
  );


  const capturedImagePath = await captureWebcamImage({
    cameraOutputDir: CAMERA_OUTPUT_DIR,
    cameraFallbackImagePath: fallbackImagePath || '',
    captureOptions: {
      width: Number(process.env.CAMERA_WIDTH) || 1280,
      height: Number(process.env.CAMERA_HEIGHT) || 720,
      quality: Number(process.env.CAMERA_QUALITY) || 100,
      warmupSeconds: Number(process.env.CAMERA_WARMUP_SECONDS) || 1,
      output: 'jpeg',
      extension: 'jpg',
      device: process.env.CAMERA_DEVICE || false,
    },
  });

  const source = fallbackImagePath && path.resolve(capturedImagePath) === path.resolve(fallbackImagePath)
    ? 'fallback'
    : 'captured';

  return {
    imagePath: capturedImagePath,
    imageSource: source,
  };
};

const buildSourceCues = (visionText) => {
  const storyContext = extractVisionStoryContext(visionText);
  const normalized = String(visionText || '').replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return ['camera snapshot', 'documentary framing', 'realistic continuity'];
  }

  const cues = [
    storyContext.location,
    storyContext.actorSummary,
    storyContext.description,
    storyContext.continuity,
  ].filter(Boolean);

  if (cues.length >= 3) {
    return cues.slice(0, 3);
  }

  cues.push(...normalized
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean));

  return cues.length > 0 ? cues : [normalized];
};

maybeDescribe('scene-generator camera snapshot live integration', () => {
  test(
    'captures a screenshot and creates scene plans from it',
    async () => {
      const { imagePath, imageSource } = await captureOrReuseCameraImage();
      const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
      const requestedSceneCount = resolveRequestedSceneCount();
      const sceneCount = resolveSceneCount();
      const sceneLengths = resolveSceneLengths(sceneCount);
      let capturedVision = null;

      const stats = await fs.stat(imagePath);
      expect(stats.isFile()).toBe(true);
      expect(stats.size).toBeGreaterThan(0);

      const getFrameVision = createWebcamFrameVision({
        enabled: true,
        prompt: VISION_PROMPT,
        providers: VISION_PROVIDERS,
        logPrefix: 'scene-generator.camera.live',
        onResult: async ({ outputText, result }) => {
          capturedVision = {
            outputText,
            provider: result?.provider || '',
            model: result?.model || '',
          };
        },
      });
      const visionText = await getFrameVision(
        { image: { path: imagePath } },
        { prompt: VISION_PROMPT }
      );
      const vision = {
        imagePath,
        outputText: visionText,
        provider: capturedVision?.provider || '',
        model: capturedVision?.model || OPENAI_VISION_MODEL,
      };

      const generateScenes = createWebcamSceneGenerator({
        openai,
        model: OPENAI_MODEL,
        systemPrompt: SCENE_PLAN_SYSTEM_PROMPT,
        temperature: 0.2,
        top_p: 0.9,
      });

      const sourceCues = buildSourceCues(visionText);
      const visionStoryContext = summarizeVisionStoryContext(visionText);
      const {
        scenePlan: rawScenePlan,
        effectiveSceneCount,
        effectiveSceneLengths,
      } = await generateScenePlanWithFallback({
        generateScenes,
        sceneCount,
        sceneLengths,
        configMode: CONFIG_MODE,
        visualDirection: 'webcam-shot flow, candid documentary realism, visible continuity from a real camera snapshot',
        visionStoryContext,
        sourceCues,
      });
      const cameraPlanIssues = CONFIG_MODE === 'camera'
        ? describeWebcamCameraScenePlanIssues(rawScenePlan)
        : [];
      const runtimeScenePlan = CONFIG_MODE === 'camera'
        ? sanitizeWebcamCameraScenePlan(rawScenePlan)
        : rawScenePlan;
      if (cameraPlanIssues.length > 0) {
        console.warn('[scene-generator.camera.live] raw camera scene-plan issues:', cameraPlanIssues);
      }

      const visionData = {
        openAiVisionModel: OPENAI_VISION_MODEL,
        openAiSceneModel: OPENAI_MODEL,
        configMode: CONFIG_MODE,
        visionPrompt: VISION_PROMPT,
        visionProviders: VISION_PROVIDERS,
        scenePlanSystemPrompt: SCENE_PLAN_SYSTEM_PROMPT,
        requestedSceneCount,
        effectiveSceneCount,
        imagePath,
        imageSource,
        sourceCues,
        visionStoryContext,
        sceneLengths: effectiveSceneLengths,
        vision,
        rawScenePlan,
        runtimeScenePlan,
      };

      const fixturePath = await saveLiveFixture('scene-generator.camera-snapshot.live.json', visionData);

      console.log(`[scene-generator.camera.live] screenshot saved at: ${imagePath}`);
      console.log(`[scene-generator.camera.live] source: ${imageSource}`);
      console.log(`[scene-generator.camera.live] scene count requested/effective: ${requestedSceneCount}/${effectiveSceneCount}`);
      console.log(`[scene-generator.camera.live] saved fixture: ${fixturePath}`);

console.log(`visionData:`,visionData);


      expect(vision.provider).toBe('openai');
      expect(typeof vision.outputText).toBe('string');
      expect(vision.outputText.length).toBeGreaterThan(20);

      expect(rawScenePlan).toHaveLength(effectiveSceneCount);
      if (CONFIG_MODE === 'camera') {
        expect(cameraPlanIssues).toEqual([]);
      }

      for (const [index, scene] of rawScenePlan.entries()) {
        expect(scene.index).toBe(index + 1);
        expect(typeof scene.title).toBe('string');
        expect(scene.title.length).toBeGreaterThan(0);
        expect(typeof scene.stillPrompt).toBe('string');
        expect(scene.stillPrompt.length).toBeGreaterThan(0);
        expect(typeof scene.imageDescription).toBe('string');
        expect(scene.imageDescription.length).toBeGreaterThan(0);
        expect(typeof scene.useCameraShot).toBe('boolean');
        expect(['lastFrame', 'newImage']).toContain(scene.frameSource);
        expect(['firstLast', 'singleImage']).toContain(scene.videoMode);
        expect(typeof scene.durationSeconds).toBe('number');
        expect(scene.durationSeconds).toBeGreaterThan(0);
      }

      expect(runtimeScenePlan).toHaveLength(effectiveSceneCount);
    },
    120000
  );
});
