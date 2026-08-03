import fs from 'fs-extra';

import PostTo from '../../PostTo.js';
import { joinOutPath, toSharp } from '../../utils.js';

import {
  imagePathToDataUrl,
  resolveRunwareKey,
  saveRunwareVideoResult,
  submitRunwareVideoJob,
} from './common.js';

const DEFAULT_RUNWARE_MODEL = 'alibaba:wan@2.6-flash';
const DEFAULT_FRAMES_PER_SECOND = 24;

export class PostToRunware_ImageVideo extends PostTo {
  constructor(modelConfig = {}) {
    super(modelConfig);
    this.config = modelConfig || {};
    this.config.model = this.config.model || DEFAULT_RUNWARE_MODEL;
    this.config.folderName = this.config.folderName ?? 'runware-image-video';
    this.config.duration_seconds = this.config.duration_seconds ?? 3;
    this.config.resolution = this.config.resolution ?? '720p';
    this.imageDir = joinOutPath(this.config.folderName);
    fs.ensureDirSync(this.imageDir);
  }

  async init() {
    this.runwareKey = this.config.runwareKey || resolveRunwareKey();
    if (!this.runwareKey) {
      throw new Error('Missing RUNWARE_API_KEY (or RUNWARE_KEY) for Runware video generation');
    }
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

    const payload = {
      frameImages: [
        {
          frame: 'first',
          image: await imagePathToDataUrl(tmpInputImage),
        },
      ],
      prompt: options.prompt ?? '',
      duration: Number(durationSeconds) || this.config.duration_seconds,
      resolution: options.resolution || this.config.resolution || '720p',
      seed: Number.isFinite(Number(options.seed)) ? Number(options.seed) : this.config.seed,
      providerSettings: {
        alibaba: {
          audio: false,
          promptExtend: false,
        },
      },
    };

    const result = await submitRunwareVideoJob({
      apiKey: this.runwareKey,
      model: options.runwareModel || this.config.model,
      prompt: payload.prompt,
      durationSeconds: payload.duration,
      resolution: payload.resolution,
      seed: payload.seed,
      frameImages: payload.frameImages,
      providerSettings: payload.providerSettings,
    });

    return saveRunwareVideoResult({
      imageDir: this.imageDir,
      filePrefix: `${Date.now()}-runware-image-video`,
      model: options.runwareModel || this.config.model,
      payload,
      result,
      targetDurationSeconds: payload.duration,
      targetFps: framesPerSecond,
    });
  }
}

export default PostToRunware_ImageVideo;
