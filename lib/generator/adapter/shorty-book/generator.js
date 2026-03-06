import PostTo from '../../PostTo.js';

import { buildImagePrompt, mergeImageConfig } from './image-utils.js';
import { initModels } from './init-models.js';
import {
  buildVideoConfig,
  createRepeatVideoGeneration,
  prepareVideoGeneration,
} from './video-utils.js';
import { addMireloAudioAndUpload } from './mirelo-utils.js';
import { isGpuAbort } from './retry-utils.js';
import { createLogger } from '../../logger.js';

const logger = createLogger('shorty-book:generator', { envKeys: ['GENERATOR_DEBUG'] });
const TRUTHY_VALUES = new Set(['1', 'true', 'yes', 'on']);
const FALSY_VALUES = new Set(['0', 'false', 'no', 'off', '']);

const resolveUseSingleImage = (value) => {
  if (typeof value === 'function') {
    return Boolean(value());
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (TRUTHY_VALUES.has(normalized)) return true;
    if (FALSY_VALUES.has(normalized)) return false;
  }
  if (typeof value === 'boolean') return value;
  return Boolean(value);
};

class Generator extends PostTo {
  /**
   * @param {object} modelConfig
   * @param {'schnell'|'dev'} [modelConfig.fluxVariant] - Choose FLUX endpoint
   */
  constructor(modelConfig) {
    super(modelConfig);

    this.workType = 'start-end-frame-mirelo';
    this.config.folderName = modelConfig.folderName ?? this.workType;

    this.config = modelConfig;
    this.videoModelFirstLast = null;
    this.videoModel2 = null;
    this.flux = null;
  }

  async init() {
    await this.checkSignature();

    const { mireloAI, videoModelFirstLast, videoModelSingle, flux } = await initModels({
      config: this.config,
      imageDir: this.imageDir,
    });

    this.mireloAI = mireloAI;
    this.videoModelFirstLast = videoModelFirstLast;
    this.PostToWan22_5B_ImageVideo = videoModelSingle;
    this.flux = flux;

    // await store.initCache(this.imageDir);
    return this;
  }

  async generateImage(streams, options) {
    const prompt = await buildImagePrompt(streams, options);
    const totalImagePrompt = this.addStaticPrompt(prompt, options.staticPrompt);
    const mergedConfig = mergeImageConfig(this.config, options);

    return this.flux.prompt(totalImagePrompt, mergedConfig);
  }

  async runRepeatVideoGeneration() {
    logger.debug('repeating last video generation');
    const data = await this.repeatVideoGeneration();
    delete this.repeatVideoGeneration;
    return data;
  }

  async resolveStartFrame(streams, imageOptions) {
    let startFrame = this.lastEndFRame;

    if (!startFrame) {
      startFrame = await this.generateImage(streams, imageOptions);
      logger.payload('generated startFrame', startFrame);
    }

    return startFrame;
  }

  async prepareVideoGeneration({ startFrame, streams, options, fileName, useSingleImage, imageOptions }) {
    const result = await prepareVideoGeneration({
      startFrame,
      streams,
      options,
      fileName,
      useSingleImage,
      imageOptions,
      videoModelFirstLast: this.videoModelFirstLast,
      videoModelSingle: this.PostToWan22_5B_ImageVideo,
      generateImage: this.generateImage.bind(this),
    });

    if (result.lastEndFrame) {
      this.lastEndFRame = result.lastEndFrame;
    }

    return result;
  }

  buildVideoConfig(generatedPrompt, videoModel, startFrame, options) {
    return buildVideoConfig({
      config: this.config,
      addStaticPrompt: this.addStaticPrompt.bind(this),
      generatedPrompt,
      videoModel,
      startFrame,
      options,
    });
  }

  async generateVideoData(videoType, startFrame, mergedConfig, useSingleImage) {
    this.repeatVideoGeneration = createRepeatVideoGeneration({
      videoType,
      startFrame,
      mergedConfig,
      useSingleImage,
      setLastEndFrame: (frame) => {
        this.lastEndFRame = frame;
      },
    });

    const videoData = await this.repeatVideoGeneration();
    delete this.repeatVideoGeneration;
    return videoData;
  }

  async addMireloAudioAndUpload(fileName, startFrame, videoData, options) {
    return addMireloAudioAndUpload({
      mireloAI: this.mireloAI,
      imageDir: this.imageDir,
      fileName,
      startFrame,
      videoData,
      options,
    });
  }

  /**
   * Generate an image using the FLUX model.
   * @param {string} prompt
   * @param {object} [options]
   * @returns {Promise<string>} Path to saved image
   */
  async prompt(streams, options = {}) {
    const fileName = '' + Date.now();
    options.name = fileName;
    logger.debug('prompt imageDir:', this.imageDir);

    const useSingleImage = resolveUseSingleImage(options.useSingleImage);

    logger.debug('useSingleImage:', useSingleImage);

    // process.exit(1);
    try {
      if (this.repeatVideoGeneration) {
        return await this.runRepeatVideoGeneration();
      }

      const imageOptions = options.image;
      const startFrame = await this.resolveStartFrame(streams, imageOptions);

      const { videoType, videoModel, generatedPrompt } = await this.prepareVideoGeneration({
        startFrame,
        streams,
        options,
        fileName,
        useSingleImage,
        imageOptions,
      });

      // await new Promise(resolve => setTimeout(resolve, 10000));

      const mergedConfig = this.buildVideoConfig(
        generatedPrompt,
        videoModel,
        startFrame,
        options
      );

      const videoData = await this.generateVideoData(
        videoType,
        startFrame,
        mergedConfig,
        useSingleImage
      );

      return await this.addMireloAudioAndUpload(
        fileName,
        startFrame,
        videoData,
        options
      );
    } catch (error) {
      console.error('GenImgVideo', error);

      const retries = options._retryCount || 0;
      const maxRetries = (options.video && options.video.maxRetriesOnAbort) ?? 3;
      const retryDelayMs = (options.video && options.video.retryDelayMs) ?? 10000;

      if (isGpuAbort(error) && retries < maxRetries) {
        console.warn(`GenImgVideo: GPU task aborted. Retrying ${retries + 1}/${maxRetries} after ${retryDelayMs}ms`);
        await new Promise(res => setTimeout(res, retryDelayMs));
        return await this.prompt(streams, { ...options, _retryCount: retries + 1, });
      }

      return false;
    }

    return true;
  }
}

export default Generator;
