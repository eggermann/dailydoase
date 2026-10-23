import fs from 'fs-extra';

import PostTo from '../../PostTo.js';
import { joinOutPath, toSharp } from '../../utils.js';
import {
  imagePathToDataUrl,
  resolveRunwareKey,
  saveRunwareVideoResult,
  submitRunwareVideoJob,
} from './common.js';

export const RUNWARE_H3_MAX_TURBO_MODEL = 'minimax:h3@max-turbo';
export const RUNWARE_H3_MAX_TURBO_RESOLUTIONS = Object.freeze(['480p', '768p']);
export const RUNWARE_H3_MAX_TURBO_MIN_DURATION_SECONDS = 5;
export const RUNWARE_H3_MAX_TURBO_MAX_DURATION_SECONDS = 15;

export const normalizeRunwareH3MaxTurboResolution = (value = '480p') => {
  const resolution = String(value || '480p').trim();
  if (!RUNWARE_H3_MAX_TURBO_RESOLUTIONS.includes(resolution)) {
    throw new Error(`Unsupported Runware H3 Max Turbo resolution: ${resolution}`);
  }
  return resolution;
};

export const normalizeRunwareH3MaxTurboRequestDuration = (value) => {
  const duration = Number(value);
  const roundedDuration = Number.isFinite(duration)
    ? Math.round(duration)
    : RUNWARE_H3_MAX_TURBO_MIN_DURATION_SECONDS;

  if (roundedDuration > RUNWARE_H3_MAX_TURBO_MAX_DURATION_SECONDS) {
    throw new Error(`Runware H3 Max Turbo supports clips up to ${RUNWARE_H3_MAX_TURBO_MAX_DURATION_SECONDS} seconds`);
  }

  return Math.max(RUNWARE_H3_MAX_TURBO_MIN_DURATION_SECONDS, roundedDuration);
};

export const buildRunwareH3MaxTurboPrompt = (prompt, soundPrompt = '') => {
  const visualPrompt = String(prompt || '').trim();
  const requestedSound = String(soundPrompt || '').trim();
  if (!requestedSound) return visualPrompt;

  return `${visualPrompt}\n\nSound: ${requestedSound}`.trim();
};

export class PostToRunware_H3MaxTurbo extends PostTo {
  constructor(modelConfig = {}) {
    super(modelConfig);
    this.config = modelConfig || {};
    this.config.model = this.config.model || RUNWARE_H3_MAX_TURBO_MODEL;
    this.config.folderName = this.config.folderName ?? 'runware-h3-max-turbo';
    this.config.duration_seconds = this.config.duration_seconds ?? RUNWARE_H3_MAX_TURBO_MIN_DURATION_SECONDS;
    this.config.resolution = normalizeRunwareH3MaxTurboResolution(this.config.resolution);
    this.config.nativeAudio = true;
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

    const inputDir = `${this.imageDir}/input-img`;
    await fs.ensureDir(inputDir);
    const timestamp = Date.now();
    const startPath = `${inputDir}/${timestamp}-start.png`;
    const startImage = toSharp(startImageStream);
    await startImage.png().toFile(startPath);

    const endImageStream = options.endImageStream || null;
    let endPath = '';
    if (endImageStream) {
      endPath = `${inputDir}/${timestamp}-end.png`;
      const endImage = toSharp(endImageStream);
      await endImage.png().toFile(endPath);
    }

    let requestedDurationSeconds = options.duration_seconds ?? this.config.duration_seconds;
    if (typeof requestedDurationSeconds === 'function') {
      requestedDurationSeconds = await requestedDurationSeconds();
    }
    requestedDurationSeconds = Number(requestedDurationSeconds);
    const durationSeconds = normalizeRunwareH3MaxTurboRequestDuration(requestedDurationSeconds);
    const resolution = normalizeRunwareH3MaxTurboResolution(options.resolution || this.config.resolution);
    const prompt = buildRunwareH3MaxTurboPrompt(
      options.prompt,
      options.soundPrompt ?? this.config.soundPrompt
    );
    if (!prompt) {
      throw new Error('Runware H3 Max Turbo requires a visual prompt');
    }

    const frameImages = [{
      frame: 'first',
      image: await imagePathToDataUrl(startPath),
    }];
    if (endPath) {
      frameImages.push({
        frame: 'last',
        image: await imagePathToDataUrl(endPath),
      });
    }

    const payload = {
      model: options.runwareModel || this.config.model,
      prompt,
      soundPrompt: options.soundPrompt ?? this.config.soundPrompt ?? '',
      frameImages,
      requestedDurationSeconds,
      durationSeconds,
      resolution,
      seed: Number.isFinite(Number(options.seed)) ? Number(options.seed) : this.config.seed,
      nativeAudio: true,
    };

    const result = await submitRunwareVideoJob({
      apiKey: this.runwareKey,
      model: payload.model,
      prompt: payload.prompt,
      durationSeconds,
      resolution,
      seed: payload.seed,
      frameImages,
    });

    return saveRunwareVideoResult({
      imageDir: this.imageDir,
      filePrefix: `${timestamp}-runware-h3-max-turbo`,
      model: payload.model,
      payload,
      result,
      targetDurationSeconds: requestedDurationSeconds,
      targetFps: Number(options.frames_per_second) || Number(this.config.frames_per_second) || 24,
    });
  }
}

export default PostToRunware_H3MaxTurbo;
