import { describe, expect, test } from '@jest/globals';
import dotenv from 'dotenv';
import fs from 'fs-extra';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { visionModel } from './vision-model.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '../../../../');
const PROJECT_ENV_PATH = path.join(PROJECT_ROOT, '.env');

dotenv.config({
  path: PROJECT_ENV_PATH,
  override: false,
});

const LIVE_FIXTURE_DIR = path.join(__dirname, 'test-data');
const RUN_LIVE_LMSTUDIO_TESTS = ['1', 'true', 'yes', 'on'].includes(
  String(process.env.RUN_LIVE_LMSTUDIO_TESTS || '').trim().toLowerCase()
);

const LMSTUDIO_URL = process.env.LMSTUDIO_URL
  || process.env.VITE_LMSTUDIO_URL
  || 'http://192.168.1.2:1234';

const LMSTUDIO_MODEL = process.env.LMSTUDIO_MODEL
  || process.env.VITE_LMSTUDIO_MODEL
  || 'mistralai/ministral-3-3b';
const HF_SPACE_ID = process.env.HF_VISION_SPACE_ID
  || process.env.HF_SPACE_ID
  || 'huggingface-projects/llama-3.2-vision-11B';
const HF_MODEL = process.env.HF_VISION_MODEL
  || 'meta-llama/Llama-3.2-11B-Vision-Instruct';

const CAMERA_IMAGE_PATH = process.env.LMSTUDIO_CAMERA_IMAGE_PATH
  || path.resolve(__dirname, '../tests/GENERATIONS/camera-snapshot/1772808930515-camera.jpg');

const maybeDescribe = RUN_LIVE_LMSTUDIO_TESTS ? describe : describe.skip;

test('loads the same root .env file as the project', () => {
  expect(PROJECT_ENV_PATH).toBe('/Users/eggermann/Projekte/dailydoase/.env');
  expect(path.basename(PROJECT_ENV_PATH)).toBe('.env');
});

maybeDescribe('vision-model live LM Studio integration', () => {
  test(
    'describes a camera snapshot with the real LM Studio model and saves the output',
    async () => {
      if (!(await fs.pathExists(CAMERA_IMAGE_PATH))) {
        throw new Error(`Camera image not found: ${CAMERA_IMAGE_PATH}`);
      }

      const result = await visionModel({
        providers: ['lmstudio'],
        imagePath: CAMERA_IMAGE_PATH,
        prompt: 'Describe only the visible camera shot: subject, setting, framing, lighting, and what should stay consistent for the next shot.',
        systemPrompt: 'You are a precise camera-shot describer for image-to-video continuity.',
        lmStudioUrl: LMSTUDIO_URL,
        lmStudioModel: LMSTUDIO_MODEL,
        temperature: 0.2,
        maxTokens: 220,
      });

      await fs.ensureDir(LIVE_FIXTURE_DIR);
      const fixturePath = path.join(LIVE_FIXTURE_DIR, 'vision-model.lmstudio.camera.live.json');
      await fs.writeJson(
        fixturePath,
        {
          url: LMSTUDIO_URL,
          model: LMSTUDIO_MODEL,
          imagePath: CAMERA_IMAGE_PATH,
          result,
        },
        { spaces: 2 }
      );

      console.log(`[vision-model.live] saved LM Studio live fixture: ${fixturePath}`);
      console.log(`[vision-model.live] output: ${result.outputText}`);

      expect(result.provider).toBe('lmstudio');
      expect(result.model).toBe(LMSTUDIO_MODEL);
      expect(typeof result.outputText).toBe('string');
      expect(result.outputText.length).toBeGreaterThan(20);
    },
    120000
  );

  test(
    'saves the live error when LM Studio is not available',
    async () => {
      if (!(await fs.pathExists(CAMERA_IMAGE_PATH))) {
        throw new Error(`Camera image not found: ${CAMERA_IMAGE_PATH}`);
      }

      const unavailableUrl = process.env.LMSTUDIO_UNAVAILABLE_URL || 'http://127.0.0.1:65534';
      let capturedError = null;

      try {
        await visionModel({
          providers: ['lmstudio'],
          imagePath: CAMERA_IMAGE_PATH,
          prompt: 'Describe only the visible camera shot.',
          systemPrompt: 'You are a precise camera-shot describer.',
          lmStudioUrl: unavailableUrl,
          lmStudioModel: LMSTUDIO_MODEL,
          temperature: 0.2,
          maxTokens: 120,
        });
      } catch (error) {
        capturedError = error;
      }

      expect(capturedError).toBeTruthy();

      await fs.ensureDir(LIVE_FIXTURE_DIR);
      const fixturePath = path.join(LIVE_FIXTURE_DIR, 'vision-model.lmstudio.camera.unavailable.live.json');
      await fs.writeJson(
        fixturePath,
        {
          url: unavailableUrl,
          model: LMSTUDIO_MODEL,
          imagePath: CAMERA_IMAGE_PATH,
          error: String(capturedError?.message || capturedError),
        },
        { spaces: 2 }
      );

      console.log(`[vision-model.live] saved LM Studio unavailable fixture: ${fixturePath}`);
      console.log(`[vision-model.live] error: ${String(capturedError?.message || capturedError)}`);

      expect(String(capturedError?.message || capturedError)).toContain('Vision helper failed for all providers');
    },
    120000
  );

  test(
    'falls back live from LM Studio to HF Space and saves the fallback output',
    async () => {
      if (!(await fs.pathExists(CAMERA_IMAGE_PATH))) {
        throw new Error(`Camera image not found: ${CAMERA_IMAGE_PATH}`);
      }

      const unavailableUrl = process.env.LMSTUDIO_UNAVAILABLE_URL || 'http://127.0.0.1:65534';
      await fs.ensureDir(LIVE_FIXTURE_DIR);
      let result = null;
      let capturedError = null;

      try {
        result = await visionModel({
          providers: ['lmstudio', 'hfspace'],
          imagePath: CAMERA_IMAGE_PATH,
          prompt: 'Describe only the visible camera shot: subject, setting, framing, lighting, and what should stay consistent for the next shot.',
          systemPrompt: 'You are a precise camera-shot describer for image-to-video continuity.',
          lmStudioUrl: unavailableUrl,
          lmStudioModel: LMSTUDIO_MODEL,
          hfSpaceId: HF_SPACE_ID,
          maxTokens: 220,
        });
      } catch (error) {
        capturedError = error;
      }

      const fixturePath = path.join(LIVE_FIXTURE_DIR, 'vision-model.lmstudio-to-hfspace.camera.live.json');
      await fs.writeJson(
        fixturePath,
        {
          lmStudioUrl: unavailableUrl,
          lmStudioModel: LMSTUDIO_MODEL,
          hfSpaceId: HF_SPACE_ID,
          imagePath: CAMERA_IMAGE_PATH,
          result,
          error: capturedError ? String(capturedError?.message || capturedError) : null,
        },
        { spaces: 2 }
      );

      console.log(`[vision-model.live] saved LM Studio -> HF Space fallback fixture: ${fixturePath}`);
      if (capturedError) {
        console.log(`[vision-model.live] hf-space fallback error: ${String(capturedError?.message || capturedError)}`);
      } else {
        console.log(`[vision-model.live] hf-space fallback provider: ${result.provider}`);
        console.log(`[vision-model.live] hf-space fallback output: ${result.outputText}`);
      }

      expect(capturedError).toBeNull();
      expect(result.provider).toBe('hfspace');
      expect(result.model).toBe(HF_SPACE_ID);
      expect(typeof result.outputText).toBe('string');
      expect(result.outputText.length).toBeGreaterThan(20);
    },
    120000
  );

  test(
    'falls back live from LM Studio and HF Space to OpenAI and saves the fallback output',
    async () => {
      if (!(await fs.pathExists(CAMERA_IMAGE_PATH))) {
        throw new Error(`Camera image not found: ${CAMERA_IMAGE_PATH}`);
      }

      const unavailableUrl = process.env.LMSTUDIO_UNAVAILABLE_URL || 'http://127.0.0.1:65534';
      const unavailableSpaceId = process.env.HF_UNAVAILABLE_SPACE_ID || 'huggingface-projects/space-that-does-not-exist';
      const openAiModel = process.env.OPENAI_VISION_MODEL
        || process.env.OPENAI_MODEL
        || 'gpt-4o-mini';

      await fs.ensureDir(LIVE_FIXTURE_DIR);
      let result = null;
      let capturedError = null;

      try {
        result = await visionModel({
          providers: ['lmstudio', 'hfspace', 'openai'],
          imagePath: CAMERA_IMAGE_PATH,
          prompt: 'Describe only the visible camera shot: subject, setting, framing, lighting, and what should stay consistent for the next shot.',
          systemPrompt: 'You are a precise camera-shot describer for image-to-video continuity.',
          lmStudioUrl: unavailableUrl,
          lmStudioModel: LMSTUDIO_MODEL,
          hfSpaceId: unavailableSpaceId,
          openAiModel,
          maxTokens: 220,
        });
      } catch (error) {
        capturedError = error;
      }

      const fixturePath = path.join(LIVE_FIXTURE_DIR, 'vision-model.lmstudio-to-openai.camera.live.json');
      await fs.writeJson(
        fixturePath,
        {
          lmStudioUrl: unavailableUrl,
          lmStudioModel: LMSTUDIO_MODEL,
          hfSpaceId: unavailableSpaceId,
          openAiModel,
          imagePath: CAMERA_IMAGE_PATH,
          result,
          error: capturedError ? String(capturedError?.message || capturedError) : null,
        },
        { spaces: 2 }
      );

      console.log(`[vision-model.live] saved LM Studio -> OpenAI fallback fixture: ${fixturePath}`);
      if (capturedError) {
        console.log(`[vision-model.live] openai fallback error: ${String(capturedError?.message || capturedError)}`);
      } else {
        console.log(`[vision-model.live] openai fallback provider: ${result.provider}`);
        console.log(`[vision-model.live] openai fallback output: ${result.outputText}`);
      }

      expect(capturedError).toBeNull();
      expect(result.provider).toBe('openai');
      expect(result.model).toBe(openAiModel);
      expect(typeof result.outputText).toBe('string');
      expect(result.outputText.length).toBeGreaterThan(20);
    },
    120000
  );

  test(
    'falls back live from LM Studio to Hugging Face and saves the fallback output',
    async () => {
      if (!(await fs.pathExists(CAMERA_IMAGE_PATH))) {
        throw new Error(`Camera image not found: ${CAMERA_IMAGE_PATH}`);
      }

      const unavailableUrl = process.env.LMSTUDIO_UNAVAILABLE_URL || 'http://127.0.0.1:65534';
      await fs.ensureDir(LIVE_FIXTURE_DIR);
      let result = null;
      let capturedError = null;

      try {
        result = await visionModel({
          providers: ['lmstudio', 'huggingface'],
          imagePath: CAMERA_IMAGE_PATH,
          prompt: 'Describe only the visible camera shot: subject, setting, framing, lighting, and what should stay consistent for the next shot.',
          systemPrompt: 'You are a precise camera-shot describer for image-to-video continuity.',
          lmStudioUrl: unavailableUrl,
          lmStudioModel: LMSTUDIO_MODEL,
          hfModel: HF_MODEL,
          temperature: 0.2,
          maxTokens: 220,
        });
      } catch (error) {
        capturedError = error;
      }

      const fixturePath = path.join(LIVE_FIXTURE_DIR, 'vision-model.lmstudio-to-hf.camera.live.json');
      await fs.writeJson(
        fixturePath,
        {
          lmStudioUrl: unavailableUrl,
          lmStudioModel: LMSTUDIO_MODEL,
          hfModel: HF_MODEL,
          imagePath: CAMERA_IMAGE_PATH,
          result,
          error: capturedError ? String(capturedError?.message || capturedError) : null,
        },
        { spaces: 2 }
      );

      console.log(`[vision-model.live] saved LM Studio -> HF fallback fixture: ${fixturePath}`);
      if (capturedError) {
        console.log(`[vision-model.live] fallback error: ${String(capturedError?.message || capturedError)}`);
      } else {
        console.log(`[vision-model.live] fallback provider: ${result.provider}`);
        console.log(`[vision-model.live] fallback output: ${result.outputText}`);
      }

      if (capturedError) {
        const errorText = String(capturedError?.message || capturedError);
        expect(errorText).toContain('[lmstudio] fetch failed');
        expect(
          errorText.includes('No Inference Provider available')
          || errorText.includes('HTTP error occurred when requesting the provider')
        ).toBe(true);
        return;
      }

      expect(result.provider).toBe('huggingface');
      expect(result.model).toBe(HF_MODEL);
      expect(typeof result.outputText).toBe('string');
      expect(result.outputText.length).toBeGreaterThan(20);
    },
    120000
  );
});
