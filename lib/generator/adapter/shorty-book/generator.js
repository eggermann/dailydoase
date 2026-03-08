import fs from 'fs-extra';
import path from 'path';
import { execFileSync, execSync } from 'node:child_process';

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
import { concatMp4Lossless, normalizeVideoDurationSeconds, probeVideoDurationSeconds } from '../../ffmpeg-helpers.js';
import { createLogger } from '../../logger.js';
import { saveJSON } from '../../save-utils.js';

const logger = createLogger('shorty-book:generator', { envKeys: ['GENERATOR_DEBUG'] });
const TRUTHY_VALUES = new Set(['1', 'true', 'yes', 'on']);
const FALSY_VALUES = new Set(['0', 'false', 'no', 'off', '']);

const resolveUseSingleImage = (value, context = {}) => {
  if (typeof value === 'function') {
    return Boolean(value(context));
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (TRUTHY_VALUES.has(normalized)) return true;
    if (FALSY_VALUES.has(normalized)) return false;
  }
  if (typeof value === 'boolean') return value;
  return Boolean(value);
};

const shellQuote = (value) => `'${String(value).replace(/'/g, `'\\''`)}'`;

const captureWebcamStill = async ({ captureCmd, outPath }) => {
  const resolvedOut = path.resolve(outPath);
  await fs.ensureDir(path.dirname(resolvedOut));

  if (Array.isArray(captureCmd)) {
    const parts = captureCmd.map((part) => String(part).replaceAll('{out}', resolvedOut));
    const [bin, ...args] = parts;
    if (!bin) throw new Error('finalEndImage.captureCmd array must include a command name');
    execFileSync(bin, args, { stdio: 'inherit' });
  } else if (typeof captureCmd === 'string' && captureCmd.trim().length > 0) {
    const cmd = captureCmd.includes('{out}')
      ? captureCmd.replaceAll('{out}', shellQuote(resolvedOut))
      : `${captureCmd} ${shellQuote(resolvedOut)}`;
    execSync(cmd, { stdio: 'inherit', shell: true });
  } else {
    throw new Error('finalEndImage.captureCmd must be a non-empty string or an array');
  }

  const exists = await fs.pathExists(resolvedOut);
  if (!exists) {
    throw new Error(`Webcam capture did not produce output file: ${resolvedOut}`);
  }
  return resolvedOut;
};

const resolveCapturedEndFrameOverride = async ({ imageDir, imageOptions = {}, endImageConfig = {} }) => {
  if (!endImageConfig) {
    return null;
  }

  if (typeof endImageConfig.captureFn === 'function') {
    const capturedPath = await endImageConfig.captureFn();
    if (capturedPath) {
      return {
        path: path.resolve(String(capturedPath)),
        prompt: endImageConfig.promptSource ?? '',
      };
    }
  }

  if (endImageConfig.captureCmd) {
    const ext = endImageConfig.ext || imageOptions.ext || '.jpg';
    const outPath = path.join(
      imageDir,
      'parts',
      'input-img',
      `${Date.now()}-${endImageConfig.filePrefix || 'webcam-end'}${ext.startsWith('.') ? ext : `.${ext}`}`
    );
    const capturedPath = await captureWebcamStill({ captureCmd: endImageConfig.captureCmd, outPath });
    return { path: capturedPath, prompt: endImageConfig.promptSource ?? '' };
  }

  if (typeof endImageConfig.imagePath === 'string' && endImageConfig.imagePath.trim().length > 0) {
    const resolvedPath = path.resolve(endImageConfig.imagePath);
    if (await fs.pathExists(resolvedPath)) {
      return { path: resolvedPath, prompt: endImageConfig.promptSource ?? '' };
    }
    logger.warn('configured end image path not found, falling back to generateImage:', resolvedPath);
  }

  return null;
};

const resolveSceneCount = async (sceneLoop, streams, options) => {
  const plannedCount = Array.isArray(sceneLoop?.scenePlan) ? sceneLoop.scenePlan.length : 0;
  if (plannedCount > 0) {
    return Math.max(2, plannedCount);
  }

  const rawCount = typeof sceneLoop?.sceneCount === 'function'
    ? await sceneLoop.sceneCount(streams, options)
    : sceneLoop?.sceneCount;

  const count = Number(rawCount || 2);
  return Math.max(2, count);
};

const getScenePlanEntry = (sceneLoop = {}, sceneContext = {}) => {
  const scenePlan = sceneLoop?.scenePlan;
  const index = Number(sceneContext?.index || 0);
  if (!Array.isArray(scenePlan) || index < 1) {
    return null;
  }
  return scenePlan[index - 1] || null;
};

const getVideoModelLabel = (videoModel, fallbackLabel) => (
  videoModel?.config?.model
  || videoModel?.config?.space
  || videoModel?.config?.folderName
  || fallbackLabel
);

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
    this.videoModelFirstLastFallbacks = [];
    this.videoModel2 = null;
    this.videoModelSingleFallbacks = [];
    this.flux = null;
  }

  async init() {
    await this.checkSignature();

    const {
      mireloAI,
      videoModelFirstLast,
      videoModelFirstLastFallbacks,
      videoModelSingle,
      videoModelSingleFallbacks,
      flux,
    } = await initModels({
      config: this.config,
      imageDir: this.imageDir,
    });

    this.mireloAI = mireloAI;
    this.videoModelFirstLast = videoModelFirstLast;
    this.videoModelFirstLastFallbacks = videoModelFirstLastFallbacks || [];
    this.PostToWan22_5B_ImageVideo = videoModelSingle;
    this.videoModelSingleFallbacks = videoModelSingleFallbacks || [];
    this.flux = flux;

    // await store.initCache(this.imageDir);
    return this;
  }

  async generateImage(streams, options, promptSource = null) {
    const prompt = await buildImagePrompt(streams, options, promptSource);
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

  async resolveStartFrame(streams, imageOptions, openingImageOptions = null, sceneContext = null) {
    let startFrame = this.lastEndFRame;

    if (!startFrame) {
      const openingImagePath = openingImageOptions?.imagePath;
      if (typeof openingImagePath === 'string' && openingImagePath.trim().length > 0) {
        const resolvedPath = path.resolve(openingImagePath);
        if (await fs.pathExists(resolvedPath)) {
          startFrame = {
            image: { path: resolvedPath },
            json: {
              metadata: {
                prompt: openingImageOptions?.promptSource ?? '',
              },
            },
          };
          logger.payload('using openingImage.imagePath as startFrame', startFrame);
          return startFrame;
        }
        logger.warn('openingImage.imagePath not found, falling back to generateImage:', resolvedPath);
      }

      const resolvedImageOptions = openingImageOptions
        ? { ...imageOptions, ...openingImageOptions, sceneContext, frameRole: 'opening' }
        : { ...imageOptions, sceneContext, frameRole: 'opening' };
      startFrame = await this.generateImage(
        streams,
        resolvedImageOptions,
        openingImageOptions?.promptSource ?? null
      );
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
      videoModelFirstLastFallbacks: this.videoModelFirstLastFallbacks,
      videoModelSingle: this.PostToWan22_5B_ImageVideo,
      videoModelSingleFallbacks: this.videoModelSingleFallbacks,
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

  async generateVideoData(videoType, startFrame, mergedConfig, useSingleImage, videoRunOptions = {}) {
    const videoCandidates = Array.isArray(videoRunOptions.videoTypeCandidates) && videoRunOptions.videoTypeCandidates.length > 0
      ? videoRunOptions.videoTypeCandidates
      : [videoType];
    let lastError = null;

    for (let index = 0; index < videoCandidates.length; index += 1) {
      const activeVideoType = videoCandidates[index];
      try {
        this.repeatVideoGeneration = createRepeatVideoGeneration({
          videoType: activeVideoType,
          startFrame,
          mergedConfig,
          useSingleImage,
          captureLastFrame: videoRunOptions.captureLastFrame,
          endFramePrompt: videoRunOptions.endFramePrompt,
          setLastEndFrame: (frame) => {
            this.lastEndFRame = frame;
          },
        });

        const videoData = await this.repeatVideoGeneration();
        delete this.repeatVideoGeneration;
        return videoData;
      } catch (error) {
        delete this.repeatVideoGeneration;
        lastError = error;
        const hasMoreFallbacks = index < videoCandidates.length - 1;
        if (!hasMoreFallbacks) {
          throw error;
        }
        const fallbackLabel = getVideoModelLabel(activeVideoType, `candidate-${index + 1}`);
        const nextLabel = getVideoModelLabel(videoCandidates[index + 1], `candidate-${index + 2}`);
        logger.warn(`Video model failed (${fallbackLabel}). Retrying with fallback ${nextLabel}: ${error?.message || error}`);
      }
    }

    throw lastError || new Error('Video generation failed for all model candidates.');
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

  async generateSceneClip({
    startFrame,
    streams,
    options,
    fileName,
    useSingleImage,
    imageOptions,
    captureLastFrame = !useSingleImage,
    endFrameOverride = null,
  }) {
    const clipOptions = {
      ...options,
      name: fileName,
      image: imageOptions,
      mireloAI: { ...(options.mireloAI || {}) },
    };
    if (endFrameOverride?.path) {
      clipOptions.endImageStream = endFrameOverride.path;
      clipOptions.endFramePrompt = endFrameOverride.prompt || '';
    }

    const { videoType, videoTypeCandidates, videoModel, generatedPrompt } = await this.prepareVideoGeneration({
      startFrame,
      streams,
      options: clipOptions,
      fileName,
      useSingleImage,
      imageOptions,
    });

    const mergedConfig = this.buildVideoConfig(
      generatedPrompt,
      videoModel,
      startFrame,
      clipOptions
    );

    const videoData = await this.generateVideoData(
      videoType,
      startFrame,
      mergedConfig,
      useSingleImage,
      {
        videoTypeCandidates,
        captureLastFrame,
        endFramePrompt: generatedPrompt || mergedConfig.prompt || startFrame.json?.metadata?.prompt,
      }
    );

    const requestedDuration = Number(clipOptions?.sceneContext?.durationSeconds);
    if (videoData?.file && Number.isFinite(requestedDuration) && requestedDuration > 0) {
      await normalizeVideoDurationSeconds(videoData.file, requestedDuration, {
        targetFps: Number(mergedConfig.frames_per_second) || Number(mergedConfig.fps) || 24,
      });
    }

    return { generatedPrompt, mergedConfig, videoData };
  }

  async promptSceneLoop(streams, options, fileName) {
    const sceneLoop = options.sceneLoop || {};
    const clipCount = await resolveSceneCount(sceneLoop, streams, options);
    const imageOptions = options.image;
    const independentSceneStarts = sceneLoop.independentSceneStarts === true;
    const promptDir = path.join(this.imageDir, 'parts', 'scene-prompts');
    await fs.ensureDir(promptDir);
    let startFrame = await this.resolveStartFrame(
      streams,
      imageOptions,
      sceneLoop.openingImage,
      {
        index: 1,
        total: clipCount,
        isFirst: true,
        isLast: clipCount === 1,
      }
    );
    const clipResults = [];

    for (let index = 0; index < clipCount; index += 1) {
      const isFirstClip = index === 0;
      const isLastClip = index === clipCount - 1;
      const openingImageSourceType = typeof sceneLoop.openingImage?.sourceType === 'string'
        ? sceneLoop.openingImage.sourceType.trim()
        : '';
      const sceneContext = {
        index: index + 1,
        total: clipCount,
        isFirst: isFirstClip,
        isLast: isLastClip,
      };
      const scenePlanEntry = getScenePlanEntry(sceneLoop, sceneContext);
      sceneContext.durationSeconds = Number(scenePlanEntry?.durationSeconds) || null;
      sceneContext.frameSource = isFirstClip && openingImageSourceType
        ? openingImageSourceType
        : (scenePlanEntry?.frameSource || (isFirstClip ? 'newImage' : 'lastFrame'));
      const sceneFrameSource = scenePlanEntry?.frameSource;
      const useFreshImage = !isFirstClip && (
        independentSceneStarts
        || scenePlanEntry?.freshImage === true
        || sceneFrameSource === 'newImage'
      );
      if (useFreshImage) {
        startFrame = await this.generateImage(streams, {
          ...imageOptions,
          sceneContext,
          frameRole: 'start',
        });
      }
      const useSingleImageConfig = isFirstClip
        ? sceneLoop.firstClipUseSingleImage
        : sceneLoop.subsequentClipsUseSingleImage;
      const configuredSingleImage = resolveUseSingleImage(useSingleImageConfig, {
        sceneContext,
        scenePlanEntry,
        index: sceneContext.index,
        total: sceneContext.total,
        isFirst: sceneContext.isFirst,
        isLast: sceneContext.isLast,
        startFrame,
        streams,
        options,
      });
      const useSingleImage = scenePlanEntry?.videoMode === 'firstLast'
        ? false
        : scenePlanEntry?.videoMode === 'singleImage'
          ? true
          : configuredSingleImage;
      const clipFileName = `${fileName}-scene-${String(index + 1).padStart(2, '0')}`;

      let endFrameOverride = null;
      const shouldCaptureLiveEndImage = !useSingleImage && !isFirstClip && sceneLoop.liveEndImage;
      if (shouldCaptureLiveEndImage) {
        endFrameOverride = await resolveCapturedEndFrameOverride({
          imageDir: this.imageDir,
          imageOptions,
          endImageConfig: {
            ...sceneLoop.liveEndImage,
            filePrefix: `webcam-scene-${String(index + 1).padStart(2, '0')}-end`,
          },
        });
      }

      if (!useSingleImage && isLastClip && sceneLoop.finalEndImage) {
        endFrameOverride = await resolveCapturedEndFrameOverride({
          imageDir: this.imageDir,
          imageOptions,
          endImageConfig: {
            ...sceneLoop.finalEndImage,
            filePrefix: 'webcam-final-end',
          },
        });

        if (!endFrameOverride) {
          const finalEndImage = sceneLoop.finalEndImage || {};
          const resolvedFinalEndOptions = {
            ...imageOptions,
            ...finalEndImage,
            name: `${clipFileName}-final-end`,
            sceneContext,
            frameRole: 'final-end',
          };
          const finalEndFrame = await this.generateImage(
            streams,
            resolvedFinalEndOptions,
            finalEndImage.promptSource ?? null
          );
          endFrameOverride = {
            path: finalEndFrame?.image?.path,
            prompt: finalEndFrame?.json?.metadata?.prompt || finalEndFrame?.json?.prompt || '',
          };
        }
      }

      const clipResult = await this.generateSceneClip({
        startFrame,
        streams,
        options: {
          ...options,
          sceneContext,
        },
        fileName: clipFileName,
        useSingleImage,
        imageOptions,
        captureLastFrame: sceneLoop.captureLastFrame !== false,
        endFrameOverride,
      });

      clipResults.push({
        index,
        sceneContext,
        scenePlanEntry,
        startFrame,
        useSingleImage,
        ...clipResult,
      });

      await saveJSON(
        path.join(promptDir, `${String(index + 1).padStart(2, '0')}-scene-prompt.json`),
        {
          sceneIndex: index + 1,
          sceneTitle: scenePlanEntry?.title || '',
          durationSeconds: sceneContext.durationSeconds,
          frameSource: scenePlanEntry?.frameSource || '',
          videoMode: useSingleImage ? 'singleImage' : 'firstLast',
          prompt: clipResult.generatedPrompt || clipResult.mergedConfig?.prompt || '',
          startFramePath: startFrame?.image?.path || '',
          videoFile: clipResult.videoData?.file || '',
        }
      );

      if (!useFreshImage && this.lastEndFRame) {
        startFrame = this.lastEndFRame;
      }
    }

    const clipPaths = clipResults
      .map((clip) => clip.videoData?.file)
      .filter(Boolean);

    if (clipPaths.length === 0) {
      throw new Error('Scene loop did not generate any video clips.');
    }

    const mergedOutDir = path.join(this.imageDir, 'merged');
    await fs.ensureDir(mergedOutDir);

    const concatenatedVideoPath = clipPaths.length === 1
      ? clipPaths[0]
      : await concatMp4Lossless(
        clipPaths,
        path.join(mergedOutDir, `${fileName}-concat.mp4`),
        mergedOutDir
      );

    const totalTrackDuration = await probeVideoDurationSeconds(concatenatedVideoPath);
    const mireloPrompt = clipResults
      .map((clip) => clip.generatedPrompt)
      .filter(Boolean)
      .join('\n\n')
      || startFrame.json?.metadata?.prompt;

    const sceneLoopSummary = {
      sceneCount: clipCount,
      totalTrackDuration,
      concatenatedVideoPath,
      clips: clipResults.map((clip) => ({
        index: clip.index,
        title: clip.scenePlanEntry?.title || '',
        durationSeconds: clip.sceneContext?.durationSeconds || null,
        file: clip.videoData?.file,
        prompt: clip.generatedPrompt,
        useSingleImage: clip.useSingleImage,
      })),
    };

    const summaryPath = await saveJSON(
      path.join(this.imageDir, `${fileName}-scene-loop.json`),
      sceneLoopSummary
    );

    return await addMireloAudioAndUpload({
      mireloAI: this.mireloAI,
      imageDir: this.imageDir,
      fileName,
      startFrame: clipResults[0].startFrame,
      videoData: clipResults[clipResults.length - 1].videoData,
      videoInput: concatenatedVideoPath,
      mireloPrompt,
      extraMetadata: {
        ...sceneLoopSummary,
        summaryPath: summaryPath.path,
      },
      options: {
        ...options,
        mireloAI: {
          ...(options.mireloAI || {}),
          duration: totalTrackDuration,
        },
      },
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

      if (options.sceneLoop?.enabled) {
        return await this.promptSceneLoop(streams, options, fileName);
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
      console.error('GenImgVideo:', error?.message || error);

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
