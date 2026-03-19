import PostTo from '../../PostTo.js';
import { Client, handle_file } from '@gradio/client';
import fs from 'fs-extra';
import path from 'path';
import dotenv from 'dotenv';
import sharp from 'sharp';
import { fileURLToPath } from 'url';

import { extractLastFrame } from '../../ffmpeg-helpers.js';
import { joinOutPath, toSharp, withTimeout } from '../../utils.js';
import { saveJSON, downloadToFile } from '../../save-utils.js';

/**
 * LTX Distilled Image/Video adapter
 *
 * Supports:
 *  - text-to-video (prompt only)
 *  - image-to-video (source image + prompt)
 *  - loop mode: cycles through loop.prompts, extracts last frame to feed next round,
 *               increments seed_ui (if fixed) to vary outputs.
 *
 * Usage:
 *  import LtxImageVideo from './lib/generator/image-video/ltx-distilled/imageVideo.js';
 *  const inst = await LtxImageVideo.init({
 *    video: { duration_ui: 3 },
 *  });
 *
 *  // Text-to-video
 *  await inst.prompt(null, { prompt: 'A serene mountain lake at sunrise' });
 *
 *  // Image-to-video
 *  await inst.prompt('./tests/assets/remote_test_image.png', {
 *    prompt: 'Slow cinematic pan over the lake with morning mist'
 *  });
 *
 *  // Loop (image-to-video evolving prompts)
 *  await inst.prompt('./tests/assets/remote_test_image.png', {
 *    prompt: 'Base scene',
 *    loop: { prompts: ['Variation 1', 'Variation 2'] },
 *    randomize_seed: false,
 *    seed_ui: 42
 *  });
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
try {
  dotenv.config({ path: path.join(__dirname, '.env') });
} catch (_) {
  // ignore if missing
}

const maskToken = (t) => {
  if (!t || typeof t !== 'string') return 'none';
  if (t.length <= 8) return '*'.repeat(t.length);
  return `${t.slice(0, 4)}…${t.slice(-4)}`;
};

const TRUTHY_VALUES = new Set(['1', 'true', 'yes', 'on']);
const pickFirstValue = (...values) => values.find((value) => value !== undefined && value !== null && value !== '');
const pickFirstEnv = (...names) => pickFirstValue(...names.map((name) => process.env[name]));
const resolveBoolean = (value, fallback = false) => {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    return TRUTHY_VALUES.has(value.trim().toLowerCase());
  }
  if (value === undefined || value === null) {
    return fallback;
  }
  return Boolean(value);
};

export const DEFAULT_LTX_IMAGE_VIDEO_SPACE = 'Lightricks/ltx-video-distilled';
export const DEFAULT_LTX_PROVIDER_FALLBACK_PROVIDER = 'fal-ai';
export const DEFAULT_LTX_PROVIDER_FALLBACK_MODEL = 'Lightricks/LTX-Video-0.9.8-13B-distilled';

const LTX_DISTILLED_DEFAULTS = {
  negative_prompt: 'worst quality, inconsistent motion, blurry, jittery, distorted',
  height_ui: 512,
  width_ui: 704,
  duration_ui: 2,
  ui_frames_to_use: 9,
  ui_guidance_scale: 1, // separate from cfg internal
  cfg: 3.0,
  steps: 8,
  motionBucketId: 127,
  fps: 24,
  seed_ui: 42,
  randomize_seed: true,
  improve_texture_flag: true,
  predictTimeoutMs: 15 * 60 * 1000,
  downloadTimeoutMs: 5 * 60 * 1000
};

export const isLtxQuotaExceededError = (error) => {
  const message = String(error?.message || error || '').toLowerCase();
  return /exceeded your (?:pro )?gpu quota/.test(message)
    || (/zerogpu/.test(message) && /quota|try again/i.test(message));
};

export const isRecoverableLtxSpaceError = (error) => {
  const message = String(error?.message || error || '').toLowerCase();
  return isLtxQuotaExceededError(error)
    || /could not resolve app config/.test(message)
    || /fetch failed/.test(message)
    || /failed to fetch/.test(message)
    || /\b429\b/.test(message)
    || /\b503\b/.test(message);
};

export const resolveLtxProviderFallbackConfig = (config = {}) => {
  const enabled = resolveBoolean(
    pickFirstValue(
      config.hfProviderFallbackEnabled,
      pickFirstEnv(
        'FRESHWEB_LTX_SINGLE_USE_HF_PROVIDER_FALLBACK',
        'LTX_SINGLE_USE_HF_PROVIDER_FALLBACK',
        'FRESHWEB_LTX_USE_HF_PROVIDER_FALLBACK',
        'LTX_USE_HF_PROVIDER_FALLBACK'
      )
    ),
    false
  );
  const provider = pickFirstValue(
    config.hfProvider,
    pickFirstEnv('FRESHWEB_LTX_SINGLE_HF_PROVIDER', 'LTX_SINGLE_HF_PROVIDER', 'FRESHWEB_LTX_HF_PROVIDER', 'LTX_HF_PROVIDER'),
    DEFAULT_LTX_PROVIDER_FALLBACK_PROVIDER
  );
  const model = pickFirstValue(
    config.hfProviderModel,
    pickFirstEnv('FRESHWEB_LTX_SINGLE_HF_MODEL', 'LTX_SINGLE_HF_MODEL', 'FRESHWEB_LTX_HF_MODEL', 'LTX_HF_MODEL'),
    DEFAULT_LTX_PROVIDER_FALLBACK_MODEL
  );
  const accessToken = pickFirstValue(
    config.hfProviderApiKey,
    config.hfToken,
    pickFirstEnv(
      'FRESHWEB_LTX_SINGLE_HF_PROVIDER_API_KEY',
      'LTX_SINGLE_HF_PROVIDER_API_KEY',
      'FRESHWEB_LTX_HF_PROVIDER_API_KEY',
      'LTX_HF_PROVIDER_API_KEY',
      'HF_TOKEN',
      'HF_API_TOKEN',
      'HF_APIKEY',
      'FAL_KEY',
      'FAL_API_KEY'
    )
  ) || null;
  const billTo = pickFirstValue(
    config.hfProviderBillTo,
    pickFirstEnv('FRESHWEB_LTX_SINGLE_HF_BILL_TO', 'LTX_SINGLE_HF_BILL_TO', 'FRESHWEB_LTX_HF_BILL_TO', 'LTX_HF_BILL_TO')
  ) || null;

  return {
    enabled,
    provider,
    model,
    accessToken,
    billTo,
  };
};

export const buildLtxProviderParameters = ({
  payload = {},
  options = {},
  config = {},
  task = 'image-to-video',
} = {}) => {
  const fps = Number(options.fps ?? config.fps ?? 24);
  const durationSeconds = Number(payload.duration_ui ?? config.duration_ui ?? 0);
  const derivedNumFrames = Number.isFinite(durationSeconds) && durationSeconds > 0 && Number.isFinite(fps) && fps > 0
    ? Math.max(8, Math.min(129, Math.round(durationSeconds * fps)))
    : undefined;
  const parameters = {
    prompt: payload.prompt || '',
    guidance_scale: payload.ui_guidance_scale,
    negative_prompt: task === 'text-to-video'
      ? (payload.negative_prompt ? [payload.negative_prompt] : undefined)
      : payload.negative_prompt,
    num_frames: options.num_frames ?? config.num_frames ?? derivedNumFrames,
    num_inference_steps: options.steps ?? config.steps,
    seed: payload.seed_ui,
  };

  if (task === 'image-to-video' && payload.height_ui && payload.width_ui) {
    parameters.target_size = {
      height: payload.height_ui,
      width: payload.width_ui,
    };
  }

  return Object.fromEntries(
    Object.entries(parameters).filter(([, value]) => value !== undefined && value !== null && value !== '')
  );
};
 
export class PostToLtxDistilled_ImageVideo extends PostTo {
  constructor(modelConfig = {}) {
    super(modelConfig);
    this.config = { ...LTX_DISTILLED_DEFAULTS, ...modelConfig };
    this.config.space = modelConfig.space
      ?? process.env.LTX_SINGLE_SPACE
      ?? DEFAULT_LTX_IMAGE_VIDEO_SPACE;
    // Align folder naming with wan22 pattern (SPACE second segment)
    this.config.folderName = this.config.folderName ?? this.config.space.split('/')[1];

    this.imageDir = joinOutPath(this.config.folderName);
    fs.ensureDirSync(this.imageDir);

    this._cli = null;
    this._hfProviderClient = null;
    this._spaceInitError = null;
    this.providerFallback = resolveLtxProviderFallbackConfig(modelConfig);
    this.roundCounter = 0;
  }

  async init() {
    const token = this.config.hfToken || process.env.HF_TOKEN || process.env.HF_API_TOKEN || null;
    console.log('[LTX-Distilled ImageVideo] Using HF token:', maskToken(token));
    console.log('[LTX-Distilled ImageVideo] Using HF space:', this.config.space);
    console.log(
      '[LTX-Distilled ImageVideo] HF provider fallback:',
      this.providerFallback.enabled
        ? `${this.providerFallback.provider} ${this.providerFallback.model} (${maskToken(this.providerFallback.accessToken)})`
        : 'disabled'
    );
    try {
      this._cli = await Client.connect(this.config.space, token ? { hf_token: token } : {});
    } catch (error) {
      this._spaceInitError = error;
      if (this.canUseProviderFallback(error)) {
        console.warn(
          '[LTX-Distilled ImageVideo] Space init failed, will use HF provider fallback instead:',
          String(error?.message || error)
        );
        this._cli = null;
      } else {
        throw error;
      }
    }
    return this;
  }

  canUseProviderFallback(error = null) {
    return this.providerFallback.enabled
      && Boolean(this.providerFallback.accessToken)
      && (!error || isRecoverableLtxSpaceError(error));
  }

  async getHFProviderClient() {
    if (this._hfProviderClient) {
      return this._hfProviderClient;
    }
    if (!this.providerFallback.accessToken) {
      throw new Error('LTX HF provider fallback requires HF_TOKEN, HF_API_TOKEN, or a provider API key.');
    }
    const { InferenceClient } = await import('@huggingface/inference');
    this._hfProviderClient = new InferenceClient(this.providerFallback.accessToken);
    return this._hfProviderClient;
  }

  async persistProviderVideo(videoBlob, metaCore) {
    const fnameVideo = `${Date.now()}-ltx-provider-video.mp4`;
    const savePath = path.join(this.imageDir, fnameVideo);
    const buffer = Buffer.from(await videoBlob.arrayBuffer());
    await fs.writeFile(savePath, buffer);
    const jsonMeta = {
      ...metaCore,
      provider: this.providerFallback.provider,
      model: this.providerFallback.model,
      source: 'hf-provider',
      sourceSpace: this.config.space,
    };
    await saveJSON(savePath, jsonMeta);
    return { file: savePath, json: jsonMeta };
  }

  async promptViaHFProvider(tmpImagePath, payload, options = {}, fallbackReason = '') {
    const client = await this.getHFProviderClient();
    const requestOptions = this.providerFallback.billTo
      ? { billTo: this.providerFallback.billTo }
      : undefined;
    const hasImage = Boolean(tmpImagePath);
    const task = hasImage ? 'image-to-video' : 'text-to-video';
    const parameters = buildLtxProviderParameters({
      payload,
      options,
      config: this.config,
      task,
    });

    console.warn(
      `[LTX-Distilled ImageVideo] Falling back to HF provider ${this.providerFallback.provider} / ${this.providerFallback.model}`
      + (fallbackReason ? ` because: ${fallbackReason}` : '')
    );

    const videoBlob = hasImage
      ? await client.imageToVideo({
        provider: this.providerFallback.provider,
        model: this.providerFallback.model,
        inputs: new Blob([await fs.readFile(tmpImagePath)], { type: 'image/png' }),
        parameters,
      }, requestOptions)
      : await client.textToVideo({
        provider: this.providerFallback.provider,
        model: this.providerFallback.model,
        inputs: payload.prompt || '',
        parameters,
      }, requestOptions);

    const metaCore = {
      prompt: payload.prompt,
      negative_prompt: payload.negative_prompt,
      cfg: this.config.cfg,
      steps: parameters.num_inference_steps ?? this.config.steps,
      motionBucketId: this.config.motionBucketId,
      fps: this.config.fps,
      seed_ui: payload.seed_ui,
      mode: payload.mode,
      height_ui: payload.height_ui,
      width_ui: payload.width_ui,
      duration_ui: payload.duration_ui,
      ui_frames_to_use: payload.ui_frames_to_use,
      ui_guidance_scale: payload.ui_guidance_scale,
      randomize_seed: payload.randomize_seed,
      improve_texture_flag: payload.improve_texture_flag,
      timestamp: new Date().toISOString(),
      endpoint: task,
      fallbackReason,
      parameters,
    };

    return this.persistProviderVideo(videoBlob, metaCore);
  }

  /**
   * Normalize image input (path | Buffer | Sharp | null) to a PNG temp file and return filepath (or null if no image).
   */
  async prepareInputImage(inputImageStream) {
    if (!inputImageStream) return null;
    const imageSharp = toSharp(inputImageStream);
    const tmpInputImage = path.join(this.imageDir, 'input-img', 'start.png');
    fs.ensureDirSync(path.dirname(tmpInputImage));
    await imageSharp.png().toFile(tmpInputImage);
    return tmpInputImage;
  }

  nextMul32(v) {
    v = Math.max(1, Math.round(Number(v) || 0));
    return (v % 32 === 0) ? v : v + (32 - (v % 32));
  }

  buildPayload(basePrompt, tmpImagePath, options = {}) {
    // Dimension resolution
    let h = options.height_ui ?? options.height ?? this.config.height_ui ?? this.config.height;
    let w = options.width_ui ?? options.width ?? this.config.width_ui ?? this.config.width;
    h = this.nextMul32(h);
    w = this.nextMul32(w);

    const hasImage = !!tmpImagePath;

    return {
      prompt: basePrompt ?? '',
      negative_prompt: options.negative_prompt ?? this.config.negative_prompt,
      input_image_filepath: hasImage ? handle_file(tmpImagePath) : '',
      input_video_filepath: options.input_video_filepath ?? '',
      height_ui: h,
      width_ui: w,
      mode: options.mode ?? (hasImage ? 'image-to-video' : 'text-to-video'),
      duration_ui: options.duration_ui ?? options.duration_seconds ?? this.config.duration_ui ?? this.config.duration_seconds,
      ui_frames_to_use: options.ui_frames_to_use ?? this.config.ui_frames_to_use,
      ui_guidance_scale: options.ui_guidance_scale
        ?? options.guidance_scale
        ?? options.guide_scale
        ?? this.config.ui_guidance_scale
        ?? this.config.guidance_scale
        ?? this.config.guide_scale,
      seed_ui: options.seed_ui ?? options.seed ?? this.config.seed_ui ?? this.config.seed,
      randomize_seed: options.randomize_seed ?? this.config.randomize_seed,
      improve_texture_flag: options.improve_texture_flag ?? this.config.improve_texture_flag
    };
  }

  async downloadAndPersist(videoUrl, metaCore) {
    const fnameVideo = `${Date.now()}-ltx-distilled-video.mp4`;
    const savePath = path.join(this.imageDir, fnameVideo);
    console.log(`[LTX-Distilled ImageVideo] Downloading video: ${videoUrl}`);
    await downloadToFile(videoUrl, savePath, { timeoutMs: this.config.downloadTimeoutMs });
    const jsonMeta = {
      ...metaCore,
      model: this.config.space,
      sourceUrl: videoUrl,
      videoUrl
    };
    await saveJSON(savePath, jsonMeta);
    return { file: savePath, json: jsonMeta };
  }

  async prompt(inputImageStream, options = {}) {
    await this.checkSignature();

    const loop = options.loop;
    if (loop) {
      // Termination heuristic copied from wan22 & heartsync
      if (
        (this.roundCounter + (loop.prompts?.length || 0)) %
          ((loop.prompts?.length || 0) + 1) === 0 &&
        this.roundCounter > 0
      ) {
        return true;
      }
    }

    const tmpImagePath = await this.prepareInputImage(inputImageStream);

    const basePrompt = options.prompt ?? '';
    const payload = this.buildPayload(basePrompt, tmpImagePath, options);

    const endpoint = tmpImagePath ? '/image_to_video' : '/text_to_video';

    console.log('[LTX-Distilled ImageVideo] Payload:', JSON.stringify({ endpoint, ...payload }, null, 2));

    let result;
    let persistedResult = null;
    try {
      if (!this._cli) {
        if (this.canUseProviderFallback(this._spaceInitError)) {
          persistedResult = await this.promptViaHFProvider(
            tmpImagePath,
            payload,
            options,
            String(this._spaceInitError?.message || this._spaceInitError || 'space unavailable')
          );
        } else {
          throw this._spaceInitError || new Error('LTX-Distilled Space client is not initialized.');
        }
      } else {
        result = await withTimeout(
          this._cli.predict(endpoint, payload),
          this.config.predictTimeoutMs,
          `${this.config.space} ${endpoint}`
        );
      }
    } catch (err) {
      if (this.canUseProviderFallback(err)) {
        persistedResult = await this.promptViaHFProvider(
          tmpImagePath,
          payload,
          options,
          String(err?.message || err)
        );
      } else {
        console.error('[LTX-Distilled ImageVideo] Predict error:', err);
        throw err;
      }
    }

    if (!persistedResult) {
      // Extract video URL from response
      let videoUrl = null;
      if (Array.isArray(result?.data)) {
        const first = result.data[0];
        if (first) {
          if (first.video && typeof first.video === 'object' && first.video.url) {
            videoUrl = first.video.url;
          } else if (typeof first.video === 'string') {
            videoUrl = first.video;
          } else if (typeof first.url === 'string') {
            videoUrl = first.url;
          }
        }
      }
      if (!videoUrl) {
        throw new Error('LTX-Distilled: Space returned no video URL (unexpected format).');
      }

      const metaCore = {
        prompt: payload.prompt,
        negative_prompt: payload.negative_prompt,
        cfg: this.config.cfg,
        steps: this.config.steps,
        motionBucketId: this.config.motionBucketId,
        fps: this.config.fps,
        seed_ui: payload.seed_ui,
        mode: payload.mode,
        height_ui: payload.height_ui,
        width_ui: payload.width_ui,
        duration_ui: payload.duration_ui,
        ui_frames_to_use: payload.ui_frames_to_use,
        ui_guidance_scale: payload.ui_guidance_scale,
        randomize_seed: payload.randomize_seed,
        improve_texture_flag: payload.improve_texture_flag,
        timestamp: new Date().toISOString(),
        endpoint
      };

      persistedResult = await this.downloadAndPersist(videoUrl, metaCore);
    }

    const { file: videoPath, json } = persistedResult;

    // Loop handling
    if (loop) {
      const lastPng = videoPath.replace(/\.mp4$/, '-last-frame.png');
      try {
        await extractLastFrame(videoPath, lastPng);
      } catch (e) {
        console.warn('[LTX-Distilled ImageVideo] Failed to extract last frame:', e);
      }

      // Increment seed if deterministic (randomize_seed=false)
      if (typeof payload.seed_ui === 'number' && !payload.randomize_seed) {
        options.seed_ui = payload.seed_ui + 1;
      }

      // Prepare next prompt from loop list
      const nextPrompt = loop.prompts
        ? loop.prompts[this.roundCounter % loop.prompts.length]
        : basePrompt;

      this.roundCounter = (this.roundCounter || 0) + 1;

      // Recurse with last frame as new input image
      await this.prompt(lastPng, {
        ...options,
        prompt: nextPrompt
      });
    }

    this.roundCounter = (this.roundCounter || 0) + 1;

    return { file: videoPath, json };
  }
}

export default {
  init: async (config = {}) => {
    const instance = new PostToLtxDistilled_ImageVideo(config);
    return await instance.init();
  }
};
