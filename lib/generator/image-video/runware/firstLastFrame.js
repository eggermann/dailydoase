import fs from 'fs-extra';

import PostTo from '../../PostTo.js';
import { joinOutPath, toSharp } from '../../utils.js';

import {
  imagePathToDataUrl,
  normalizeRunwareDurationSeconds,
  resolveRunwareKey,
  saveRunwareVideoResult,
  submitRunwareVideoJob,
} from './common.js';

const DEFAULT_RUNWARE_MODEL = 'alibaba:wan@2.7';
const DEFAULT_RESOLUTION = '720p';
const DEFAULT_FRAMES_PER_SECOND = 24;

export class PostToRunware_FirstLastFrame extends PostTo {
  constructor(modelConfig = {}) {
    super(modelConfig);
    this.config = modelConfig || {};
    this.config.model = this.config.model || DEFAULT_RUNWARE_MODEL;
    this.config.folderName = this.config.folderName ?? 'runware-first-last';
    this.config.duration_seconds = this.config.duration_seconds ?? 3;
    this.config.resolution = this.config.resolution ?? DEFAULT_RESOLUTION;
    this.config.width = this.config.width ?? 512;
    this.config.height = this.config.height ?? 384;
    this.imageDir = joinOutPath(this.config.folderName);
    fs.ensureDirSync(this.imageDir);
  }

  async init() {
    this.runwareKey = this.config.runwareKey || resolveRunwareKey();
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
    const targetWidth = Number(options.width) || Number(this.config.width) || 512;
    const targetHeight = Number(options.height) || Number(this.config.height) || 384;
    await startSharp
      .resize(targetWidth, targetHeight, { fit: 'cover', position: 'centre' })
      .png()
      .toFile(tmpStart);
    await endSharp
      .resize(targetWidth, targetHeight, { fit: 'cover', position: 'centre' })
      .png()
      .toFile(tmpEnd);

    let durationSeconds = options.duration_seconds ?? this.config.duration_seconds;
    if (typeof durationSeconds === 'function') {
      durationSeconds = await durationSeconds();
    }
    const framesPerSecond = Number(options.frames_per_second) || Number(this.config.frames_per_second) || DEFAULT_FRAMES_PER_SECOND;

    const payload = {
      frameImages: [
        {
          frame: 'first',
          inputImage: await imagePathToDataUrl(tmpStart),
        },
        {
          frame: 'last',
          inputImage: await imagePathToDataUrl(tmpEnd),
        },
      ],
      prompt: options.prompt ?? '',
      duration: normalizeRunwareDurationSeconds(Number(durationSeconds) || this.config.duration_seconds),
      width: targetWidth,
      height: targetHeight,
      resolution: options.resolution || this.config.resolution,
      seed: Number.isFinite(Number(options.seed)) ? Number(options.seed) : this.config.seed,
    };

    const result = await submitRunwareVideoJob({
      apiKey: this.runwareKey,
      model: options.runwareModel || this.config.model,
      prompt: payload.prompt,
      durationSeconds: payload.duration,
      width: payload.width,
      height: payload.height,
      resolution: payload.resolution,
      seed: payload.seed,
      frameImages: payload.frameImages,
    });

    return saveRunwareVideoResult({
      imageDir: this.imageDir,
      filePrefix: `${Date.now()}-runware-first-last`,
      model: options.runwareModel || this.config.model,
      payload,
      result,
      targetDurationSeconds: payload.duration,
      targetFps: framesPerSecond,
    });
  }
}

export default PostToRunware_FirstLastFrame;
