import fs from 'fs-extra';

import PostTo from '../../PostTo.js';
import { joinOutPath, toSharp } from '../../utils.js';

import {
  imagePathToDataUrl,
  normalizeFalAspectRatio,
  resolveFalKey,
  resolveFalResolution,
  saveFalVideoResult,
  submitFalJob,
} from './common.js';

const DEFAULT_FAL_FIRST_LAST_MODEL = 'fal-ai/wan/v2.7/image-to-video';
const DEFAULT_FRAMES_PER_SECOND = 16;
const MIN_FAL_FIRST_LAST_FRAMES = 81;

export const isFalWan27ImageToVideoModel = (model = '') => (
  String(model || '').trim().toLowerCase() === 'fal-ai/wan/v2.7/image-to-video'
);

const resolveWan27Duration = (value, fallback = 3) => {
  const requested = Number(value);
  const duration = Number.isFinite(requested) && requested > 0 ? requested : fallback;
  return Math.max(2, Math.min(15, Math.round(duration)));
};

const resolveWan27Resolution = (options = {}, config = {}) => {
  const resolved = resolveFalResolution({
    resolution: options.resolution || config.resolution,
    width: options.width ?? config.width,
    height: options.height ?? config.height,
  });
  return resolved === '1080p' ? '1080p' : '720p';
};

export const buildFalFirstLastPayload = async ({
  tmpStart,
  tmpEnd,
  options = {},
  config = {},
  model = '',
} = {}) => {
  const selectedModel = model || options.falModel || config.model || DEFAULT_FAL_FIRST_LAST_MODEL;
  const startImage = await imagePathToDataUrl(tmpStart);
  const endImage = await imagePathToDataUrl(tmpEnd);

  // Wan 2.7 has native first/last support. Unlike the retired Wan 2.1 FLF
  // endpoint, duration is a real 2–15 second parameter, not an 81-frame
  // minimum that must be shortened after inference.
  if (isFalWan27ImageToVideoModel(selectedModel)) {
    const duration = resolveWan27Duration(
      options.duration_seconds ?? options.duration ?? config.duration_seconds,
      Number(config.duration_seconds) || 3
    );
    const seed = options.seed ?? config.seed;
    return {
      image_url: startImage,
      end_image_url: endImage,
      prompt: options.prompt ?? '',
      duration,
      resolution: resolveWan27Resolution(options, config),
      enable_prompt_expansion: false,
      ...(Number.isFinite(Number(seed)) ? { seed: Number(seed) } : {}),
    };
  }

  const framesPerSecond = Number(
    options.frames_per_second
    ?? options.fps
    ?? config.frames_per_second
    ?? config.fps
  ) || DEFAULT_FRAMES_PER_SECOND;
  const requestedDuration = Number(options.duration_seconds ?? config.duration_seconds) || 3;
  const requestedNumFrames = Number(
    options.num_frames
    ?? options.numFrames
    ?? config.num_frames
    ?? config.numFrames
  );
  const numFrames = Number.isFinite(requestedNumFrames) && requestedNumFrames > 0
    ? Math.round(requestedNumFrames)
    : Math.max(MIN_FAL_FIRST_LAST_FRAMES, Math.round(requestedDuration * framesPerSecond));

  return {
    start_image_url: startImage,
    end_image_url: endImage,
    prompt: options.prompt ?? '',
    resolution: resolveFalResolution({
      resolution: options.resolution || config.resolution,
      width: options.width ?? config.width,
      height: options.height ?? config.height,
    }),
    aspect_ratio: normalizeFalAspectRatio(options.aspect_ratio || config.aspect_ratio, 'auto'),
    frames_per_second: framesPerSecond,
    num_frames: numFrames,
    num_inference_steps: Number(options.num_inference_steps ?? options.steps ?? config.num_inference_steps ?? config.steps) || 30,
    guide_scale: Number(options.guide_scale ?? options.guidance_scale ?? config.guide_scale ?? config.guidance_scale) || 5,
    shift: Number(options.shift ?? config.shift) || 5,
  };
};

export class PostToFal_FirstLastFrame extends PostTo {
  constructor(modelConfig = {}) {
    super(modelConfig);
    this.config = modelConfig || {};
    this.config.model = this.config.model || DEFAULT_FAL_FIRST_LAST_MODEL;
    this.config.folderName = this.config.folderName ?? 'fal-first-last';
    this.config.duration_seconds = this.config.duration_seconds ?? 3;
    this.imageDir = joinOutPath(this.config.folderName);
    fs.ensureDirSync(this.imageDir);
  }

  async init() {
    this.falKey = this.config.falKey || resolveFalKey();
    return this;
  }

  async prompt(startImageStream, options = {}) {
    if (!this.config.skipCollectionCounter) {
      await this.checkSignature();
    }

    const startSharp = toSharp(startImageStream);
    const endSharp = toSharp(options.endImageStream || startImageStream);
    const inputDir = `${this.imageDir}/input-img`;
    const tmpStart = `${inputDir}/start.png`;
    const tmpEnd = `${inputDir}/end.png`;
    await fs.ensureDir(inputDir);
    await startSharp.png().toFile(tmpStart);
    await endSharp.png().toFile(tmpEnd);

    const payload = await buildFalFirstLastPayload({
      tmpStart,
      tmpEnd,
      options,
      config: this.config,
      model: options.falModel || this.config.model,
    });
    const requestedDuration = Number(options.duration_seconds) || Number(this.config.duration_seconds) || 3;

    const startedAt = Date.now();
    const result = await submitFalJob({
      model: options.falModel || this.config.model,
      payload,
      falKey: this.falKey,
    });

    return saveFalVideoResult({
      imageDir: this.imageDir,
      filePrefix: `${Date.now()}-fal-first-last`,
      model: options.falModel || this.config.model,
      payload,
      result,
      targetDurationSeconds: requestedDuration,
      targetFps: payload.frames_per_second || null,
      elapsedMs: Date.now() - startedAt,
    });
  }
}

export default PostToFal_FirstLastFrame;
