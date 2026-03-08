import fs from 'fs-extra';

import PostTo from '../../PostTo.js';
import { joinOutPath, toSharp } from '../../utils.js';

import {
  imagePathToDataUrl,
  resolveFalKey,
  saveFalVideoResult,
  submitFalJob,
} from './common.js';

const DEFAULT_FAL_FIRST_LAST_MODEL = 'fal-ai/wan-flf2v';
const DEFAULT_FRAMES_PER_SECOND = 16;

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

    const framesPerSecond = Number(options.frames_per_second) || Number(this.config.frames_per_second) || DEFAULT_FRAMES_PER_SECOND;
    const requestedDuration = Number(options.duration_seconds) || Number(this.config.duration_seconds) || 3;
    const numFrames = Math.max(81, Math.round(requestedDuration * framesPerSecond));

    const payload = {
      start_image_url: await imagePathToDataUrl(tmpStart),
      end_image_url: await imagePathToDataUrl(tmpEnd),
      prompt: options.prompt ?? '',
      resolution: options.resolution || this.config.resolution || '720p',
      aspect_ratio: options.aspect_ratio || this.config.aspect_ratio || 'auto',
      frames_per_second: framesPerSecond,
      num_frames: numFrames,
      num_inference_steps: Number(options.num_inference_steps) || Number(this.config.num_inference_steps) || 30,
      guide_scale: Number(options.guide_scale) || Number(this.config.guide_scale) || 5,
      shift: Number(options.shift) || Number(this.config.shift) || 5,
    };

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
      targetFps: framesPerSecond,
    });
  }
}

export default PostToFal_FirstLastFrame;
