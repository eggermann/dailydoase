import PostTo from '../../PostTo.js';
import { Client, handle_file } from '@gradio/client';
import fs from 'fs-extra';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

import { extractLastFrame } from '../../ffmpeg-helpers.js';


import { joinOutPath, toSharp, withTimeout }
  from './../../utils.js';
import { saveJSON, downloadToFile } from './../../save-utils.js';
import { createLogger } from '../../logger.js';
import {
  buildVideoRunMetrics,
  estimateFalWanCostUsd,
  estimateHourlyRunCostUsd,
  formatVideoRunSummary,
  resolveSelfHostedSpaceHourlyUsd,
} from '../../video-run-metrics.js';

// Load local .env from this folder (lib/generator/wan22/.env)
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

const DEFAULT_SPACE = 'Wan-AI/Wan-2.2-5B';
const DEFAULT_ENDPOINT = '/generate_video';
export const DEFAULT_WAN_PROVIDER_FALLBACK_PROVIDER = 'fal-ai';
export const DEFAULT_WAN_PROVIDER_FALLBACK_MODEL = 'Wan-AI/Wan2.2-I2V-A14B';
const SELF_HOSTED_SPACE = 'eggman-poff/wan-s';
const MIXED_SELF_HOSTED_SPACE = 'eggman-poff/wan-mixed';
const SELF_HOSTED_ENDPOINT = '/generate_video_safe';
const SELF_HOSTED_DEFAULT_EXECUTION_MODE = 'Local GPU';
const SELF_HOSTED_DEFAULT_PROFILE = '480P profile';
const SELF_HOSTED_HIGH_PROFILE = '720P profile';
const SELF_HOSTED_DEFAULT_PRESET = 'Wan 2.1 I2V 480P (official)';
const SELF_HOSTED_HIGH_PRESET = 'Wan 2.1 I2V 720P (official)';
const MULTIMODALART_FAST_SPACE = 'multimodalart/wan2-1-fast';
const SELF_HOSTED_PROFILE_MAX_AREA = {
  [SELF_HOSTED_DEFAULT_PROFILE]: 832 * 480,
  [SELF_HOSTED_HIGH_PROFILE]: 1280 * 720,
};
const SELF_HOSTED_DEFAULT_FPS = 8;
const SELF_HOSTED_MIN_FRAMES = 33;
const SELF_HOSTED_MAX_FRAMES = 121;
const SELF_HOSTED_FRAME_STEP = 4;
const logger = createLogger('wan:image-video', { envKeys: ['WAN_DEBUG'] });
const wanDefaults = {
  duration_seconds: {
    value: 3.0,
    max: 5
  },
  output_height: {
    value: 928,
    max: 1280
  },
  output_width: {
    value: 928,
    max: 1280
  },
  sampling_steps: {
    value: 38,
    max: 50
  },
  guidance_scale: {
    value: 5,
    max: 10
  },
  sample_shift: {
    value: 5,
    max: 20
  },
  seed: {
    value: -1
  }
};

const TRUTHY_VALUES = new Set(['1', 'true', 'yes', 'on']);
const pickFirstValue = (...values) => values.find((value) => value !== undefined && value !== null && value !== '');
const pickFirstEnv = (...names) => pickFirstValue(...names.map((name) => process.env[name]));
const resolveWanSpaceAccessToken = (config = {}) => pickFirstValue(
  config.hfToken,
  pickFirstEnv('HF_TOKEN', 'HF_API_TOKEN')
) || null;

const normalizeBoolean = (value) => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') return TRUTHY_VALUES.has(value.trim().toLowerCase());
  return false;
};

const shouldForceRequestedDimensions = (options = {}, config = {}) => normalizeBoolean(
  options.force_requested_dimensions
  ?? options.forceRequestedDimensions
  ?? config.force_requested_dimensions
  ?? config.forceRequestedDimensions
  ?? process.env.FRESHWEB_WAN_FORCE_REQUESTED_DIMENSIONS
);

const shouldForceHFProviderFallback = (config = {}) => normalizeBoolean(
  pickFirstValue(
    config.force_hf_provider_fallback,
    config.forceHfProviderFallback,
    pickFirstEnv(
      'FRESHWEB_WAN_SINGLE_FORCE_HF_PROVIDER',
      'WAN_SINGLE_FORCE_HF_PROVIDER',
      'FRESHWEB_WAN_FORCE_HF_PROVIDER',
      'WAN_FORCE_HF_PROVIDER'
    )
  )
);

const normalizeSpaceId = (value) => {
  const normalized = String(value || '').trim().toLowerCase().replace(/\/+$/g, '');
  if (!normalized) return '';
  const spacesMatch = normalized.match(/^https?:\/\/huggingface\.co\/spaces\/([^/]+)\/([^/?#]+)/);
  if (spacesMatch) {
    return `${spacesMatch[1]}/${spacesMatch[2]}`;
  }
  if (normalized === 'https://multimodalart-wan2-1-fast.hf.space') {
    return MULTIMODALART_FAST_SPACE;
  }
  return normalized;
};

const clampNumber = (value, min, max, fallback = min) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
};

const roundToSteppedRange = (value, min, max, step, fallback = min) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  const clamped = Math.min(max, Math.max(min, Math.round(n)));
  return Math.min(max, Math.max(min, min + (Math.round((clamped - min) / step) * step)));
};

const nextMul32 = (value) => {
  const v = Math.max(1, Math.round(Number(value) || 0));
  return (v % 32 === 0) ? v : v + (32 - (v % 32));
};

const fitDimensionsToSourceAspect = ({
  sourceWidth,
  sourceHeight,
  maxWidth,
  maxHeight,
  minSide = 256,
}) => {
  if (!Number.isFinite(sourceWidth) || !Number.isFinite(sourceHeight) || sourceWidth <= 0 || sourceHeight <= 0) {
    return {
      width: nextMul32(Math.max(minSide, maxWidth)),
      height: nextMul32(Math.max(minSide, maxHeight)),
    };
  }

  const widthScale = maxWidth / sourceWidth;
  const heightScale = maxHeight / sourceHeight;
  const scale = Math.min(widthScale, heightScale);
  const safeScale = Number.isFinite(scale) && scale > 0 ? scale : 1;

  let width = nextMul32(Math.max(minSide, sourceWidth * safeScale));
  let height = nextMul32(Math.max(minSide, sourceHeight * safeScale));

  while (width > maxWidth && width > minSide) {
    width -= 32;
  }
  while (height > maxHeight && height > minSide) {
    height -= 32;
  }

  return {
    width: Math.max(minSide, width),
    height: Math.max(minSide, height),
  };
};

const fitDimensionsToMaxArea = ({
  sourceWidth,
  sourceHeight,
  maxArea,
}) => {
  if (!Number.isFinite(sourceWidth) || !Number.isFinite(sourceHeight) || sourceWidth <= 0 || sourceHeight <= 0) {
    return {
      width: 832,
      height: 480,
    };
  }

  const aspectRatio = sourceHeight / sourceWidth;
  return {
    height: Math.max(16, Math.round(Math.sqrt(maxArea * aspectRatio) / 16) * 16),
    width: Math.max(16, Math.round(Math.sqrt(maxArea / aspectRatio) / 16) * 16),
  };
};

const isHttpUrl = (value) => typeof value === 'string' && /^https?:\/\//i.test(value);
const looksLikeVideoRef = (value) => typeof value === 'string'
  && (/\.mp4(\?|$)/i.test(value) || value.includes('/file=') || value.includes('/gradio_api/file='));
const looksLikeErrorText = (value) => typeof value === 'string' && /^error:/i.test(value.trim());

const collectVideoRefs = (value, out = []) => {
  if (!value) return out;
  if (typeof value === 'string') {
    out.push(value);
    return out;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectVideoRefs(item, out);
    return out;
  }
  if (typeof value === 'object') {
    if (typeof value.url === 'string') out.push(value.url);
    if (typeof value.path === 'string') out.push(value.path);
    if (typeof value.video === 'string') out.push(value.video);
    if (value.video && typeof value.video === 'object') collectVideoRefs(value.video, out);
    for (const nested of Object.values(value)) collectVideoRefs(nested, out);
  }
  return out;
};

const collectErrorTexts = (value, out = []) => {
  if (!value) return out;
  if (typeof value === 'string') {
    if (looksLikeErrorText(value)) {
      out.push(value.trim());
    }
    return out;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectErrorTexts(item, out);
    return out;
  }
  if (typeof value === 'object') {
    for (const nested of Object.values(value)) collectErrorTexts(nested, out);
  }
  return out;
};

const toPublicFileUrl = (cli, value) => {
  if (!value || typeof value !== 'string') return null;
  if (isHttpUrl(value)) return value;

  const root = (cli?.config?.root_url || cli?.config?.root || '').replace(/\/$/, '');
  const apiPrefix = (cli?.config?.api_prefix || cli?.api_prefix || '/gradio_api').replace(/\/$/, '');
  if (!root) return null;

  if (value.startsWith('/gradio_api/file=')) return `${root}${value}`;
  if (value.startsWith('/file=')) return `${root}${value}`;
  if (value.startsWith('file=')) return `${root}/${value}`;
  if (value.startsWith('/tmp/') || value.startsWith('tmp/') || value.startsWith('/output/') || value.startsWith('output/')) {
    return `${root}${apiPrefix}/file=${value}`;
  }
  if (value.startsWith('/')) return `${root}${value}`;
  return `${root}/${value}`;
};

export const isWanQuotaExceededError = (error) => {
  const message = String(error?.message || error || '').toLowerCase();
  return /exceeded your (?:pro )?gpu quota/.test(message)
    || (/zerogpu/.test(message) && /quota|try again/i.test(message));
};

export const isRecoverableWanSpaceError = (error) => {
  const message = String(error?.message || error || '').toLowerCase();
  return isWanQuotaExceededError(error)
    || /could not resolve app config/.test(message)
    || /fetch failed/.test(message)
    || /failed to fetch/.test(message)
    || /\b429\b/.test(message)
    || /\b503\b/.test(message);
};

export const resolveWanProviderFallbackConfig = (config = {}) => {
  const enabled = normalizeBoolean(
    pickFirstValue(
      config.hfProviderFallbackEnabled,
      pickFirstEnv(
        'FRESHWEB_WAN_SINGLE_USE_HF_PROVIDER_FALLBACK',
        'WAN_SINGLE_USE_HF_PROVIDER_FALLBACK',
        'FRESHWEB_WAN_USE_HF_PROVIDER_FALLBACK',
        'WAN_USE_HF_PROVIDER_FALLBACK'
      )
    )
  );
  const provider = pickFirstValue(
    config.hfProvider,
    pickFirstEnv(
      'FRESHWEB_WAN_SINGLE_HF_PROVIDER',
      'WAN_SINGLE_HF_PROVIDER',
      'FRESHWEB_WAN_HF_PROVIDER',
      'WAN_HF_PROVIDER'
    ),
    DEFAULT_WAN_PROVIDER_FALLBACK_PROVIDER
  );
  const model = pickFirstValue(
    config.hfProviderModel,
    pickFirstEnv(
      'FRESHWEB_WAN_SINGLE_HF_MODEL',
      'WAN_SINGLE_HF_MODEL',
      'FRESHWEB_WAN_HF_MODEL',
      'WAN_HF_MODEL'
    ),
    DEFAULT_WAN_PROVIDER_FALLBACK_MODEL
  );
  const accessToken = pickFirstValue(
    config.hfProviderApiKey,
    config.hfToken,
    pickFirstEnv(
      'FRESHWEB_WAN_SINGLE_HF_PROVIDER_API_KEY',
      'WAN_SINGLE_HF_PROVIDER_API_KEY',
      'FRESHWEB_WAN_HF_PROVIDER_API_KEY',
      'WAN_HF_PROVIDER_API_KEY',
      'HF_TOKEN',
      'HF_API_TOKEN',
      'HF_APIKEY'
    )
  ) || null;
  const billTo = pickFirstValue(
    config.hfProviderBillTo,
    pickFirstEnv(
      'FRESHWEB_WAN_SINGLE_HF_BILL_TO',
      'WAN_SINGLE_HF_BILL_TO',
      'FRESHWEB_WAN_HF_BILL_TO',
      'WAN_HF_BILL_TO'
    )
  ) || null;

  return {
    enabled,
    provider,
    model,
    accessToken,
    billTo,
  };
};

export const buildWanProviderParameters = ({
  payload = {},
  options = {},
  config = {},
} = {}) => {
  const fps = Number(
    options.frames_per_second
    ?? options.fps
    ?? config.frames_per_second
    ?? config.fps
    ?? 24
  );
  const durationSeconds = Number(payload.duration_seconds ?? config.duration_seconds ?? 0);
  const derivedNumFrames = Number.isFinite(durationSeconds) && durationSeconds > 0 && Number.isFinite(fps) && fps > 0
    ? Math.max(8, Math.min(129, Math.round(durationSeconds * fps)))
    : undefined;
  const parameters = {
    prompt: payload.prompt || '',
    negative_prompt: options.negative_prompt ?? config.negative_prompt,
    guidance_scale: payload.guide_scale ?? options.guide_scale ?? config.guide_scale,
    num_frames: options.num_frames ?? config.num_frames ?? derivedNumFrames,
    num_inference_steps: payload.sampling_steps ?? options.sampling_steps ?? config.sampling_steps,
    seed: payload.seed ?? options.seed ?? config.seed,
  };

  if (payload.height && payload.width) {
    parameters.target_size = {
      height: payload.height,
      width: payload.width,
    };
  }

  return Object.fromEntries(
    Object.entries(parameters).filter(([, value]) => value !== undefined && value !== null && value !== '')
  );
};

export const resolveWanSingleImageRuntime = (config = {}) => {
  const selfHostedSpace = config.selfHostedHugginfaceSpace
    ?? config.selfHostedHuggingfaceSpace
    ?? config.selfHostedHuggingFaceSpace
    ?? process.env.WAN22_SINGLE_SELF_HOSTED_SPACE
    ?? SELF_HOSTED_SPACE;
  const selfHostedHugginfaceModel = normalizeBoolean(
    config.selfHostedHugginfaceModel
    ?? config.selfHostedHuggingfaceModel
    ?? config.selfHostedHuggingFaceModel
  );

  if (selfHostedHugginfaceModel) {
    return {
      selfHostedHugginfaceModel: true,
      space: selfHostedSpace,
      endpoint: SELF_HOSTED_ENDPOINT,
    };
  }

  const resolvedSpace = config.space ?? process.env.WAN22_SINGLE_SPACE ?? DEFAULT_SPACE;
  const normalizedResolvedSpace = normalizeSpaceId(resolvedSpace);
  const usesWanSSpace = normalizedResolvedSpace === normalizeSpaceId(selfHostedSpace);
  const usesMixedSpace = normalizedResolvedSpace === normalizeSpaceId(MIXED_SELF_HOSTED_SPACE);
  return {
    selfHostedHugginfaceModel: usesWanSSpace || usesMixedSpace,
    space: resolvedSpace,
    endpoint: (usesWanSSpace || usesMixedSpace) ? SELF_HOSTED_ENDPOINT : DEFAULT_ENDPOINT,
  };
};

export const resolveWanInputImageFieldName = (space = '') => (
  normalizeSpaceId(space) === normalizeSpaceId(MULTIMODALART_FAST_SPACE)
    ? 'input_image'
    : 'image'
);

export const extractWanSingleImageVideoUrl = (cli, result) => {
  const errorTexts = collectErrorTexts(result?.data);
  if (errorTexts.length > 0) {
    throw new Error(`Wan image-video: ${errorTexts[0].replace(/^error:\s*/i, '').trim()}`);
  }

  const refs = collectVideoRefs(result?.data);
  const candidates = refs.filter(looksLikeVideoRef);
  const chosen = candidates[0] || refs[0] || null;
  return toPublicFileUrl(cli, chosen);
};


export class PostToWan22_5B_ImageVideo extends PostTo {
  constructor(modelConfig = {}) {
    super(modelConfig);
    this.config = modelConfig || {};
    this.runtime = resolveWanSingleImageRuntime(this.config);
    this.providerFallback = resolveWanProviderFallbackConfig(this.config);
    this.forceProviderFallback = shouldForceHFProviderFallback(this.config);
    this.config.space = this.runtime.space;
    this.config.folderName = this.config.folderName ?? this.runtime.space.split('/')[1];

    // Apply defaults from wanDefaults
    this.config.duration_seconds = this.config.duration_seconds ?? wanDefaults.duration_seconds.value;
    this.config.sampling_steps = this.config.sampling_steps ?? wanDefaults.sampling_steps.value;
    this.config.guide_scale = this.config.guide_scale ?? wanDefaults.guidance_scale.value;
    this.config.shift = this.config.shift ?? wanDefaults.sample_shift.value;
    // Allow UI-style dimension keys to override when provided
    this.config.height = (this.config.height ?? this.config.height_ui) ?? wanDefaults.output_height.value;
    this.config.width = (this.config.width ?? this.config.width_ui) ?? wanDefaults.output_width.value;

    this._cli = null;
    this._hfProviderClient = null;
    this._spaceInitError = null;
    this.imageDir = joinOutPath(this.config.folderName);
    fs.ensureDirSync(this.imageDir);
    this.roundCounter = 0;
  }

  async resolveVideoDimensions(tmpInputImage, options = {}) {
    const requestedHeight = options.height ?? options.height_ui ?? this.config.height ?? wanDefaults.output_height.value;
    const requestedWidth = options.width ?? options.width_ui ?? this.config.width ?? wanDefaults.output_width.value;
    const preserveInputAspect = options.preserve_input_aspect ?? this.config.preserve_input_aspect ?? true;
    const forceRequestedDimensions = shouldForceRequestedDimensions(options, this.config);

    if (forceRequestedDimensions) {
      return {
        height: requestedHeight,
        width: requestedWidth,
      };
    }

    if (this.runtime.selfHostedHugginfaceModel) {
      try {
        const metadata = await sharp(tmpInputImage).metadata();
        const resolutionProfile = this.resolveSelfHostedResolutionProfile(options);
        const maxArea = this.resolveSelfHostedMaxArea(options, requestedWidth, requestedHeight);
        if (metadata?.width && metadata?.height) {
          return fitDimensionsToMaxArea({
            sourceWidth: metadata.width,
            sourceHeight: metadata.height,
            maxArea: maxArea || SELF_HOSTED_PROFILE_MAX_AREA[resolutionProfile],
          });
        }
      } catch (error) {
        logger.warn('Failed to read input image metadata for self-hosted WAN sizing.', error?.message || error);
      }
      return {
        height: requestedHeight,
        width: requestedWidth,
      };
    }

    if (preserveInputAspect) {
      try {
        const metadata = await sharp(tmpInputImage).metadata();
        if (metadata?.width && metadata?.height) {
          return fitDimensionsToSourceAspect({
            sourceWidth: metadata.width,
            sourceHeight: metadata.height,
            maxWidth: requestedWidth,
            maxHeight: requestedHeight,
          });
        }
      } catch (error) {
        logger.warn('Failed to read input image metadata for aspect-preserving sizing.', error?.message || error);
      }
    }

    try {
      const dimRes = await this._cli.predict('/handle_image_upload_for_dims_wan', {
        uploaded_pil_image: handle_file(tmpInputImage),
        current_h_val: requestedHeight,
        current_w_val: requestedWidth,
      });
      if (Array.isArray(dimRes?.data) && dimRes.data.length >= 2) {
        return {
          height: Number(dimRes.data[0]) || requestedHeight,
          width: Number(dimRes.data[1]) || requestedWidth,
        };
      }
    } catch (error) {
      logger.warn('Failed to resolve WAN dimensions from helper; falling back to configured defaults.', error?.message || error);
    }

    return {
      height: requestedHeight,
      width: requestedWidth,
    };
  }

  resolveRequestedDimensions(options = {}) {
    return {
      requestedHeight: options.height ?? options.height_ui ?? this.config.height ?? wanDefaults.output_height.value,
      requestedWidth: options.width ?? options.width_ui ?? this.config.width ?? wanDefaults.output_width.value,
    };
  }

  resolveSelfHostedResolutionProfile(options = {}) {
    const explicitProfile = String(options.resolution_profile ?? this.config.resolution_profile ?? '').trim();
    if (explicitProfile && SELF_HOSTED_PROFILE_MAX_AREA[explicitProfile]) {
      return explicitProfile;
    }

    const { requestedHeight, requestedWidth } = this.resolveRequestedDimensions(options);
    const requestedArea = Number(requestedHeight) * Number(requestedWidth);
    return requestedArea > SELF_HOSTED_PROFILE_MAX_AREA[SELF_HOSTED_DEFAULT_PROFILE]
      ? SELF_HOSTED_HIGH_PROFILE
      : SELF_HOSTED_DEFAULT_PROFILE;
  }

  resolveSelfHostedMaxArea(options = {}, requestedWidth, requestedHeight) {
    const explicitMaxArea = Number(options.custom_max_area ?? this.config.custom_max_area);
    if (Number.isFinite(explicitMaxArea) && explicitMaxArea > 0) {
      return Math.round(explicitMaxArea);
    }

    const width = Number(requestedWidth);
    const height = Number(requestedHeight);
    if (Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0) {
      return Math.round(width * height);
    }

    const profile = this.resolveSelfHostedResolutionProfile(options);
    return SELF_HOSTED_PROFILE_MAX_AREA[profile];
  }

  resolveSelfHostedModelPreset(options = {}) {
    const explicitPreset = String(options.model_preset ?? this.config.model_preset ?? '').trim();
    if (explicitPreset) {
      return explicitPreset;
    }

    const profile = this.resolveSelfHostedResolutionProfile(options);
    return profile === SELF_HOSTED_HIGH_PROFILE ? SELF_HOSTED_HIGH_PRESET : SELF_HOSTED_DEFAULT_PRESET;
  }

  resolveSelfHostedFps(options = {}) {
    return clampNumber(
      options.frames_per_second
      ?? options.fps_for_conditioning_and_export
      ?? options.fps
      ?? this.config.frames_per_second
      ?? this.config.fps
      ?? SELF_HOSTED_DEFAULT_FPS,
      8,
      24,
      SELF_HOSTED_DEFAULT_FPS
    );
  }

  resolveSelfHostedSeed(options = {}) {
    const rawSeed = options.seed ?? this.config.seed;
    const randomizeSeed = options.randomize_seed
      ?? this.config.randomize_seed
      ?? (!(Number.isFinite(Number(rawSeed)) && Number(rawSeed) >= 0));

    return {
      randomizeSeed: Boolean(randomizeSeed),
      seed: clampNumber(rawSeed, 0, 999999, 0),
    };
  }

  resolveSelfHostedNumFrames(durationSeconds, fps, options = {}) {
    if (options.num_frames ?? this.config.num_frames) {
      return roundToSteppedRange(
        options.num_frames ?? this.config.num_frames,
        SELF_HOSTED_MIN_FRAMES,
        SELF_HOSTED_MAX_FRAMES,
        SELF_HOSTED_FRAME_STEP,
        SELF_HOSTED_MIN_FRAMES
      );
    }

    return roundToSteppedRange(
      (Number(durationSeconds) || this.config.duration_seconds || wanDefaults.duration_seconds.value) * Number(fps || SELF_HOSTED_DEFAULT_FPS),
      SELF_HOSTED_MIN_FRAMES,
      SELF_HOSTED_MAX_FRAMES,
      SELF_HOSTED_FRAME_STEP,
      SELF_HOSTED_MIN_FRAMES
    );
  }

  async buildSelfHostedPayload(tmpInputImage, options = {}, durationSeconds) {
    const { requestedHeight, requestedWidth } = this.resolveRequestedDimensions(options);
    const resolutionProfile = this.resolveSelfHostedResolutionProfile(options);
    const customMaxArea = this.resolveSelfHostedMaxArea(options, requestedWidth, requestedHeight);
    const fps = this.resolveSelfHostedFps(options);
    const { seed, randomizeSeed } = this.resolveSelfHostedSeed(options);
    const numFrames = this.resolveSelfHostedNumFrames(durationSeconds, fps, options);
    const prompt = options.prompt ?? '';
    const negativePrompt = options.negative_prompt ?? this.config.negative_prompt ?? '';
    const samplingSteps = clampNumber(options.sampling_steps ?? this.config.sampling_steps, 8, 60, 8);
    const guideScale = clampNumber(options.guide_scale ?? this.config.guide_scale, 1, 8, 1);

    return {
      payload: {
        param_0: handle_file(tmpInputImage),
        param_1: options.execution_mode ?? this.config.execution_mode ?? SELF_HOSTED_DEFAULT_EXECUTION_MODE,
        param_2: this.resolveSelfHostedModelPreset(options),
        param_3: options.custom_model_id ?? this.config.custom_model_id ?? '',
        param_4: resolutionProfile,
        param_5: customMaxArea,
        param_6: prompt,
        param_7: negativePrompt,
        param_8: numFrames,
        param_9: samplingSteps,
        param_10: guideScale,
        param_11: fps,
        param_12: seed,
        param_13: randomizeSeed,
        param_14: options.remote_endpoint_url ?? this.config.remote_endpoint_url ?? '',
        param_15: options.remote_endpoint_token ?? this.config.remote_endpoint_token ?? '',
        param_16: options.endpoint_payload_template ?? this.config.endpoint_payload_template ?? '',
      },
      metadata: {
        resolutionProfile,
        customMaxArea,
        fps,
        numFrames,
        seed,
        randomizeSeed,
      },
    };
  }

  extractVideoUrl(result) {
    return extractWanSingleImageVideoUrl(this._cli, result);
  }

  canUseProviderFallback(error = null) {
    return (this.runtime.selfHostedHugginfaceModel || this.forceProviderFallback)
      && this.providerFallback.enabled
      && Boolean(this.providerFallback.accessToken)
      && (
        this.forceProviderFallback
        || !error
        || isRecoverableWanSpaceError(error)
      );
  }

  async getHFProviderClient() {
    if (this._hfProviderClient) {
      return this._hfProviderClient;
    }
    if (!this.providerFallback.accessToken) {
      throw new Error('WAN HF provider fallback requires HF_TOKEN, HF_API_TOKEN, or a provider API key.');
    }
    const { InferenceClient } = await import('@huggingface/inference');
    this._hfProviderClient = new InferenceClient(this.providerFallback.accessToken);
    return this._hfProviderClient;
  }

  async persistProviderVideo(videoBlob, metaCore) {
    const fnameVideo = `${Date.now()}-wan-provider-video.mp4`;
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
    if (jsonMeta.metrics) {
      logger.info(formatVideoRunSummary(jsonMeta.metrics));
    }
    const jsonData = await saveJSON(savePath, jsonMeta);
    return { file: savePath, json: jsonData };
  }

  async promptViaHFProvider(tmpImagePath, payload, options = {}, fallbackReason = '') {
    const client = await this.getHFProviderClient();
    const requestOptions = this.providerFallback.billTo
      ? { billTo: this.providerFallback.billTo }
      : undefined;
    const parameters = buildWanProviderParameters({
      payload,
      options,
      config: this.config,
    });

    logger.warn(
      `[WAN ImageVideo] Falling back to HF provider ${this.providerFallback.provider} / ${this.providerFallback.model}`
      + (fallbackReason ? ` because: ${fallbackReason}` : '')
    );

    const startedAt = Date.now();
    const videoBlob = await client.imageToVideo({
      provider: this.providerFallback.provider,
      model: this.providerFallback.model,
      inputs: new Blob([await fs.readFile(tmpImagePath)], { type: 'image/png' }),
      parameters,
    }, requestOptions);
    const elapsedMs = Date.now() - startedAt;
    const metrics = buildVideoRunMetrics({
      runtime: 'hf-provider-fallback',
      provider: this.providerFallback.provider,
      model: this.providerFallback.model,
      space: this.config.space,
      elapsedMs,
      outputDurationSeconds: payload.duration_seconds,
      estimatedCostUsd: estimateFalWanCostUsd({
        model: this.providerFallback.model,
        width: payload.width,
        height: payload.height,
        numFrames: parameters.num_frames,
      }),
      width: payload.width,
      height: payload.height,
      numFrames: parameters.num_frames,
      costSource: this.providerFallback.provider === 'fal-ai'
        ? 'huggingface-routed-fal-pass-through-estimate'
        : '',
    });

    return this.persistProviderVideo(videoBlob, {
      prompt: payload.prompt,
      negative_prompt: options.negative_prompt ?? this.config.negative_prompt,
      height: payload.height,
      width: payload.width,
      duration_seconds: payload.duration_seconds,
      sampling_steps: payload.sampling_steps,
      guide_scale: payload.guide_scale,
      shift: payload.shift,
      seed: payload.seed,
      endpoint: 'image-to-video',
      fallbackReason,
      parameters,
      timestamp: new Date().toISOString(),
      metrics,
    });
  }

  async init() {
    const token = resolveWanSpaceAccessToken(this.config);
    const selfHostedHourlyUsd = resolveSelfHostedSpaceHourlyUsd({
      space: this.runtime.space,
      config: this.config,
    });
    logger.info('Using HF token:', maskToken(token));
    logger.info('Using WAN image-video space:', this.runtime.space);
    if (this.runtime.selfHostedHugginfaceModel && selfHostedHourlyUsd !== null) {
      logger.info('Using WAN self-hosted hourly rate:', `$${selfHostedHourlyUsd}/h`);
    }
    logger.info(
      'Using WAN HF provider fallback:',
      this.providerFallback.enabled
        ? `${this.providerFallback.provider} ${this.providerFallback.model} (${maskToken(this.providerFallback.accessToken)})`
        : 'disabled'
    );
    if (this.forceProviderFallback) {
      if (!this.canUseProviderFallback()) {
        throw new Error('Forced WAN HF provider fallback is enabled but no provider fallback credentials/config are available.');
      }
      logger.warn('Forcing WAN HF provider fallback; skipping direct Space connection.');
      this._cli = null;
      return this;
    }
    try {
      this._cli = await Client.connect(this.runtime.space, token ? { hf_token: token } : {});
    } catch (error) {
      this._spaceInitError = error;
      if (this.canUseProviderFallback(error)) {
        logger.warn(
          'WAN space init failed, will use HF provider fallback instead:',
          String(error?.message || error)
        );
        this._cli = null;
      } else {
        throw error;
      }
    }
    return this;
  }

  async prompt(inputImageStream, options = {}) {
    if (!this._cli && !this.canUseProviderFallback(this._spaceInitError)) {
      throw new Error(`Wan image-video is unavailable (${this.runtime.space}): client not initialized`);
    }

    //loop
    const loop = options?.loop;

    if (loop) {
      if ((this.roundCounter + (loop.prompts?.length || 0)) % ((loop.prompts?.length || 0) + 1) === 0
       && this.roundCounter > 0) {
        return true;
      }
    }

    const imageSharp = toSharp(inputImageStream);
    const tmpInputImage = path.join(this.imageDir, 'input-img', 'start.png');
    fs.ensureDirSync(path.dirname(tmpInputImage));
    await imageSharp.png().toFile(tmpInputImage);

    let durationSeconds = options.duration_seconds ?? this.config.duration_seconds;
    if (typeof durationSeconds === 'function') {
      durationSeconds = await durationSeconds();
    }

    let h;
    let w;
    let endpoint = this.runtime.endpoint;
    let payload;
    let extraJson = {};

    if (this.runtime.selfHostedHugginfaceModel) {
      ({ payload, metadata: extraJson } = await this.buildSelfHostedPayload(tmpInputImage, options, durationSeconds));
      const dimensions = await this.resolveVideoDimensions(tmpInputImage, options);
      h = dimensions.height;
      w = dimensions.width;
    } else {
      // Resolve output dimensions using the space helper or configured WAN defaults,
      // not the tiny still-image dimensions from the input frame.
      ({ height: h, width: w } = await this.resolveVideoDimensions(tmpInputImage, options));

      // Ensure multiples of 32 (common requirement for T2V models)
      h = nextMul32(h);
      w = nextMul32(w);

      const resizedInputImage = tmpInputImage.replace(/\.png$/, '-resized.png');
      await sharp(tmpInputImage)
        .resize({
          width: w,
          height: h,
          fit: 'contain',
          position: 'centre',
          background: { r: 0, g: 0, b: 0, alpha: 1 },
        })
        .png()
        .toFile(resizedInputImage);
      await fs.move(resizedInputImage, tmpInputImage, { overwrite: true });

      const isFastWanSpace = normalizeSpaceId(this.runtime.space) === normalizeSpaceId(MULTIMODALART_FAST_SPACE);
      payload = isFastWanSpace
        ? {
            [resolveWanInputImageFieldName(this.runtime.space)]: handle_file(tmpInputImage),
            prompt: options.prompt ?? '',
            height: h,
            width: w,
            negative_prompt: options.negative_prompt ?? this.config.negative_prompt ?? '',
            duration_seconds: durationSeconds,
            guidance_scale: options.guide_scale ?? this.config.guide_scale,
            steps: options.sampling_steps ?? this.config.sampling_steps,
            seed: options.seed ?? this.config.seed,
            randomize_seed: options.randomize_seed ?? this.config.randomize_seed ?? false,
          }
        : {
            [resolveWanInputImageFieldName(this.runtime.space)]: handle_file(tmpInputImage),
            prompt: options.prompt ?? '',
            height: h,
            width: w,
            duration_seconds: durationSeconds,
            sampling_steps: options.sampling_steps ?? this.config.sampling_steps,
            guide_scale: options.guide_scale ?? this.config.guide_scale,
            shift: options.shift ?? this.config.shift,
            seed: options.seed ?? this.config.seed,
          };
    }

    let savePath = '';
    let jsonData = null;
    if (!this._cli && this.canUseProviderFallback(this._spaceInitError)) {
      const providerResult = await this.promptViaHFProvider(
        tmpInputImage,
        {
          prompt: options.prompt ?? '',
          height: h,
          width: w,
          duration_seconds: durationSeconds,
          sampling_steps: options.sampling_steps ?? this.config.sampling_steps,
          guide_scale: options.guide_scale ?? this.config.guide_scale,
          shift: options.shift ?? this.config.shift,
          seed: options.seed ?? this.config.seed,
        },
        options,
        String(this._spaceInitError?.message || this._spaceInitError || 'space init failed')
      );
      savePath = providerResult.file;
      jsonData = providerResult.json;
    } else {
      try {
        const startedAt = Date.now();
        if (logger.isDebugEnabled()) {
          logger.payload('generate_video payload', payload);
        }
        logger.netRequest({
          method: 'POST',
          url: `${this.runtime.space}${endpoint}`,
          body: payload,
          label: this.runtime.endpoint,
        });
        const result = await withTimeout(
          this._cli.predict(endpoint, payload),
          15 * 60 * 1000,
          `${this.runtime.space} ${endpoint}`
        );
        logger.netResponse({
          method: 'POST',
          url: `${this.runtime.space}${endpoint}`,
          body: result?.data,
          label: endpoint,
        });

        const url = this.extractVideoUrl(result);

        if (!url) {
          logger.payload('generate_video response (unparsed)', result?.data, { maxLength: 2000 });
          throw new Error(`Wan image-video: Unexpected response format from ${endpoint}`);
        }

        const fnameVideo = `${Date.now()}-wan22-image-video.mp4`;
        savePath = path.join(this.imageDir, fnameVideo);
        const downloadHeaders = {};
        const accessToken = resolveWanSpaceAccessToken(this.config);
        if (accessToken) {
          downloadHeaders.Authorization = `Bearer ${accessToken}`;
        }

        logger.debug(`Downloading video from: ${url}`);
        await downloadToFile(url, savePath, {
          timeoutMs: 15 * 60 * 1000,
          fetchImpl: typeof this._cli?.fetch === 'function' ? this._cli.fetch.bind(this._cli) : fetch,
          headers: Object.keys(downloadHeaders).length > 0 ? downloadHeaders : undefined,
          maxRetries: this.runtime.selfHostedHugginfaceModel ? 5 : 0,
          retryDelayMs: this.runtime.selfHostedHugginfaceModel ? 1500 : 1000,
        });
        logger.debug(`Saved video to: ${savePath}`);
        const elapsedMs = Date.now() - startedAt;
        const selfHostedHourlyUsd = this.runtime.selfHostedHugginfaceModel
          ? resolveSelfHostedSpaceHourlyUsd({
              space: this.runtime.space,
              config: this.config,
            })
          : null;
        const metrics = buildVideoRunMetrics({
          runtime: this.runtime.selfHostedHugginfaceModel ? 'self-hosted-space' : 'hf-space',
          provider: this.runtime.selfHostedHugginfaceModel ? 'huggingface-space' : 'huggingface-space-public',
          model: this.runtime.space,
          space: this.runtime.space,
          elapsedMs,
          outputDurationSeconds: durationSeconds,
          estimatedCostUsd: this.runtime.selfHostedHugginfaceModel
            ? estimateHourlyRunCostUsd({ elapsedMs, hourlyUsd: selfHostedHourlyUsd })
            : null,
          hourlyUsd: selfHostedHourlyUsd,
          width: w,
          height: h,
          numFrames: extraJson?.numFrames,
          costSource: this.runtime.selfHostedHugginfaceModel
            ? 'space-hourly-rate-estimate'
            : '',
        });
        logger.info(formatVideoRunSummary(metrics));

        const json = {
          model: this.runtime.space,
          space: this.runtime.space,
          endpoint,
          prompt: options.prompt ?? '',
          height: h,
          width: w,
          duration_seconds: durationSeconds,
          sampling_steps: options.sampling_steps ?? this.config.sampling_steps,
          guide_scale: options.guide_scale ?? this.config.guide_scale,
          shift: options.shift ?? this.config.shift,
          seed: options.seed ?? this.config.seed,
          selfHostedHugginfaceModel: this.runtime.selfHostedHugginfaceModel,
          ...extraJson,
          metrics,
          url,
          sourceUrl: url
        };

        jsonData = await saveJSON(savePath, json);
      } catch (error) {
        if (!this.canUseProviderFallback(error)) {
          throw error;
        }
        const providerResult = await this.promptViaHFProvider(
          tmpInputImage,
          {
            prompt: options.prompt ?? '',
            height: h,
            width: w,
            duration_seconds: durationSeconds,
            sampling_steps: options.sampling_steps ?? this.config.sampling_steps,
            guide_scale: options.guide_scale ?? this.config.guide_scale,
            shift: options.shift ?? this.config.shift,
            seed: options.seed ?? this.config.seed,
          },
          options,
          String(error?.message || error)
        );
        savePath = providerResult.file;
        jsonData = providerResult.json;
      }
    }

    if (loop) {
      const lastPng = savePath.replace(/\.mp4$/, '-last-frame.png');
      await extractLastFrame(savePath, lastPng);

      if (typeof options.seed === 'number' && options.seed >= 0) {
        options.seed += 1;
      }

      /*???return*/  await this.prompt(lastPng, {
        ...options,
        prompt: loop.prompts
          ? loop.prompts[this.roundCounter % loop.prompts.length]
          : options.prompt
      });
    }

    this.roundCounter = (this.roundCounter || 0) + 1;



    return { file: savePath, json: jsonData };
  }
}
