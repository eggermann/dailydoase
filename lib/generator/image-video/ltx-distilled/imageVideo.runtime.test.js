import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';

import {
  buildLtxProviderParameters,
  DEFAULT_LTX_IMAGE_VIDEO_SPACE,
  LTX_MIN_DIMENSION,
  DEFAULT_LTX_PROVIDER_FALLBACK_MODEL,
  DEFAULT_LTX_PROVIDER_FALLBACK_PROVIDER,
  isLtxQuotaExceededError,
  isRecoverableLtxSpaceError,
  PostToLtxDistilled_ImageVideo,
  resolveLtxProviderFallbackConfig,
} from './imageVideo.js';

describe('PostToLtxDistilled_ImageVideo', () => {
  test('uses the official LTX space by default', () => {
    const model = new PostToLtxDistilled_ImageVideo({});

    expect(model.config.space).toBe(DEFAULT_LTX_IMAGE_VIDEO_SPACE);
  });

  test('allows overriding the LTX gradio space for self-hosted Hugging Face apps', () => {
    const model = new PostToLtxDistilled_ImageVideo({
      space: 'eggman-poff/ltx-i2v',
    });

    expect(model.config.space).toBe('eggman-poff/ltx-i2v');
  });

  test('accepts WAN-style aliases for height, width, duration, guidance, and seed', () => {
    const model = new PostToLtxDistilled_ImageVideo({});
    const payload = model.buildPayload('A calm portrait becomes animated.', '/tmp/input.png', {
      height: 513,
      width: 705,
      duration_seconds: 3.4,
      guide_scale: 4,
      seed: 99,
      randomize_seed: false,
    });

    expect(payload.height_ui).toBe(544);
    expect(payload.width_ui).toBe(736);
    expect(payload.duration_ui).toBe(3.4);
    expect(payload.ui_guidance_scale).toBe(4);
    expect(payload.seed_ui).toBe(99);
    expect(payload.randomize_seed).toBe(false);
    expect(payload.mode).toBe('image-to-video');
  });

  test('upscales sub-minimum dimensions before sending LTX requests', () => {
    const model = new PostToLtxDistilled_ImageVideo({});
    const payload = model.buildPayload('A still image starts moving.', '/tmp/input.png', {
      height: 192,
      width: 320,
    });

    expect(payload.height_ui).toBe(LTX_MIN_DIMENSION);
    expect(payload.width_ui).toBe(448);
    expect(payload.height_ui % 32).toBe(0);
    expect(payload.width_ui % 32).toBe(0);
  });

  test('detects quota and recoverable space errors for provider fallback', () => {
    expect(isLtxQuotaExceededError(new Error('You have exceeded your Pro GPU quota (60s requested vs. 5s left).'))).toBe(true);
    expect(isRecoverableLtxSpaceError(new Error('Error: Could not resolve app config.'))).toBe(true);
    expect(isRecoverableLtxSpaceError(new Error('hard failure'))).toBe(false);
  });

  test('builds provider fallback config and parameters for HF/fal image-to-video', () => {
    const fallback = resolveLtxProviderFallbackConfig({
      hfProviderFallbackEnabled: true,
      hfProvider: 'fal-ai',
      hfProviderModel: 'custom/ltx-model',
      hfProviderApiKey: 'hf_test-token',
      hfProviderBillTo: 'my-org',
    });

    expect(fallback).toEqual({
      enabled: true,
      provider: 'fal-ai',
      model: 'custom/ltx-model',
      accessToken: 'hf_test-token',
      billTo: 'my-org',
    });

    const parameters = buildLtxProviderParameters({
      payload: {
        prompt: 'A portrait twists into a surreal grin.',
        negative_prompt: 'blurry, jittery',
        height_ui: 512,
        width_ui: 704,
        duration_ui: 2,
        ui_guidance_scale: 4,
        seed_ui: 17,
      },
      config: {
        fps: 24,
        steps: 8,
      },
      task: 'image-to-video',
    });

    expect(parameters).toEqual({
      prompt: 'A portrait twists into a surreal grin.',
      guidance_scale: 4,
      negative_prompt: 'blurry, jittery',
      num_frames: 48,
      num_inference_steps: 8,
      seed: 17,
      target_size: {
        height: 512,
        width: 704,
      },
    });
  });

  test('falls back to HF provider when the LTX space quota is exceeded', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ltx-fallback-'));

    try {
      const model = new PostToLtxDistilled_ImageVideo({
        folderName: 'ltx-fallback-test',
        hfProviderFallbackEnabled: true,
        hfProviderApiKey: 'hf_test-token',
        hfProvider: DEFAULT_LTX_PROVIDER_FALLBACK_PROVIDER,
        hfProviderModel: DEFAULT_LTX_PROVIDER_FALLBACK_MODEL,
        skipCollectionCounter: true,
      });
      model.imageDir = tmpDir;
      model.firstTime = true;
      model._cli = {
        predict: async () => {
          throw new Error('You have exceeded your Pro GPU quota (60s requested vs. 5s left). Try again in 0:20:58');
        },
      };
      let providerRequest = null;
      model.getHFProviderClient = async () => ({
        imageToVideo: async (request) => {
          providerRequest = request;
          return new Blob([Buffer.from('fake-video-binary')], { type: 'video/mp4' });
        },
      });

      const inputImage = await sharp({
        create: {
          width: 64,
          height: 64,
          channels: 3,
          background: { r: 32, g: 32, b: 32 },
        },
      }).png().toBuffer();

      const result = await model.prompt(inputImage, {
        prompt: 'The room turns uncanny while the subject looks back.',
        height_ui: 192,
        width_ui: 320,
        randomize_seed: false,
        seed_ui: 9,
      });

      expect(result.file).toMatch(/ltx-provider-video\.mp4$/);
      expect(await fs.pathExists(result.file)).toBe(true);
      expect(result.json.provider).toBe(DEFAULT_LTX_PROVIDER_FALLBACK_PROVIDER);
      expect(result.json.model).toBe(DEFAULT_LTX_PROVIDER_FALLBACK_MODEL);
      expect(result.json.source).toBe('hf-provider');
      expect(result.json.fallbackReason).toMatch(/quota/i);
      expect(result.json.height_ui).toBe(LTX_MIN_DIMENSION);
      expect(result.json.width_ui).toBe(448);
      expect(providerRequest.parameters.target_size).toEqual({
        height: LTX_MIN_DIMENSION,
        width: 448,
      });
    } finally {
      await fs.remove(tmpDir);
    }
  });
});
