import {
  buildWanProviderParameters,
  DEFAULT_WAN_PROVIDER_FALLBACK_MODEL,
  DEFAULT_WAN_PROVIDER_FALLBACK_PROVIDER,
  extractWanSingleImageVideoUrl,
  isRecoverableWanSpaceError,
  isWanQuotaExceededError,
  resolveWanSingleImageRuntime,
  resolveWanProviderFallbackConfig,
  PostToWan22_5B_ImageVideo,
} from './imageVideo.js';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { jest } from '@jest/globals';

describe('resolveWanSingleImageRuntime', () => {
  test('forces eggman-poff/wan-s when selfHostedHugginfaceModel is true', () => {
    const runtime = resolveWanSingleImageRuntime({
      selfHostedHugginfaceModel: true,
      space: 'Wan-AI/Wan-2.2-5B',
    });

    expect(runtime.selfHostedHugginfaceModel).toBe(true);
    expect(runtime.space).toBe('eggman-poff/wan-s');
    expect(runtime.endpoint).toBe('/generate_video_safe');
  });

  test('uses self-hosted payload mode when the wan-s space is set directly', () => {
    const runtime = resolveWanSingleImageRuntime({
      space: 'eggman-poff/wan-s',
    });

    expect(runtime.selfHostedHugginfaceModel).toBe(true);
    expect(runtime.space).toBe('eggman-poff/wan-s');
    expect(runtime.endpoint).toBe('/generate_video_safe');
  });

  test('uses self-hosted payload mode when the wan-mixed space is set directly', () => {
    const runtime = resolveWanSingleImageRuntime({
      space: 'eggman-poff/wan-mixed',
    });

    expect(runtime.selfHostedHugginfaceModel).toBe(true);
    expect(runtime.space).toBe('eggman-poff/wan-mixed');
    expect(runtime.endpoint).toBe('/generate_video_safe');
  });

  test('throws when the self-hosted safe endpoint returns a Gradio error string', () => {
    expect(() => extractWanSingleImageVideoUrl(
      { config: { root_url: 'https://eggman-poff-wan-s.hf.space', api_prefix: '/gradio_api' } },
      { data: [null, 'Error: The truth value of an array with more than one element is ambiguous. Use a.any() or a.all()'] }
    )).toThrow('Wan image-video: The truth value of an array with more than one element is ambiguous. Use a.any() or a.all()');
  });

  test('extracts the first valid Gradio file URL from the self-hosted response', () => {
    expect(extractWanSingleImageVideoUrl(
      { config: { root_url: 'https://eggman-poff-wan-s.hf.space', api_prefix: '/gradio_api' } },
      { data: [{ video: '/gradio_api/file=/tmp/gradio/demo/output.mp4' }] }
    )).toBe('https://eggman-poff-wan-s.hf.space/gradio_api/file=/tmp/gradio/demo/output.mp4');
  });

  test('detects quota and recoverable space errors for provider fallback', () => {
    expect(isWanQuotaExceededError(new Error('You have exceeded your Pro GPU quota (180s requested vs. 57s left).'))).toBe(true);
    expect(isRecoverableWanSpaceError(new Error('Error: Could not resolve app config.'))).toBe(true);
    expect(isRecoverableWanSpaceError(new Error('hard failure'))).toBe(false);
  });

  test('builds provider fallback config and parameters for HF/fal image-to-video', () => {
    const fallback = resolveWanProviderFallbackConfig({
      hfProviderFallbackEnabled: true,
      hfProvider: 'fal-ai',
      hfProviderModel: 'custom/wan-model',
      hfProviderApiKey: 'hf_test-token',
      hfProviderBillTo: 'my-org',
    });

    expect(fallback).toEqual({
      enabled: true,
      provider: 'fal-ai',
      model: 'custom/wan-model',
      accessToken: 'hf_test-token',
      billTo: 'my-org',
    });

    const parameters = buildWanProviderParameters({
      payload: {
        prompt: 'The room liquefies while the actor stares into frame.',
        height: 704,
        width: 1280,
        duration_seconds: 2,
        sampling_steps: 8,
        guide_scale: 4,
        seed: 17,
      },
      config: {
        fps: 24,
      },
    });

    expect(parameters).toEqual({
      prompt: 'The room liquefies while the actor stares into frame.',
      guidance_scale: 4,
      num_frames: 48,
      num_inference_steps: 8,
      seed: 17,
      target_size: {
        height: 704,
        width: 1280,
      },
    });
  });

  test('does not treat a direct fal key as an HF provider token', () => {
    const previousFalKey = process.env.FAL_KEY;
    const previousHfToken = process.env.HF_TOKEN;
    const previousHfApiToken = process.env.HF_API_TOKEN;

    process.env.FAL_KEY = 'fal_test-token';
    delete process.env.HF_TOKEN;
    delete process.env.HF_API_TOKEN;

    try {
      expect(resolveWanProviderFallbackConfig({
        hfProviderFallbackEnabled: true,
      })).toEqual({
        enabled: true,
        provider: DEFAULT_WAN_PROVIDER_FALLBACK_PROVIDER,
        model: DEFAULT_WAN_PROVIDER_FALLBACK_MODEL,
        accessToken: null,
        billTo: null,
      });
    } finally {
      if (previousFalKey === undefined) {
        delete process.env.FAL_KEY;
      } else {
        process.env.FAL_KEY = previousFalKey;
      }
      if (previousHfToken === undefined) {
        delete process.env.HF_TOKEN;
      } else {
        process.env.HF_TOKEN = previousHfToken;
      }
      if (previousHfApiToken === undefined) {
        delete process.env.HF_API_TOKEN;
      } else {
        process.env.HF_API_TOKEN = previousHfApiToken;
      }
    }
  });

  test('falls back to HF provider when the WAN space quota is exceeded', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wan-fallback-'));

    try {
      const model = new PostToWan22_5B_ImageVideo({
        folderName: 'wan-provider-fallback-test',
        space: 'eggman-poff/wan-mixed',
        hfProviderFallbackEnabled: true,
        hfProviderApiKey: 'hf_test-token',
        hfProvider: DEFAULT_WAN_PROVIDER_FALLBACK_PROVIDER,
        hfProviderModel: DEFAULT_WAN_PROVIDER_FALLBACK_MODEL,
        skipCollectionCounter: true,
      });
      model.imageDir = tmpDir;
      model.firstTime = true;
      model._cli = {
        predict: async () => {
          throw new Error('You have exceeded your Pro GPU quota (180s requested vs. 57s left). Try again in 0:20:58');
        },
      };
      model.getHFProviderClient = async () => ({
        imageToVideo: async () => new Blob([Buffer.from('fake-video-binary')], { type: 'video/mp4' }),
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
        randomize_seed: false,
        seed: 9,
      });

      expect(result.file).toMatch(/wan-provider-video\.mp4$/);
      expect(await fs.pathExists(result.file)).toBe(true);
      expect(result.json.provider).toBe(DEFAULT_WAN_PROVIDER_FALLBACK_PROVIDER);
      expect(result.json.model).toBe(DEFAULT_WAN_PROVIDER_FALLBACK_MODEL);
      expect(result.json.source).toBe('hf-provider');
      expect(result.json.fallbackReason).toMatch(/quota/i);
    } finally {
      await fs.remove(tmpDir);
    }
  });

  test('retries authenticated self-hosted video downloads after a transient 404', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wan-self-hosted-download-'));

    try {
      const model = new PostToWan22_5B_ImageVideo({
        folderName: 'wan-self-hosted-download-test',
        space: 'eggman-poff/wan-mixed',
        hfToken: 'hf_test-token',
        skipCollectionCounter: true,
      });
      model.imageDir = tmpDir;
      model.firstTime = true;

      let fetchCalls = 0;
      const cliFetch = jest.fn(async (_url, init = {}) => {
        fetchCalls += 1;
        if (fetchCalls === 1) {
          return new Response('missing', { status: 404, statusText: 'Not Found' });
        }

        expect(init.headers.Authorization).toBe('Bearer hf_test-token');
        return new Response(Buffer.from('fake-video-binary'), {
          status: 200,
          headers: { 'content-type': 'video/mp4' },
        });
      });

      model._cli = {
        config: {
          root_url: 'https://eggman-poff-wan-mixed.hf.space',
          api_prefix: '/gradio_api',
        },
        predict: async () => ({
          data: [{ video: '/gradio_api/file=/tmp/gradio/demo/output.mp4' }],
        }),
        fetch: cliFetch,
      };

      const inputImage = await sharp({
        create: {
          width: 64,
          height: 64,
          channels: 3,
          background: { r: 16, g: 16, b: 16 },
        },
      }).png().toBuffer();

      const result = await model.prompt(inputImage, {
        prompt: 'The subject stares into a dim room while the frame bends.',
        randomize_seed: false,
        seed: 11,
      });

      expect(fetchCalls).toBe(2);
      expect(await fs.pathExists(result.file)).toBe(true);
      expect(result.json.sourceUrl).toBe('https://eggman-poff-wan-mixed.hf.space/gradio_api/file=/tmp/gradio/demo/output.mp4');
    } finally {
      await fs.remove(tmpDir);
    }
  });
});
