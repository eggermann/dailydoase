import fs from 'fs-extra';

import PostTo from '../../PostTo.js';
import { joinOutPath, toSharp } from '../../utils.js';

import {
  imagePathToDataUrl,
  resolveFalKey,
  saveFalVideoResult,
  submitFalJob,
} from './common.js';

const DEFAULT_FAL_MODEL = 'fal-ai/wan/v2.2-5b/image-to-video';
const DEFAULT_FRAMES_PER_SECOND = 16;
const normalizeFalAspectRatio = (value) => {
  const normalized = String(value || '').trim();
  if (['auto', '16:9', '9:16', '1:1'].includes(normalized)) {
    return normalized;
  }
  return 'auto';
};

export class PostToFal_ImageVideo extends PostTo {
  constructor(modelConfig = {}) {
    super(modelConfig);
    this.config = modelConfig || {};
    this.config.model = this.config.model || DEFAULT_FAL_MODEL;
    this.config.folderName = this.config.folderName ?? 'fal-image-video';
    this.config.duration_seconds = this.config.duration_seconds ?? 3;
    this.config.width = this.config.width ?? 720;
    this.config.height = this.config.height ?? 1280;
    this.config.frames_per_second = this.config.frames_per_second ?? DEFAULT_FRAMES_PER_SECOND;
    this.imageDir = joinOutPath(this.config.folderName);
    fs.ensureDirSync(this.imageDir);
  }

  async init() {
    this.falKey = this.config.falKey || resolveFalKey();
    return this;
  }

  async prompt(inputImageStream, options = {}) {
    if (!this.config.skipCollectionCounter) {
      await this.checkSignature();
    }

    const imageSharp = toSharp(inputImageStream);
    const tmpInputImage = `${this.imageDir}/input-img/start.png`;
    await fs.ensureDir(`${this.imageDir}/input-img`);
    await imageSharp.png().toFile(tmpInputImage);

    let durationSeconds = options.duration_seconds ?? this.config.duration_seconds;
    if (typeof durationSeconds === 'function') {
      durationSeconds = await durationSeconds();
    }
    const framesPerSecond = Number(options.frames_per_second) || Number(this.config.frames_per_second) || DEFAULT_FRAMES_PER_SECOND;
    const numFrames = Math.max(17, Math.round((Number(durationSeconds) || this.config.duration_seconds) * framesPerSecond));

    const payload = {
      image_url: await imagePathToDataUrl(tmpInputImage),
      prompt: options.prompt ?? '',
      num_frames: numFrames,
      frames_per_second: framesPerSecond,
      resolution: options.resolution || this.config.resolution || '720p',
      aspect_ratio: normalizeFalAspectRatio(options.aspect_ratio || this.config.aspect_ratio || '9:16'),
    };

    const result = await submitFalJob({
      model: options.falModel || this.config.model,
      payload,
      falKey: this.falKey,
    });

    return saveFalVideoResult({
      imageDir: this.imageDir,
      filePrefix: `${Date.now()}-fal-image-video`,
      model: options.falModel || this.config.model,
      payload,
      result,
      targetDurationSeconds: Number(durationSeconds) || this.config.duration_seconds,
      targetFps: framesPerSecond,
    });
  }
}

export default PostToFal_ImageVideo;
