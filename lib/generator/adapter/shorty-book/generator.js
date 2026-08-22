import fs from 'fs-extra';
import path from 'path';
import { execFileSync, execSync } from 'node:child_process';

import PostTo from '../../PostTo.js';

import { buildImagePrompt, mergeImageConfig } from './image-utils.js';
import { initModels } from './init-models.js';
import { buildCameraGroundedPrompt } from '../helpers/freshweb-vision-prompt.js';
import {
  buildVideoConfig,
  createRepeatVideoGeneration,
  prepareVideoGeneration,
} from './video-utils.js';
import { normalizeDriftCorrectionLevel } from './drift-correction.js';
import { normalizeOpeningStartMode } from './opening-start.js';
import { addMireloAudioAndUpload } from './mirelo-utils.js';
import { isGpuAbort } from './retry-utils.js';
import {
  concatMp4Lossless,
  extractLastFrame,
  forceVideoEndImage,
  normalizeVideoOutput,
  probeVideoDurationSeconds,
} from '../../ffmpeg-helpers.js';
import { createLogger } from '../../logger.js';
import { saveJSON } from '../../save-utils.js';
import { applySceneBoundaryTransport } from './scene-boundary-transport.js';

const logger = createLogger('shorty-book:generator', { envKeys: ['GENERATOR_DEBUG'] });
const TRUTHY_VALUES = new Set(['1', 'true', 'yes', 'on']);
const FALSY_VALUES = new Set(['0', 'false', 'no', 'off', '']);
const DEFAULT_CONTEXT_SCREENSHOT_BUFFER_SIZE = 10;
const PUBLIC_WAN_FIRST_LAST_MAX_DURATION_SECONDS = 5.1;

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

const resolvePositiveInt = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
};

const resolvePositiveMs = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const isFluxContextModel = (value) => String(value || '').toLowerCase().includes('kontext');

const shellQuote = (value) => `'${String(value).replace(/'/g, `'\\''`)}'`;

const normalizeIdentityClause = (value, fallback = '') => {
  const text = String(value || '').trim();
  if (!text) {
    return fallback;
  }

  return /[.!?]$/.test(text) ? text : `${text}.`;
};

const buildPersonaReferenceIdentityClauseFromConfig = (openingImageConfig = {}) => {
  const personaReferenceDescription = String(
    openingImageConfig?.personaReferenceDescription
    || ''
  ).trim();
  const personaReferenceStrength = Number(openingImageConfig?.personaReferenceStrength) || 0;
  const personaReferenceVisionText = String(
    openingImageConfig?.personaReferenceVisionText
    || ''
  ).trim();

  if (personaReferenceDescription) {
    const identityLock = personaReferenceStrength > 0
      ? `Keep the exact same real person as the saved webcam anchor image. Match this detected person exactly: ${personaReferenceDescription}`
      : `Keep the exact same real person as the saved webcam anchor image: ${personaReferenceDescription}`;
    return normalizeIdentityClause(identityLock);
  }

  if (personaReferenceVisionText) {
    return normalizeIdentityClause(
      `Keep the exact same real person as the saved webcam anchor image. Identity anchor from local vision: ${personaReferenceVisionText}`
    );
  }

  return '';
};

const markPersonaReferenceCaptureTimestampOnContext = (context, timestamp = Date.now()) => {
  const resolvedTimestamp = Number(timestamp) || Date.now();
  if (context && typeof context.markPersonaReferenceCaptureTimestamp === 'function') {
    return context.markPersonaReferenceCaptureTimestamp(resolvedTimestamp);
  }
  if (context && typeof context === 'object') {
    context.lastPersonaReferenceCaptureAt = resolvedTimestamp;
  }
  return resolvedTimestamp;
};

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

const resolveCapturedImageOverride = async ({
  imageDir,
  imageOptions = {},
  captureConfig = {},
  defaultFilePrefix = 'captured-image',
} = {}) => {
  if (!captureConfig) {
    return null;
  }

  if (typeof captureConfig.captureFn === 'function') {
    const captureResult = await captureConfig.captureFn();
    if (captureResult && typeof captureResult === 'object') {
      const capturedPath = String(captureResult.path || captureResult.imagePath || '').trim();
      if (capturedPath) {
        return {
          path: path.resolve(capturedPath),
          prompt: captureResult.prompt ?? captureConfig.promptSource ?? '',
          metadata: captureResult.metadata && typeof captureResult.metadata === 'object'
            ? captureResult.metadata
            : {
                personDescription: String(captureResult.personDescription || '').trim(),
                personStrength: Number(captureResult.personStrength) || 0,
                provider: String(captureResult.provider || '').trim(),
                visionText: String(captureResult.visionText || '').trim(),
              },
        };
      }
    }
    if (captureResult) {
      return {
        path: path.resolve(String(captureResult)),
        prompt: captureConfig.promptSource ?? '',
      };
    }
  }

  if (captureConfig.captureCmd) {
    const ext = captureConfig.ext || imageOptions.ext || '.jpg';
    const outPath = path.join(
      imageDir,
      'parts',
      'input-img',
      `${Date.now()}-${captureConfig.filePrefix || defaultFilePrefix}${ext.startsWith('.') ? ext : `.${ext}`}`
    );
    const capturedPath = await captureWebcamStill({ captureCmd: captureConfig.captureCmd, outPath });
    return { path: capturedPath, prompt: captureConfig.promptSource ?? '' };
  }

  if (typeof captureConfig.imagePath === 'string' && captureConfig.imagePath.trim().length > 0) {
    const resolvedPath = path.resolve(captureConfig.imagePath);
    if (await fs.pathExists(resolvedPath)) {
      return { path: resolvedPath, prompt: captureConfig.promptSource ?? '' };
    }
    logger.warn('configured captured image path not found, falling back to default behavior:', resolvedPath);
  }

  return null;
};

const resolveCapturedEndFrameOverride = async ({ imageDir, imageOptions = {}, endImageConfig = {} }) => resolveCapturedImageOverride({
  imageDir,
  imageOptions,
  captureConfig: endImageConfig,
  defaultFilePrefix: 'webcam-end',
});

export const resolveSceneCount = async (sceneLoop, streams, options) => {
  const plannedCount = Array.isArray(sceneLoop?.scenePlan) ? sceneLoop.scenePlan.length : 0;
  if (plannedCount > 0) {
    return Math.max(1, plannedCount);
  }

  const rawCount = typeof sceneLoop?.sceneCount === 'function'
    ? await sceneLoop.sceneCount(streams, options)
    : sceneLoop?.sceneCount;

  const count = Number(rawCount || 2);
  return Math.max(1, count);
};

export const resolveIterationStartDecision = ({
  sceneLoop = {},
  hasPreviousLastFrame = false,
} = {}) => {
  const configuredMode = String(sceneLoop.iterationStartMode || '').trim().toLowerCase();
  const firstScene = Array.isArray(sceneLoop.scenePlan) ? sceneLoop.scenePlan[0] || {} : {};

  if (!hasPreviousLastFrame) {
    return {
      mode: 'cameraReset',
      startFromPreviousLastFrame: false,
      reason: 'no previous film frame exists',
    };
  }

  if (configuredMode === 'storydriven') {
    if (firstScene.frameSource === 'lastFrame' && firstScene.videoMode === 'firstLast') {
      return {
        mode: 'firstLast',
        startFromPreviousLastFrame: true,
        reason: 'GPT planned a transition from the previous film toward current camera context',
      };
    }
    if (firstScene.frameSource === 'lastFrame') {
      return {
        mode: 'continue',
        startFromPreviousLastFrame: true,
        reason: 'GPT planned direct continuation from the previous film',
      };
    }
    return {
      mode: 'cameraReset',
      startFromPreviousLastFrame: false,
      reason: 'GPT planned a fresh current-camera opening',
    };
  }

  const configuredChain = sceneLoop.chainFromPreviousLoopLastFrame !== false;
  return {
    mode: configuredChain ? 'continue' : 'cameraReset',
    startFromPreviousLastFrame: configuredChain,
    reason: configuredChain
      ? 'legacy chainFromPreviousLoopLastFrame is enabled'
      : 'legacy chainFromPreviousLoopLastFrame is disabled',
  };
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

const getVideoModelKey = (videoModel, fallbackLabel) => [
  String(videoModel?.config?.type || '').trim(),
  String(videoModel?.config?.model || '').trim(),
  String(videoModel?.config?.space || '').trim(),
  String(videoModel?.config?.selfHostedHugginfaceSpace || '').trim(),
  String(videoModel?.config?.folderName || fallbackLabel || '').trim(),
].join('|');

const dedupeVideoCandidates = (videoCandidates = []) => {
  const uniqueCandidates = [];
  const seenKeys = new Set();

  for (let index = 0; index < videoCandidates.length; index += 1) {
    const candidate = videoCandidates[index];
    if (!candidate) {
      continue;
    }
    const key = getVideoModelKey(candidate, `candidate-${index + 1}`);
    if (seenKeys.has(key)) {
      continue;
    }
    seenKeys.add(key);
    uniqueCandidates.push(candidate);
  }

  return uniqueCandidates;
};

const sortEntriesByMtimeDesc = async (dirPath, matcher = () => true) => {
  if (!dirPath || !(await fs.pathExists(dirPath))) {
    return [];
  }

  const entries = await fs.readdir(dirPath);
  const stats = await Promise.all(entries.map(async (entry) => {
    const entryPath = path.join(dirPath, entry);
    try {
      const stat = await fs.stat(entryPath);
      if (!stat.isFile() || !matcher(entry, entryPath)) {
        return null;
      }
      return {
        name: entry,
        path: entryPath,
        mtimeMs: stat.mtimeMs,
      };
    } catch {
      return null;
    }
  }));

  return stats.filter(Boolean).sort((a, b) => b.mtimeMs - a.mtimeMs);
};

const readJsonIfExists = async (filePath) => {
  if (!filePath || !(await fs.pathExists(filePath))) {
    return null;
  }

  try {
    return await fs.readJson(filePath);
  } catch {
    return null;
  }
};

const findPromptForLastFrame = async ({ imageDir, lastFramePath }) => {
  const normalizedLastFramePath = path.resolve(String(lastFramePath || ''));
  if (!normalizedLastFramePath) {
    return '';
  }

  const rootEntries = await sortEntriesByMtimeDesc(
    imageDir,
    (name) => /^\d+.*-scene-loop\.json$/i.test(name)
  );

  for (const entry of rootEntries) {
    const summary = await readJsonIfExists(entry.path);
    const clips = Array.isArray(summary?.clips) ? summary.clips : [];
    const match = clips
      .slice()
      .reverse()
      .find((clip) => {
        const videoFile = clip?.file ? path.resolve(String(clip.file)) : '';
        if (!videoFile) {
          return false;
        }
        const expectedLastFramePath = path.resolve(
          videoFile.replace(/\.mp4$/i, '-last-frame.png')
        );
        return expectedLastFramePath === normalizedLastFramePath;
      });
    if (match?.prompt) {
      return String(match.prompt).trim();
    }
  }

  const promptDir = path.join(imageDir, 'parts', 'scene-prompts');
  const promptEntries = await sortEntriesByMtimeDesc(
    promptDir,
    (name) => /^\d+-scene-prompt\.json$/i.test(name)
  );

  for (const entry of promptEntries) {
    const promptData = await readJsonIfExists(entry.path);
    const videoFile = promptData?.videoFile ? path.resolve(String(promptData.videoFile)) : '';
    if (!videoFile) {
      continue;
    }
    const expectedLastFramePath = path.resolve(
      videoFile.replace(/\.mp4$/i, '-last-frame.png')
    );
    if (expectedLastFramePath === normalizedLastFramePath) {
      return String(promptData?.prompt || '').trim();
    }
  }

  return '';
};

export const restorePreviousMovieLastFrame = async ({ imageDir } = {}) => {
  const partsDir = path.join(String(imageDir || ''), 'parts');
  const lastFrameEntries = await sortEntriesByMtimeDesc(
    partsDir,
    (name) => /-last-frame\.(png|jpg|jpeg|webp)$/i.test(name)
  );
  const latestLastFrame = lastFrameEntries[0];

  if (!latestLastFrame) {
    return null;
  }

  const prompt = await findPromptForLastFrame({
    imageDir,
    lastFramePath: latestLastFrame.path,
  });

  return {
    image: { path: latestLastFrame.path },
    json: {
      metadata: {
        prompt,
      },
    },
  };
};

export const resolveRequestedDurationOption = async (value, fallback = null) => {
  const resolved = typeof value === 'function'
    ? Number(await value())
    : Number(value);

  if (Number.isFinite(resolved) && resolved > 0) {
    return resolved;
  }

  const fallbackNumber = Number(fallback);
  return Number.isFinite(fallbackNumber) && fallbackNumber > 0 ? fallbackNumber : null;
};

export const capVideoDurationForBackend = (durationSeconds, {
  useSingleImage = false,
  videoType = null,
} = {}) => {
  const duration = Number(durationSeconds);
  if (!Number.isFinite(duration) || duration <= 0 || useSingleImage) {
    return durationSeconds;
  }

  const isPublicWanFirstLast = videoType?.runtime?.selfHostedHugginfaceModel === false
    && /wan/i.test(String(videoType?.config?.folderName || 'wan22FirstLast'));
  if (!isPublicWanFirstLast) {
    return durationSeconds;
  }

  return Math.min(duration, PUBLIC_WAN_FIRST_LAST_MAX_DURATION_SECONDS);
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
    this.videoModelFirstLastFallbacks = [];
    this.videoModel2 = null;
    this.videoModelSingleFallbacks = [];
    this.flux = null;
    this.personaReferenceImageModel = null;
    this.castContextImageModel = null;
    this.openingFluxContextModel = null;
    this.driftCorrectionModel = null;
    this.contextScreenshotBuffer = [];
    this.personaReferenceCapturePromise = null;
    this.pendingPersonaReferencePath = '';
    this.lastPersonaReferenceCaptureAt = 0;
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
      personaReferenceImageModel,
      castContextImageModel,
      openingFluxContextModel,
      driftCorrectionModel,
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
    this.personaReferenceImageModel = personaReferenceImageModel;
    this.castContextImageModel = castContextImageModel;
    this.openingFluxContextModel = openingFluxContextModel;
    this.driftCorrectionModel = driftCorrectionModel;

    // await store.initCache(this.imageDir);
    return this;
  }

  async generateImage(streams, options, promptSource = null) {
    const resolvedOptions = this.buildPersonaReferenceImageOptions(options);
    const prompt = await buildImagePrompt(streams, resolvedOptions, promptSource);
    const personaReferenceIdentityClause = buildPersonaReferenceIdentityClauseFromConfig(
      this.getOpeningImageConfig()
    );
    const effectivePrompt = [
      personaReferenceIdentityClause,
      prompt,
    ].filter(Boolean).join(' ');
    const mergedConfig = mergeImageConfig(this.config, resolvedOptions);
    const imageModel = this.shouldUsePersonaReferenceImageModel(resolvedOptions)
      ? this.personaReferenceImageModel
      : this.flux;

    return imageModel.prompt(
      this.addStaticPrompt(effectivePrompt, options.staticPrompt),
      mergedConfig
    );
  }

  async runRepeatVideoGeneration() {
    logger.debug('repeating last video generation');
    const data = await this.repeatVideoGeneration();
    delete this.repeatVideoGeneration;
    return data;
  }

  async runRepeatPromptGeneration() {
    logger.debug('resuming failed prompt generation');
    return await this.repeatPromptGeneration();
  }

  getDriftCorrectionConfig() {
    return this.config?.driftCorrection || {};
  }

  getContextBufferConfig() {
    const driftCorrection = this.getDriftCorrectionConfig();
    const configured = driftCorrection?.contextBuffer || {};
    const enabledByModel = isFluxContextModel(driftCorrection?.model?.model);
    const enabled = configured?.enabled ?? enabledByModel;
    return {
      enabled: Boolean(enabled),
      size: resolvePositiveInt(configured?.size, DEFAULT_CONTEXT_SCREENSHOT_BUFFER_SIZE),
      columns: resolvePositiveInt(configured?.columns, 4),
      rows: resolvePositiveInt(configured?.rows, 2),
      captureBeforeEachCall: configured?.captureBeforeEachCall !== false,
      includeReferenceImage: configured?.includeReferenceImage !== false,
      name: String(configured?.name || 'flux-context-board'),
    };
  }

  getOpeningImageConfig() {
    return this.config?.sceneLoop?.openingImage || {};
  }

  getSceneContextImageConfig() {
    return this.config?.sceneLoop?.sceneContextImage || {};
  }

  getCastContextConfig() {
    return this.config?.sceneLoop?.castContext || {};
  }

  async generateCastContextFrame({
    startFrame,
    scenePlanEntry = {},
    sceneContext = {},
    imageOptions = {},
  } = {}) {
    const castContextConfig = this.getCastContextConfig();
    if (castContextConfig?.enabled !== true || !this.castContextImageModel) {
      return null;
    }

    const startImagePath = String(startFrame?.image?.path || '').trim();
    if (!startImagePath || !(await fs.pathExists(startImagePath))) {
      return null;
    }

    const castReferences = Array.isArray(scenePlanEntry?.castReferences)
      ? scenePlanEntry.castReferences
      : [];
    const referencePaths = [...new Set(castReferences
      .map((entry) => String(entry?.referenceImage || '').trim())
      .filter(Boolean)
      .filter((entry) => path.resolve(entry) !== path.resolve(startImagePath)))];
    const existingReferencePaths = [];
    for (const referencePath of referencePaths) {
      if (await fs.pathExists(referencePath)) {
        existingReferencePaths.push(referencePath);
      }
    }
    if (existingReferencePaths.length === 0) {
      return null;
    }

    const castLabels = castReferences
      .map((entry) => [entry.personaId, entry.description, entry.lastStoryState]
        .filter(Boolean)
        .join(': '))
      .filter(Boolean);
    const timeoutMs = resolvePositiveInt(castContextConfig?.timeoutMs, 120000);
    const prompt = [
      'Create one coherent next-scene image in the planned surveillance-camera viewpoint from the current room frame and selected cast-memory frames.',
      'Use memory frames as optional people, traces, doubles, transformations, or echoes; never make a collage, split screen, thumbnails, or picture-in-picture.',
      scenePlanEntry?.castUse ? `Cast use: ${scenePlanEntry.castUse}` : '',
      castLabels.length > 0 ? `Selected cast: ${castLabels.join('; ')}` : '',
      scenePlanEntry?.stillPrompt || scenePlanEntry?.imageDescription || scenePlanEntry?.beat || '',
    ].filter(Boolean).join(' ');
    logger.info(`cast context start: scene ${sceneContext?.index || 0}, references=${existingReferencePaths.length}, timeout=${timeoutMs}ms`);
    try {
      const contextFrame = await this.castContextImageModel.prompt(prompt, {
        ...imageOptions,
        ...(castContextConfig?.model || {}),
        imagePath: startImagePath,
        images: existingReferencePaths.map((referenceImage) => ({ path: referenceImage })),
        contextReference: { enabled: true },
        prompt,
        sceneContext,
        frameRole: 'cast-context',
        runwareTimeoutMs: timeoutMs,
      });
      logger.payload('generated cast context frame', {
        scene: sceneContext?.index || 0,
        castSelection: scenePlanEntry?.castSelection || [],
        inputImage: startImagePath,
        referenceImages: existingReferencePaths,
        outputImage: contextFrame?.image?.path || '',
      });
      return contextFrame;
    } catch (error) {
      logger.warn(`cast context skipped: scene ${sceneContext?.index || 0}, ${error?.message || error}`);
      return null;
    }
  }

  getAsyncPersonaReferenceConfig() {
    return this.getOpeningImageConfig()?.asyncPersonaReference || {};
  }

  markPersonaReferenceCaptureTimestamp(timestamp = Date.now()) {
    this.lastPersonaReferenceCaptureAt = Number(timestamp) || Date.now();
    return this.lastPersonaReferenceCaptureAt;
  }

  updateOpeningPersonaReferencePath(nextPath = '', metadata = null) {
    const resolvedPath = String(nextPath || '').trim();
    if (!resolvedPath) {
      return '';
    }

    this.config.sceneLoop = this.config.sceneLoop || {};
    this.config.sceneLoop.openingImage = {
      ...(this.config.sceneLoop.openingImage || {}),
      personaReferencePath: resolvedPath,
      referenceImagePath: resolvedPath,
      ...(metadata && typeof metadata === 'object'
        ? {
            personaReferenceDescription: String(metadata.personDescription || '').trim(),
            personaReferenceStrength: Number(metadata.personStrength) || 0,
            personaReferenceProvider: String(metadata.provider || '').trim(),
            personaReferenceVisionText: String(metadata.visionText || '').trim(),
          }
        : {}),
    };
    return resolvedPath;
  }

  async persistCapturedPersonaReferenceImage(capturedPath, sceneContext = null, metadata = null) {
    const resolvedCapturedPath = String(capturedPath || '').trim();
    if (!resolvedCapturedPath) {
      return { path: '', metadata: null };
    }

    const resolvedSourcePath = path.resolve(resolvedCapturedPath);
    const ext = path.extname(resolvedSourcePath) || '.jpg';
    const sceneSuffix = Number(sceneContext?.index) > 0
      ? `scene-${String(sceneContext.index).padStart(2, '0')}`
      : 'async';
    const targetDir = path.join(this.imageDir, 'parts');
    const targetPath = path.join(targetDir, `${Date.now()}-persona-reference-${sceneSuffix}${ext}`);

    await fs.ensureDir(targetDir);
    if (resolvedSourcePath !== targetPath) {
      await fs.copy(resolvedSourcePath, targetPath, { overwrite: true });
    }
    const normalizedMetadata = metadata && typeof metadata === 'object'
      ? {
          personDescription: String(metadata.personDescription || '').trim(),
          personStrength: Number(metadata.personStrength) || 0,
          provider: String(metadata.provider || '').trim(),
          visionText: String(metadata.visionText || '').trim(),
        }
      : null;
    if (normalizedMetadata) {
      await saveJSON(targetPath, {
        kind: 'persona-reference',
        ...normalizedMetadata,
        sourcePath: resolvedSourcePath,
        sceneIndex: Number(sceneContext?.index) || null,
      });
    }
    return {
      path: targetPath,
      metadata: normalizedMetadata,
    };
  }

  async refreshPersonaReferenceFromCameraShot(capturedPath, sceneContext = null, metadata = null) {
    const openingImageConfig = this.getOpeningImageConfig();
    if (openingImageConfig?.usePersonaReferenceForFreshImages !== true) {
      return '';
    }

    const savedReference = await this.persistCapturedPersonaReferenceImage(
      capturedPath,
      sceneContext,
      metadata
    );
    const nextReferencePath = savedReference?.path || String(capturedPath || '').trim();
    if (!nextReferencePath) {
      return '';
    }

    this.updateOpeningPersonaReferencePath(nextReferencePath, savedReference?.metadata || metadata);
    markPersonaReferenceCaptureTimestampOnContext(this);
    logger.info(`Updated persona reference from camera shot: ${nextReferencePath}`);
    return nextReferencePath;
  }

  shouldCapturePersonaReferenceForBeat(asyncConfig = {}, sceneContext = null) {
    const minBeatMs = resolvePositiveMs(asyncConfig?.minBeatMs, 0);
    if (minBeatMs <= 0) {
      return false;
    }

    const now = Date.now();
    const lastCaptureAt = Number(this.lastPersonaReferenceCaptureAt) || 0;
    const dueByTime = !lastCaptureAt || (now - lastCaptureAt) >= minBeatMs;
    if (!dueByTime) {
      return false;
    }

    const forceTimedCaptureOnSceneBoundary = asyncConfig?.forceTimedCaptureOnSceneBoundary !== false;
    if (!forceTimedCaptureOnSceneBoundary && Number(sceneContext?.index) > 0) {
      const intervalScenes = resolvePositiveInt(asyncConfig?.intervalScenes, 1);
      if (intervalScenes > 1 && sceneContext.index % intervalScenes !== 0) {
        return false;
      }
    }

    return true;
  }

  async scheduleAsyncPersonaReferenceCapture(sceneContext = null, scheduleOptions = {}) {
    const asyncConfig = this.getAsyncPersonaReferenceConfig();
    if (asyncConfig?.enabled !== true) {
      return null;
    }

    const forceByBeat = scheduleOptions?.forceByBeat === true;
    const intervalScenes = resolvePositiveInt(asyncConfig?.intervalScenes, 1);
    if (!forceByBeat && Number(sceneContext?.index) > 0 && intervalScenes > 1 && sceneContext.index % intervalScenes !== 0) {
      return null;
    }

    if (this.personaReferenceCapturePromise) {
      return this.personaReferenceCapturePromise;
    }

    const captureConfig = {
      ...asyncConfig,
      filePrefix: `persona-reference-${Number(sceneContext?.index) > 0 ? `scene-${String(sceneContext.index).padStart(2, '0')}` : 'async'}`,
    };

    this.personaReferenceCapturePromise = (async () => {
      try {
        const capturedReference = await resolveCapturedImageOverride({
          imageDir: this.imageDir,
          captureConfig,
          defaultFilePrefix: 'persona-reference',
        });
        if (!capturedReference?.path) {
          return '';
        }

        const savedReference = await this.persistCapturedPersonaReferenceImage(
          capturedReference.path,
          sceneContext,
          capturedReference.metadata || null
        );
        if (savedReference?.path) {
          this.updateOpeningPersonaReferencePath(savedReference.path, savedReference.metadata || capturedReference.metadata || null);
          markPersonaReferenceCaptureTimestampOnContext(this);
          logger.info(`Updated async persona reference: ${savedReference.path}`);
        }
        return savedReference?.path || '';
      } catch (error) {
        logger.warn(`Async persona reference capture failed: ${error?.message || error}`);
        return '';
      } finally {
        this.personaReferenceCapturePromise = null;
      }
    })();

    return this.personaReferenceCapturePromise;
  }

  shouldUsePersonaReferenceImageModel(options = {}) {
    if (!this.personaReferenceImageModel) {
      return false;
    }

    const openingImageConfig = this.getOpeningImageConfig();
    if (openingImageConfig?.usePersonaReferenceForFreshImages !== true) {
      return false;
    }

    const personaReferencePath = String(
      openingImageConfig?.personaReferencePath
      || openingImageConfig?.referenceImagePath
      || openingImageConfig?.imagePath
      || ''
    ).trim();

    if (!personaReferencePath) {
      return false;
    }

    if (options?.disablePersonaReference === true) {
      return false;
    }

    return true;
  }

  buildPersonaReferenceIdentityClause() {
    return buildPersonaReferenceIdentityClauseFromConfig(this.getOpeningImageConfig());
  }

  buildPersonaReferenceImageOptions(options = {}) {
    if (!this.shouldUsePersonaReferenceImageModel(options)) {
      return options;
    }

    const openingImageConfig = this.getOpeningImageConfig();
    const personaReferencePath = path.resolve(
      openingImageConfig?.personaReferencePath
      || openingImageConfig?.referenceImagePath
      || openingImageConfig?.imagePath
    );
    const existingImages = Array.isArray(options.images) ? options.images.filter(Boolean) : [];
    const hasPersonaReference = existingImages.some((entry) => (
      path.resolve(String(entry?.path || entry?.url || '')) === personaReferencePath
    ));

    return {
      ...options,
      imagePath: options.imagePath || personaReferencePath,
      images: hasPersonaReference
        ? existingImages
        : [{ path: personaReferencePath }, ...existingImages],
      negative_prompt: [
        options.negative_prompt,
        'extra people, second person, crowd, bystander, duplicate face, duplicated subject, extra actor',
      ].filter(Boolean).join(', '),
      contextReference: options.contextReference && typeof options.contextReference === 'object'
        ? options.contextReference
        : { enabled: true },
    };
  }

  shouldGenerateOpeningFluxContextImage(openingImageOptions = {}) {
    return normalizeOpeningStartMode(openingImageOptions?.mode) === 'fluxContext'
      && openingImageOptions?.active === true
      && Boolean(this.openingFluxContextModel);
  }

  async generateOpeningFluxContextFrame(
    streams,
    imageOptions = {},
    openingImageOptions = {},
    sceneContext = null
  ) {
    if (!this.shouldGenerateOpeningFluxContextImage(openingImageOptions)) {
      return null;
    }

    const referenceImagePath = typeof openingImageOptions?.referenceImagePath === 'string'
      ? openingImageOptions.referenceImagePath
      : openingImageOptions?.imagePath;
    const sceneContextImagePath = typeof openingImageOptions?.sceneContextReferencePath === 'string'
      ? openingImageOptions.sceneContextReferencePath
      : openingImageOptions?.sceneContextImagePath;
    const generatedPrompt = String(
      openingImageOptions?.generatedPrompt
      || openingImageOptions?.promptSource
      || ''
    ).trim();

    if (!referenceImagePath || !generatedPrompt) {
      return null;
    }

    const resolvedReferenceImagePath = path.resolve(referenceImagePath);
    if (!(await fs.pathExists(resolvedReferenceImagePath))) {
      logger.warn(`opening flux-context reference image not found, falling back to raw start image: ${resolvedReferenceImagePath}`);
      return null;
    }

    const resolvedSceneContextImagePath = typeof sceneContextImagePath === 'string' && sceneContextImagePath.trim().length > 0
      ? path.resolve(sceneContextImagePath)
      : '';
    const primaryImagePath = resolvedSceneContextImagePath && await fs.pathExists(resolvedSceneContextImagePath)
      ? resolvedSceneContextImagePath
      : resolvedReferenceImagePath;
    const referenceImages = primaryImagePath === resolvedReferenceImagePath
      ? []
      : [{ path: resolvedReferenceImagePath }];

    const openingModelOptions = {
      ...(openingImageOptions?.model || {}),
      imagePath: primaryImagePath,
      images: referenceImages,
      contextReference: referenceImages.length > 0 ? { enabled: true } : undefined,
      prompt: generatedPrompt,
      sceneContext,
      frameRole: 'opening',
    };

    try {
      const generatedFrame = await this.openingFluxContextModel.prompt(generatedPrompt, openingModelOptions);
      return {
        ...generatedFrame,
        json: {
          ...(generatedFrame?.json || {}),
          metadata: {
            ...(generatedFrame?.json?.metadata || {}),
            prompt: generatedPrompt,
            openingImageMode: 'fluxContext',
            openingImageReferencePath: resolvedReferenceImagePath,
            openingImageSceneContextReferencePath: primaryImagePath === resolvedReferenceImagePath
              ? ''
              : primaryImagePath,
            openingImageStoryRunIndex: openingImageOptions?.storyRunIndex || null,
            openingImageInterval: Number(openingImageOptions?.interval) || null,
          },
        },
      };
    } catch (error) {
      logger.warn(`opening flux-context image generation failed, falling back to raw start image: ${error?.message || error}`);
      return null;
    }
  }

  buildSceneContextFluxPrompt({ scenePlanEntry = {}, sceneContext = {}, contextImage = null } = {}) {
    const openingImageConfig = this.getOpeningImageConfig();
    const sourceVision = String(openingImageConfig?.continuityVisionText || '').trim();
    const continuityAnchor = String(openingImageConfig?.continuityAnchor || '').trim();
    const personaReferenceIdentityClause = this.buildPersonaReferenceIdentityClause();
    const basePrompt = String(
      scenePlanEntry?.singleImagePrompt
        || scenePlanEntry?.stillPrompt
        || scenePlanEntry?.imageDescription
        || scenePlanEntry?.videoPrompt
        || sceneContext?.storyBeat
        || scenePlanEntry?.title
        || ''
    ).trim();
    const storyBeat = String(
      scenePlanEntry?.storyBeat
        || scenePlanEntry?.beat
        || sceneContext?.storyBeat
        || basePrompt
    ).trim();
    const groundedPrompt = buildCameraGroundedPrompt({
      basePrompt,
      storyBeat,
      stillPrompt: scenePlanEntry?.stillPrompt,
      imageDescription: scenePlanEntry?.imageDescription,
      motionCue: scenePlanEntry?.motionCue,
      cameraCue: scenePlanEntry?.cameraCue,
      startVision: sourceVision,
      useSingleImage: true,
      promptFlavor: 'ltxTrippy',
      cameraSourceLabel: 'scene context image',
    });

    return [
      'Use the provided scene context image as the visual world map for this scene.',
      'Keep the protagonist identity anchored to the separate protagonist reference image, not to random people in the context image.',
      personaReferenceIdentityClause,
      continuityAnchor ? `Protagonist continuity: ${continuityAnchor}` : '',
      groundedPrompt,
      contextImage?.url ? `Scene context source URL: ${contextImage.url}` : '',
    ].filter(Boolean).join(' ');
  }

  async generateSceneContextFluxFrame({ scenePlanEntry = {}, sceneContext = {}, imageOptions = {} } = {}) {
    const sceneContextImageConfig = this.getSceneContextImageConfig();
    if (sceneContextImageConfig?.enabled !== true || !this.openingFluxContextModel) {
      return null;
    }

    const contextImages = Array.isArray(sceneContextImageConfig?.images)
      ? sceneContextImageConfig.images.filter(Boolean)
      : [];
    if (contextImages.length === 0) {
      return null;
    }

    const sceneIndex = Math.max(1, Number(sceneContext?.index) || 1);
    const contextImage = contextImages[(sceneIndex - 1) % contextImages.length];
    const contextImagePath = String(contextImage?.path || '').trim();
    if (!contextImagePath || !(await fs.pathExists(contextImagePath))) {
      return null;
    }

    const openingImageConfig = this.getOpeningImageConfig();
    const protagonistReferencePath = String(
      openingImageConfig?.personaReferencePath
      || openingImageConfig?.referenceImagePath
      || ''
    ).trim();
    const prompt = this.buildSceneContextFluxPrompt({
      scenePlanEntry,
      sceneContext,
      contextImage,
    });
    const referenceImages = protagonistReferencePath && await fs.pathExists(protagonistReferencePath)
      ? [{ path: protagonistReferencePath }]
      : [];
    const modelOptions = {
      ...(sceneContextImageConfig?.model || {}),
      ...imageOptions,
      imagePath: path.resolve(contextImagePath),
      images: referenceImages,
      contextReference: referenceImages.length > 0 ? { enabled: true } : undefined,
      prompt,
      sceneContext,
      frameRole: 'scene-context',
    };

    try {
      const generatedFrame = await this.openingFluxContextModel.prompt(prompt, modelOptions);
      return {
        ...generatedFrame,
        json: {
          ...(generatedFrame?.json || {}),
          metadata: {
            ...(generatedFrame?.json?.metadata || {}),
            prompt,
            sceneContextImageMode: 'fluxContext',
            sceneContextImagePath: path.resolve(contextImagePath),
            sceneContextImageUrl: contextImage?.url || '',
            protagonistReferencePath,
            sceneIndex,
          },
        },
      };
    } catch (error) {
      logger.warn(`scene context flux image generation failed, falling back to existing start frame: ${error?.message || error}`);
      return null;
    }
  }

  shouldApplyDriftCorrection({ nextScenePlanEntry } = {}) {
    const driftCorrection = this.getDriftCorrectionConfig();
    if (!driftCorrection?.enabled || !this.driftCorrectionModel) {
      return false;
    }

    const castContextConfig = typeof this.getCastContextConfig === 'function'
      ? this.getCastContextConfig()
      : {};
    const videoMode = String(nextScenePlanEntry?.videoMode || '').trim();
    const hasCastTransitionTarget = videoMode === 'firstLast'
      && castContextConfig?.enabled === true
      && Array.isArray(nextScenePlanEntry?.castReferences)
      && nextScenePlanEntry.castReferences.some((entry) => entry?.referenceImage);
    if (hasCastTransitionTarget) {
      return false;
    }

    const frameSource = String(nextScenePlanEntry?.frameSource || '').trim();
    if (videoMode === 'firstLast' && driftCorrection.applyToFirstLast !== true) {
      return false;
    }
    if (videoMode === 'singleImage' && frameSource === 'lastFrame' && driftCorrection.applyToSingleImage !== true) {
      return false;
    }

    return true;
  }

  trimContextScreenshotBuffer(maxSize) {
    const size = resolvePositiveInt(maxSize, DEFAULT_CONTEXT_SCREENSHOT_BUFFER_SIZE);
    if (!Array.isArray(this.contextScreenshotBuffer)) {
      this.contextScreenshotBuffer = [];
      return;
    }
    if (this.contextScreenshotBuffer.length <= size) {
      return;
    }
    this.contextScreenshotBuffer = this.contextScreenshotBuffer.slice(-size);
  }

  pushContextScreenshotPath(entryPath, { maxSize } = {}) {
    const resolvedPath = String(entryPath || '').trim();
    if (!resolvedPath) {
      return this.contextScreenshotBuffer || [];
    }
    if (!Array.isArray(this.contextScreenshotBuffer)) {
      this.contextScreenshotBuffer = [];
    }
    const absolutePath = path.resolve(resolvedPath);
    if (this.contextScreenshotBuffer.includes(absolutePath)) {
      return this.contextScreenshotBuffer;
    }
    this.contextScreenshotBuffer.push(absolutePath);
    this.trimContextScreenshotBuffer(maxSize);
    return this.contextScreenshotBuffer;
  }

  async updateContextScreenshotBuffer({ referenceImage, contextBufferConfig } = {}) {
    const referenceImageConfig = this.getDriftCorrectionConfig()?.referenceImage || null;
    const shouldCapture = contextBufferConfig?.captureBeforeEachCall
      && typeof referenceImageConfig?.captureFn === 'function';

    if (shouldCapture) {
      const capturedPath = await referenceImageConfig.captureFn();
      if (capturedPath) {
        this.pushContextScreenshotPath(capturedPath, { maxSize: contextBufferConfig?.size });
      }
    } else if (contextBufferConfig?.includeReferenceImage && referenceImage?.path) {
      this.pushContextScreenshotPath(referenceImage.path, { maxSize: contextBufferConfig?.size });
    }

    const existingEntries = await Promise.all(
      (this.contextScreenshotBuffer || []).map(async (entryPath) => (
        await fs.pathExists(entryPath) ? entryPath : null
      ))
    );
    this.contextScreenshotBuffer = existingEntries.filter(Boolean);
    this.trimContextScreenshotBuffer(contextBufferConfig?.size);
    return this.contextScreenshotBuffer;
  }

  buildDriftCorrectionPrompt({ lastFrame, nextScenePlanEntry, nextSceneContext }) {
    const previousPrompt = String(lastFrame?.json?.metadata?.prompt || '').trim();
    const openingImageConfig = this.getOpeningImageConfig();
    const openingContinuityAnchor = String(openingImageConfig?.continuityAnchor || '').trim();
    const openingContinuityVision = String(openingImageConfig?.continuityVisionText || '').trim();
    const personaReferenceIdentityClause = buildPersonaReferenceIdentityClauseFromConfig(openingImageConfig);
    const driftCorrection = this.getDriftCorrectionConfig();
    const driftCorrectionLevel = normalizeDriftCorrectionLevel(driftCorrection?.level, 'default');
    const nextTitle = String(nextScenePlanEntry?.title || '').trim();
    const nextBeat = String(
      nextScenePlanEntry?.storyBeat
      || nextScenePlanEntry?.beat
      || nextSceneContext?.storyBeat
      || ''
    ).trim();

    return [
      'Use this image as the exact visual anchor for a drift-correction still.',
      'The input last frame is the primary truth; do not replace, restage, abstract, or overpower it.',
      'Do not add heavy blur, smear, double exposure, silhouette-only rendering, rear-view substitution, or a different room.',
      'Keep the same person identity, face, hair, clothing, location, framing, and lighting.',
      driftCorrectionLevel === 'moderate'
        ? 'Apply only moderate drift handling: correct visible identity or room drift, but preserve the current composition, texture, and natural imperfections.'
        : '',
      driftCorrectionLevel === 'aggressive'
        ? 'If drift has accumulated, push the image decisively back toward the canonical opening look without changing the scene.'
        : '',
      personaReferenceIdentityClause,
      openingContinuityAnchor ? `Canonical opening continuity: ${openingContinuityAnchor}` : '',
      !openingContinuityAnchor && openingContinuityVision
        ? `Canonical opening continuity: ${openingContinuityVision}`
        : '',
      'Correct generative drift and restore realism, readability, and continuity.',
      previousPrompt ? `Preserve from the previous shot: ${previousPrompt}` : '',
      nextTitle ? `Prepare the next scene title: ${nextTitle}.` : '',
      nextBeat ? `Prepare the next beat without adding new props that are not already visible: ${nextBeat}` : '',
    ].filter(Boolean).join(' ');
  }

  async resolveDriftCorrectionReferenceImage({ lastFrame } = {}) {
    const driftCorrection = this.getDriftCorrectionConfig();
    const referenceImageConfig = driftCorrection?.referenceImage || null;
    const lastFramePath = lastFrame?.image?.path || '';

    const pendingPersonaReferencePath = String(this.pendingPersonaReferencePath || '').trim();
    if (pendingPersonaReferencePath && await fs.pathExists(pendingPersonaReferencePath)) {
      this.pendingPersonaReferencePath = '';
      return {
        path: pendingPersonaReferencePath,
        prompt: this.buildPersonaReferenceIdentityClause(),
        sourceType: 'cameraShot',
      };
    }

    const capturedReference = await resolveCapturedImageOverride({
      imageDir: this.imageDir,
      captureConfig: referenceImageConfig,
      defaultFilePrefix: 'drift-correction-reference',
    });

    if (capturedReference?.path) {
      return {
        path: capturedReference.path,
        prompt: capturedReference.prompt || '',
        sourceType: 'cameraShot',
      };
    }

    return {
      path: lastFramePath,
      prompt: String(lastFrame?.json?.metadata?.prompt || '').trim(),
      sourceType: 'lastFrame',
    };
  }

  async correctLastFrameForNextScene({ lastFrame, nextScenePlanEntry, nextSceneContext }) {
    const driftCorrection = this.getDriftCorrectionConfig();
    if (!driftCorrection?.enabled || !this.driftCorrectionModel) {
      return lastFrame;
    }

    const lastFramePath = lastFrame?.image?.path;
    if (!lastFramePath) {
      return lastFrame;
    }

    const referenceImage = await this.resolveDriftCorrectionReferenceImage({ lastFrame });
    const referenceImagePath = referenceImage?.path || lastFramePath;
    const primaryInputPath = lastFramePath;
    const openingImageConfig = this.getOpeningImageConfig();
    const openingImagePath = typeof openingImageConfig?.imagePath === 'string'
      ? path.resolve(openingImageConfig.imagePath)
      : '';
    const contextBufferConfig = this.getContextBufferConfig();
    let contextScreenshotPaths = [];
    if (contextBufferConfig.enabled) {
      contextScreenshotPaths = await this.updateContextScreenshotBuffer({
        referenceImage: { ...referenceImage, path: referenceImagePath },
        contextBufferConfig,
      });
    }
    const secondaryReferencePaths = [
      ...(openingImagePath && openingImagePath !== primaryInputPath && openingImagePath !== referenceImagePath
        ? [openingImagePath]
        : []),
      ...(referenceImagePath && referenceImagePath !== primaryInputPath ? [referenceImagePath] : []),
      ...contextScreenshotPaths,
    ].filter(Boolean);

    const cameraHoldNegativePrompt = driftCorrection?.cameraMode
      ? 'heavy blur, motion smear, double exposure, silhouette, rear view, hidden face, changed room'
      : '';
    const correctionPrompt = this.buildDriftCorrectionPrompt({
      lastFrame,
      nextScenePlanEntry,
      nextSceneContext,
    });
    const correctionOptions = {
      imagePath: primaryInputPath,
      model: driftCorrection?.model?.model,
      hfProvider: driftCorrection?.model?.hfProvider,
      guidance_scale: driftCorrection?.model?.guidance_scale,
      num_inference_steps: driftCorrection?.model?.num_inference_steps,
      negative_prompt: [
        driftCorrection?.model?.negative_prompt,
        cameraHoldNegativePrompt,
      ].filter(Boolean).join(', '),
      seed: driftCorrection?.model?.seed,
      width: driftCorrection?.model?.width,
      height: driftCorrection?.model?.height,
      priorityReferencePath: referenceImagePath,
      ...(secondaryReferencePaths.length > 0
        ? {
            images: secondaryReferencePaths.map((entryPath) => ({ path: entryPath })),
            contextReference: {
              enabled: true,
              name: contextBufferConfig.name,
              layout: {
                maxImages: contextBufferConfig.size,
                columns: contextBufferConfig.columns,
                rows: contextBufferConfig.rows,
              },
            },
          }
        : {}),
    };
    const correctedFrame = await this.driftCorrectionModel.prompt(correctionPrompt, correctionOptions);

    return {
      image: { path: correctedFrame?.image?.path || correctedFrame?.imagePath || lastFramePath },
      json: {
        ...(correctedFrame?.json || {}),
        metadata: {
          ...(lastFrame?.json?.metadata || {}),
          ...(correctedFrame?.json?.metadata || {}),
          prompt: correctionPrompt,
          driftCorrection: true,
          sourceLastFramePath: lastFramePath,
          driftCorrectionReferencePath: referenceImagePath,
          driftCorrectionReferenceSource: referenceImage?.sourceType || 'lastFrame',
          driftCorrectionSecondaryReferencePaths: secondaryReferencePaths,
          driftCorrectionContextBufferPaths: contextScreenshotPaths,
          driftCorrectionContextReferenceBoardPath:
            correctedFrame?.json?.contextReferenceBoardPath
            || correctedFrame?.json?.metadata?.contextReferenceBoardPath
            || '',
          driftCorrectionContextBufferSize: contextScreenshotPaths.length,
        },
      },
    };
  }

  async resolveChainedStartFrameFromLastEnd({ nextScenePlanEntry, nextSceneContext }) {
    if (!this.lastEndFRame) {
      return this.lastEndFRame;
    }
    if (!this.shouldApplyDriftCorrection({ nextScenePlanEntry, nextSceneContext })) {
      return this.lastEndFRame;
    }

    try {
      return await this.correctLastFrameForNextScene({
        lastFrame: this.lastEndFRame,
        nextScenePlanEntry,
        nextSceneContext,
      });
    } catch (error) {
      logger.warn(`Drift correction failed, falling back to raw last frame: ${error?.message || error}`);
      return this.lastEndFRame;
    }
  }

  async resolveStartFrame(
    streams,
    imageOptions,
    openingImageOptions = null,
    sceneContext = null,
    { allowLastEndFrame = true } = {}
  ) {
    let startFrame = allowLastEndFrame ? this.lastEndFRame : null;

    if (!startFrame) {
      const generatedOpeningFrame = await this.generateOpeningFluxContextFrame(
        streams,
        imageOptions,
        openingImageOptions,
        sceneContext
      );
      if (generatedOpeningFrame) {
        logger.payload('generated opening flux-context startFrame', generatedOpeningFrame);
        return generatedOpeningFrame;
      }

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
    const groundedPrompt = [
      this.buildPersonaReferenceIdentityClause(),
      generatedPrompt,
    ].filter(Boolean).join(' ');

    return buildVideoConfig({
      config: this.config,
      addStaticPrompt: this.addStaticPrompt.bind(this),
      generatedPrompt: groundedPrompt,
      videoModel,
      startFrame,
      options,
    });
  }

  async generateVideoData(videoType, startFrame, mergedConfig, useSingleImage, videoRunOptions = {}) {
    const rawVideoCandidates = Array.isArray(videoRunOptions.videoTypeCandidates) && videoRunOptions.videoTypeCandidates.length > 0
      ? videoRunOptions.videoTypeCandidates
      : [videoType];
    const videoCandidates = dedupeVideoCandidates(rawVideoCandidates);
    let lastError = null;

    for (let index = 0; index < videoCandidates.length; index += 1) {
      const activeVideoType = videoCandidates[index];
      try {
        this.repeatVideoGeneration = createRepeatVideoGeneration({
          videoType: activeVideoType,
          startFrame,
          mergedConfig,
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

  async finalizeGeneratedVideo({
    videoData,
    mergedConfig,
    requestedDuration = null,
    captureLastFrame = false,
    startFrame = null,
    endFramePrompt = null,
    endFrameImagePath = null,
  } = {}) {
    if (!videoData?.file) {
      return videoData;
    }

    const targetFps = Number(mergedConfig?.frames_per_second) || Number(mergedConfig?.fps) || 24;
    const targetWidth = Number(mergedConfig?.width) || null;
    const targetHeight = Number(mergedConfig?.height) || null;

    await normalizeVideoOutput(videoData.file, {
      targetDurationSeconds: requestedDuration,
      targetFps,
      targetWidth,
      targetHeight,
    });

    if (endFrameImagePath) {
      await forceVideoEndImage(videoData.file, endFrameImagePath, {
        targetDurationSeconds: requestedDuration,
        targetFps,
        targetWidth,
        targetHeight,
      });
    }

    if (captureLastFrame) {
      const lastPngPath = videoData.file.replace(/\.mp4$/, '-last-frame.png');
      await extractLastFrame(videoData.file, lastPngPath);
      this.lastEndFRame = {
        image: { path: lastPngPath },
        json: {
          ...(startFrame?.json || {}),
          metadata: {
            ...(startFrame?.json?.metadata || {}),
            prompt: endFramePrompt ?? mergedConfig?.prompt ?? startFrame?.json?.metadata?.prompt,
          },
        },
      };
    }

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
    const requestedDuration = capVideoDurationForBackend(
      await resolveRequestedDurationOption(
        mergedConfig?.duration_seconds,
        clipOptions?.sceneContext?.durationSeconds
      ),
      {
        useSingleImage,
        videoType,
      }
    );
    let resolvedDuration = requestedDuration;
    const cameraFirstLastMaxDuration = Number(this.config?.story?.cameraFirstLastMaxDurationSeconds);
    if (
      !useSingleImage
      && String(this.config?.story?.mode || '').trim() === 'camera'
      && Number.isFinite(cameraFirstLastMaxDuration)
      && cameraFirstLastMaxDuration > 0
      && Number.isFinite(Number(resolvedDuration))
      && Number(resolvedDuration) > 0
    ) {
      resolvedDuration = Math.min(Number(resolvedDuration), cameraFirstLastMaxDuration);
    }
    if (Number.isFinite(Number(resolvedDuration)) && resolvedDuration > 0) {
      mergedConfig.duration_seconds = resolvedDuration;
      if (clipOptions?.sceneContext) {
        clipOptions.sceneContext.durationSeconds = resolvedDuration;
      }
    }

    const maxRetriesOnFailure = resolvePositiveInt(
      videoModel?.model?.maxRetriesOnFailure,
      0
    );
    const retryDelayMs = resolvePositiveInt(
      videoModel?.model?.retryDelayMs,
      10000
    );
    let videoData = null;

    for (let attempt = 0; attempt <= maxRetriesOnFailure; attempt += 1) {
      try {
        videoData = await this.generateVideoData(
          videoType,
          startFrame,
          mergedConfig,
          useSingleImage,
          {
            videoTypeCandidates,
          }
        );
        break;
      } catch (error) {
        const hasMoreAttempts = attempt < maxRetriesOnFailure;
        if (!hasMoreAttempts) {
          throw error;
        }
        const sceneLabel = clipOptions?.sceneContext
          ? `scene ${clipOptions.sceneContext.index}/${clipOptions.sceneContext.total}`
          : fileName;
        console.warn(
          `GenImgVideo: ${sceneLabel} failed. Retrying same clip render ${attempt + 1}/${maxRetriesOnFailure} after ${retryDelayMs}ms: ${error?.message || error}`
        );
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
      }
    }

    await this.finalizeGeneratedVideo({
      videoData,
      mergedConfig,
      requestedDuration: resolvedDuration,
      captureLastFrame,
      startFrame,
      endFramePrompt: generatedPrompt || mergedConfig.prompt || startFrame.json?.metadata?.prompt,
      endFrameImagePath: endFrameOverride?.path || null,
    });

    return { generatedPrompt, mergedConfig, videoData };
  }

  async createRealityIntrusionClip({
    sourceVideoPath,
    cameraImagePath,
    sceneContext,
    durationSeconds = 0.8,
  } = {}) {
    if (!sourceVideoPath || !cameraImagePath) {
      return null;
    }

    const sourcePath = path.resolve(sourceVideoPath);
    const imagePath = path.resolve(cameraImagePath);
    if (!(await fs.pathExists(sourcePath)) || !(await fs.pathExists(imagePath))) {
      return null;
    }

    const duration = Math.max(0.25, Math.min(Number(durationSeconds) || 0.8, 2));
    const outputPath = path.join(
      path.dirname(sourcePath),
      `${path.basename(sourcePath, path.extname(sourcePath))}-reality-intrusion.mp4`
    );
    await fs.copy(sourcePath, outputPath);
    await forceVideoEndImage(outputPath, imagePath, {
      targetDurationSeconds: duration,
      holdDurationSeconds: duration,
    });
    logger.info(`reality intrusion cut: scene ${sceneContext?.index || 0}, duration=${duration}s, image=${imagePath}`);
    return outputPath;
  }

  async finalizeSceneLoopResult({
    clipResults,
    fileName,
    sceneLoop,
    options,
    startFrame,
  }) {
    const clipPaths = clipResults
      .map((clip) => clip.videoFile || clip.videoData?.file)
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
        mergedOutDir,
        {
          trimLeadingSeconds: sceneLoop.concatTrimLeadingSeconds,
        }
      );

    const totalTrackDuration = await probeVideoDurationSeconds(concatenatedVideoPath);
    const mireloPrompt = clipResults
      .map((clip) => clip.generatedPrompt)
      .filter(Boolean)
      .join('\n\n')
      || startFrame.json?.metadata?.prompt;

    const sceneLoopSummary = {
      sceneCount: clipResults.length,
      totalTrackDuration,
      concatenatedVideoPath,
      mireloMode: sceneLoop.mireloMode || 'finalOnly',
      storyTransport: sceneLoop.storyTransport || null,
      clips: clipResults.map((clip) => ({
        index: clip.index,
        title: clip.scenePlanEntry?.title || '',
        durationSeconds: clip.sceneContext?.durationSeconds || null,
        file: clip.videoData?.file,
        outputFile: clip.videoFile || clip.videoData?.file,
        prompt: clip.generatedPrompt,
        useSingleImage: clip.useSingleImage,
      })),
    };

    const summaryPath = await saveJSON(
      path.join(this.imageDir, `${fileName}-scene-loop.json`),
      sceneLoopSummary
    );

    if (sceneLoop.mireloMode === 'afterEachVideo') {
      return concatenatedVideoPath;
    }

    if (['off', 'none', 'disabled'].includes(String(sceneLoop.mireloMode || '').trim().toLowerCase())) {
      return concatenatedVideoPath;
    }

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

  async continueSceneLoop({
    streams,
    options,
    fileName,
    sceneLoop,
    clipCount,
    imageOptions,
    promptDir,
    clipResults,
    startFrame,
    startIndex = 0,
    loopStartsFromLastFrame = false,
  }) {
    let currentStartFrame = startFrame;
    const openingImageSourceType = typeof sceneLoop.openingImage?.sourceType === 'string'
      ? sceneLoop.openingImage.sourceType.trim()
      : '';
    const independentSceneStarts = sceneLoop.independentSceneStarts === true;

    for (let index = startIndex; index < clipCount; index += 1) {
      const isFirstClip = index === 0;
      const isLastClip = index === clipCount - 1;
      const sceneContext = {
        index: index + 1,
        total: clipCount,
        isFirst: isFirstClip,
        isLast: isLastClip,
      };
      const scenePlanEntry = getScenePlanEntry(sceneLoop, sceneContext);
      const boundaryTransport = scenePlanEntry?.boundaryTransport || null;
      const boundaryCameraImagePath = String(boundaryTransport?.cameraImagePath || '').trim();
      const boundaryCameraReset = boundaryTransport?.command === 'cameraReset' && boundaryCameraImagePath;
      const boundaryLocationReturn = boundaryTransport?.command === 'locationReturn' && boundaryCameraImagePath;
      sceneContext.title = scenePlanEntry?.title || '';
      sceneContext.storyBeat = scenePlanEntry?.storyBeat || scenePlanEntry?.beat || '';
      sceneContext.castSelection = scenePlanEntry?.castSelection || [];
      sceneContext.castReferences = scenePlanEntry?.castReferences || [];
      sceneContext.plannedDurationSeconds = Number(scenePlanEntry?.durationSeconds) || null;
      sceneContext.durationSeconds = Number(scenePlanEntry?.requestedDurationSeconds)
        || sceneContext.plannedDurationSeconds;
      sceneContext.frameSource = isFirstClip
        ? (loopStartsFromLastFrame
          ? 'lastFrame'
          : (openingImageSourceType || scenePlanEntry?.frameSource || 'newImage'))
        : (scenePlanEntry?.frameSource || 'lastFrame');
      if (boundaryCameraReset) {
        currentStartFrame = {
          image: { path: boundaryCameraImagePath },
          json: { metadata: { prompt: boundaryTransport.transitionPrompt || '' } },
        };
        sceneContext.frameSource = 'boundaryCameraReset';
      }
      const sceneContextFrame = !boundaryTransport && typeof this.generateSceneContextFluxFrame === 'function'
        ? await this.generateSceneContextFluxFrame({
          scenePlanEntry,
          sceneContext,
          imageOptions,
        })
        : null;
      if (sceneContextFrame) {
        logger.payload('generated scene context flux startFrame', sceneContextFrame);
        currentStartFrame = sceneContextFrame;
        sceneContext.frameSource = 'sceneContextImage';
      }
      const sceneFrameSource = scenePlanEntry?.frameSource;
      const useFreshImage = !isFirstClip && (
        independentSceneStarts
        || scenePlanEntry?.freshImage === true
        || sceneFrameSource === 'newImage'
      );
      if (!sceneContextFrame && useFreshImage && !boundaryCameraReset) {
        const shouldCaptureLiveStartImage = scenePlanEntry?.useCameraShot === true && sceneLoop.liveStartImage;
        if (shouldCaptureLiveStartImage) {
          const liveStartOverride = await resolveCapturedEndFrameOverride({
            imageDir: this.imageDir,
            imageOptions,
            endImageConfig: {
              ...sceneLoop.liveStartImage,
              filePrefix: `webcam-scene-${String(index + 1).padStart(2, '0')}-start`,
            },
          });

          if (liveStartOverride?.path) {
            await this.refreshPersonaReferenceFromCameraShot(liveStartOverride.path, sceneContext);
            currentStartFrame = {
              image: { path: liveStartOverride.path },
              json: {
                metadata: {
                  prompt: liveStartOverride.prompt || '',
                },
              },
            };
          } else {
            currentStartFrame = await this.generateImage(streams, {
              ...imageOptions,
              sceneContext,
              frameRole: 'start',
            });
          }
        } else {
          currentStartFrame = await this.generateImage(streams, {
            ...imageOptions,
            sceneContext,
            frameRole: 'start',
          });
        }
      }
      let castContextEndFrame = null;
      const plannedSingleImageContinuation = scenePlanEntry?.videoMode === 'singleImage'
        && !useFreshImage
        && (!isFirstClip || loopStartsFromLastFrame);
      const shouldGenerateCastContextFrame = !boundaryTransport
        && !plannedSingleImageContinuation
        && typeof this.generateCastContextFrame === 'function';
      if (boundaryTransport) {
        logger.info(`cast context skipped: scene ${sceneContext.index}, boundary command=${boundaryTransport.command}`);
      }
      if (plannedSingleImageContinuation) {
        logger.info(
          `cast context skipped: scene ${sceneContext.index}, planned singleImage continuation keeps the previous frame`
        );
      }
      const castContextFrame = shouldGenerateCastContextFrame
        ? await this.generateCastContextFrame({
          startFrame: currentStartFrame,
          scenePlanEntry,
          sceneContext,
          imageOptions,
        })
        : null;
      if (castContextFrame?.image?.path) {
        const openingUsesFirstLast = isFirstClip && sceneLoop.firstClipUseSingleImage === false;
        const preservesPreviousFrame = openingUsesFirstLast
          || (!useFreshImage && (!isFirstClip || loopStartsFromLastFrame));
        if (preservesPreviousFrame) {
          // A cast-context image changes the room/person composition. It is a
          // destination of this shot, never a replacement for the frame the
          // audience just saw at the end of the previous shot.
          castContextEndFrame = {
            path: castContextFrame.image.path,
            prompt: castContextFrame.json?.metadata?.prompt || castContextFrame.json?.prompt || '',
          };
          sceneContext.transitionTargetPath = castContextEndFrame.path;
        } else {
          currentStartFrame = castContextFrame;
          sceneContext.frameSource = 'castContextImage';
        }
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
        startFrame: currentStartFrame,
        streams,
        options,
      });
      const useSingleImage = castContextEndFrame
        ? false
        : scenePlanEntry?.videoMode === 'firstLast'
          ? false
          : scenePlanEntry?.videoMode === 'singleImage'
            ? true
            : configuredSingleImage;
      const clipFileName = `${fileName}-scene-${String(index + 1).padStart(2, '0')}`;

      let endFrameOverride = boundaryLocationReturn
        ? {
            path: boundaryCameraImagePath,
            prompt: boundaryTransport.transitionPrompt || '',
          }
        : castContextEndFrame;
      if (boundaryLocationReturn) {
        sceneContext.transitionTargetPath = boundaryCameraImagePath;
      }

      if (!useSingleImage && !endFrameOverride && isLastClip && sceneLoop.finalEndImage) {
        endFrameOverride = await resolveCapturedEndFrameOverride({
          imageDir: this.imageDir,
          imageOptions,
          endImageConfig: {
            ...sceneLoop.finalEndImage,
            filePrefix: 'webcam-final-end',
          },
        });
        if (endFrameOverride?.path) {
          await this.refreshPersonaReferenceFromCameraShot(endFrameOverride.path, sceneContext);
        }

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

      const sceneFilePrefix = String(index + 1).padStart(2, '0');
      const decisionFilePath = path.join(promptDir, `${sceneFilePrefix}-scene-decision.json`);
      const plannedVideoMode = scenePlanEntry?.videoMode || '';
      const appliedVideoMode = useSingleImage ? 'singleImage' : 'firstLast';
      const castContextDecision = plannedSingleImageContinuation
        ? 'skipped: planned singleImage continuation preserves previous frame'
        : castContextEndFrame
          ? 'generated as firstLast destination image'
          : currentStartFrame === castContextFrame
            ? 'generated as fresh start image'
            : 'not used';
      const startFramePath = currentStartFrame?.image?.path || '';
      const endFramePath = endFrameOverride?.path || '';
      await saveJSON(decisionFilePath, {
        stage: 'before-video-generation',
        sceneIndex: index + 1,
        sceneTotal: clipCount,
        sceneTitle: scenePlanEntry?.title || '',
        storyBeat: scenePlanEntry?.storyBeat || scenePlanEntry?.beat || '',
        durationSeconds: sceneContext.durationSeconds,
        planned: {
          videoMode: plannedVideoMode,
          frameSource: scenePlanEntry?.frameSource || '',
          freshImage: scenePlanEntry?.freshImage === true,
          useCameraShot: scenePlanEntry?.useCameraShot === true,
        },
        applied: {
          videoMode: appliedVideoMode,
          frameSource: sceneContext.frameSource || scenePlanEntry?.frameSource || '',
          startFramePath,
          endFramePath: endFramePath || null,
          castContext: castContextDecision,
        },
        prompts: {
          videoPrompt: scenePlanEntry?.videoPrompt || '',
          singleImagePrompt: scenePlanEntry?.singleImagePrompt || '',
          stillPrompt: scenePlanEntry?.stillPrompt || '',
        },
      });
      logger.info(`scene decision before generation: ${index + 1}/${clipCount}`);
      logger.info(`  planned/applied mode: ${plannedVideoMode || 'config'} -> ${appliedVideoMode}`);
      logger.info(`  transport: ${scenePlanEntry?.frameSource || 'config'} -> ${sceneContext.frameSource || 'currentStartFrame'}`);
      logger.info(`  cast context: ${castContextDecision}`);
      logger.info(`  start image: ${startFramePath || 'none'}`);
      logger.info(`  end image: ${endFramePath || 'none (single-image animation)'}`);
      logger.info(`  decision log: ${decisionFilePath}`);

      this.repeatPromptGeneration = async () => this.continueSceneLoop({
        streams,
        options,
        fileName,
        sceneLoop,
        clipCount,
        imageOptions,
        promptDir,
        clipResults: [...clipResults],
        startFrame: currentStartFrame,
        startIndex: index,
        loopStartsFromLastFrame,
      });

      const clipResult = await this.generateSceneClip({
        startFrame: currentStartFrame,
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

      const mireloAfterEachVideo = sceneLoop.mireloMode === 'afterEachVideo';
      let clipVideoFile = clipResult.videoData?.file || '';
      if (mireloAfterEachVideo && clipVideoFile) {
        clipVideoFile = await addMireloAudioAndUpload({
          mireloAI: this.mireloAI,
          imageDir: this.imageDir,
          fileName: `${clipFileName}-scene-audio`,
          startFrame: currentStartFrame,
          videoData: clipResult.videoData,
          videoInput: clipVideoFile,
          mireloPrompt: clipResult.generatedPrompt || clipResult.mergedConfig?.prompt || '',
          extraMetadata: {
            sceneIndex: sceneContext.index,
            sceneTitle: scenePlanEntry?.title || '',
            durationSeconds: sceneContext.durationSeconds,
            videoMode: useSingleImage ? 'singleImage' : 'firstLast',
            mireloMode: sceneLoop.mireloMode,
          },
          options: {
            ...options,
            mireloAI: {
              ...(options.mireloAI || {}),
              duration: Number(sceneContext.durationSeconds) || options.mireloAI?.duration,
            },
            uploadToYT: null,
          },
          skipGateUpload: true,
        });
      }

      clipResults.push({
        index,
        sceneContext,
        scenePlanEntry,
        startFrame: currentStartFrame,
        useSingleImage,
        videoFile: clipVideoFile,
        ...clipResult,
      });

      if (scenePlanEntry?.realityIntrusion === true && sceneLoop.realityIntrusionImage) {
        const realityIntrusionFrame = await resolveCapturedEndFrameOverride({
          imageDir: this.imageDir,
          imageOptions,
          endImageConfig: {
            ...sceneLoop.realityIntrusionImage,
            filePrefix: `reality-intrusion-scene-${String(index + 1).padStart(2, '0')}`,
          },
        });
        const savedRealityReference = realityIntrusionFrame?.path
          ? await this.persistCapturedPersonaReferenceImage(
            realityIntrusionFrame.path,
            sceneContext,
            realityIntrusionFrame.metadata
          )
          : null;
        const realityReferencePath = savedRealityReference?.path || realityIntrusionFrame?.path || '';
        if (realityReferencePath && typeof sceneLoop.onRealityIntrusion === 'function') {
          try {
            await sceneLoop.onRealityIntrusion({
              referenceImagePath: realityReferencePath,
              sceneContext,
              scenePlanEntry,
            });
          } catch (error) {
            logger.warn(`reality intrusion tail replan skipped: ${error?.message || error}`);
          }
        }
        const realityIntrusionVideo = await this.createRealityIntrusionClip({
          sourceVideoPath: clipVideoFile,
          cameraImagePath: realityReferencePath,
          sceneContext,
        });
        if (realityIntrusionVideo) {
          clipResults.push({
            index: `${index}-reality-intrusion`,
            sceneContext: { ...sceneContext, realityIntrusion: true },
            scenePlanEntry: { title: 'Reality intrusion', realityIntrusion: true },
            useSingleImage: true,
            videoFile: realityIntrusionVideo,
            videoData: { file: realityIntrusionVideo },
            generatedPrompt: 'Deliberate hard cut from fictional Kaufhaus CCTV into the live exhibition camera.',
          });
        }
      }

      if (!isLastClip && typeof sceneLoop.onSceneBoundary === 'function') {
        const nextScenePlanEntry = getScenePlanEntry(sceneLoop, { index: index + 2 });
        try {
          const decision = await sceneLoop.onSceneBoundary({
            sceneContext,
            scenePlanEntry,
            nextScenePlanEntry,
            generatedLastFramePath: this.lastEndFRame?.image?.path || '',
            videoFile: clipVideoFile,
          });
          if (decision?.command) {
            if (decision.cameraHasPeople && decision.cameraImagePath) {
              this.pendingPersonaReferencePath = decision.cameraImagePath;
            }
            const appliedNextScene = applySceneBoundaryTransport(nextScenePlanEntry || {}, decision);
            sceneLoop.scenePlan[index + 1] = appliedNextScene;
            const boundaryLogPath = path.join(
              promptDir,
              `${sceneFilePrefix}-to-${String(index + 2).padStart(2, '0')}-boundary-transport.json`
            );
            await saveJSON(boundaryLogPath, {
              stage: 'after-scene-before-next-scene',
              completedSceneIndex: index + 1,
              nextSceneIndex: index + 2,
              generatedLastFramePath: this.lastEndFRame?.image?.path || '',
              cameraImagePath: decision.cameraImagePath || '',
              cameraVisionText: decision.cameraVisionText || '',
              roomMemory: decision.roomMemory || [],
              decision,
              nextSceneBefore: nextScenePlanEntry,
              nextSceneApplied: appliedNextScene,
            });
            logger.info(`scene boundary: ${index + 1}->${index + 2} command=${decision.command}`);
            logger.info(`  generated last frame: ${this.lastEndFRame?.image?.path || 'none'}`);
            logger.info(`  fresh camera image: ${decision.cameraImagePath || 'none'}`);
            logger.info(`  boundary log: ${boundaryLogPath}`);
          }
        } catch (error) {
          logger.warn(`scene boundary decision failed; continuing generated story: ${error?.message || error}`);
          sceneLoop.scenePlan[index + 1] = applySceneBoundaryTransport(nextScenePlanEntry || {}, {
            command: 'continue',
            reason: `Boundary decision failed: ${error?.message || error}`,
            storyBridge: '',
            transitionPrompt: '',
          });
        }
      }

      if (!isLastClip) {
        const personaReferenceConfig = this.getAsyncPersonaReferenceConfig();
        const forceByBeat = typeof this.shouldCapturePersonaReferenceForBeat === 'function'
          ? this.shouldCapturePersonaReferenceForBeat(personaReferenceConfig, sceneContext)
          : false;
        const nextPersonaReferencePath = await this.scheduleAsyncPersonaReferenceCapture(
          sceneContext,
          { forceByBeat }
        );
        if (nextPersonaReferencePath) {
          this.pendingPersonaReferencePath = nextPersonaReferencePath;
        }
      }

      const promptFilePath = path.join(promptDir, `${sceneFilePrefix}-scene-prompt.json`);
      await saveJSON(
        promptFilePath,
        {
          sceneIndex: index + 1,
          sceneTitle: scenePlanEntry?.title || '',
          durationSeconds: sceneContext.durationSeconds,
          plannedDurationSeconds: sceneContext.plannedDurationSeconds,
          frameSource: sceneContext.frameSource || scenePlanEntry?.frameSource || '',
          videoMode: useSingleImage ? 'singleImage' : 'firstLast',
          prompt: clipResult.generatedPrompt || clipResult.mergedConfig?.prompt || '',
          startFramePath: currentStartFrame?.image?.path || '',
          sceneContextImagePath: currentStartFrame?.json?.metadata?.sceneContextImagePath || '',
          sceneContextImageUrl: currentStartFrame?.json?.metadata?.sceneContextImageUrl || '',
          endFramePath: endFrameOverride?.path || null,
          transitionTargetPath: sceneContext.transitionTargetPath || '',
          nextStartFrameSourcePath: this.lastEndFRame?.image?.path || '',
          videoFile: clipVideoFile,
        }
      );
      logger.info(`scene result: ${index + 1}/${clipCount}`);
      logger.info(`  prompt log: ${promptFilePath}`);
      logger.info(`  video: ${clipVideoFile || 'none'}`);
      logger.info(`  last frame: ${this.lastEndFRame?.image?.path || 'none'}`);

      const nextSceneContext = index + 1 < clipCount
        ? {
          index: index + 2,
          total: clipCount,
          isFirst: false,
          isLast: index + 1 === clipCount - 1,
        }
        : null;
      const nextScenePlanEntry = nextSceneContext
        ? getScenePlanEntry(sceneLoop, nextSceneContext)
        : null;
      if (nextScenePlanEntry?.frameSource !== 'newImage' && this.lastEndFRame) {
        currentStartFrame = await this.resolveChainedStartFrameFromLastEnd({
          nextScenePlanEntry,
          nextSceneContext,
        });
      }
    }

    this.repeatPromptGeneration = async () => this.finalizeSceneLoopResult({
      clipResults: [...clipResults],
      fileName,
      sceneLoop,
      options,
      startFrame: currentStartFrame,
    });

    const result = await this.finalizeSceneLoopResult({
      clipResults,
      fileName,
      sceneLoop,
      options,
      startFrame: currentStartFrame,
    });
    delete this.repeatPromptGeneration;
    return result;
  }

  async promptSceneLoop(streams, options, fileName) {
    const sceneLoop = options.sceneLoop || {};
    const clipCount = await resolveSceneCount(sceneLoop, streams, options);
    const imageOptions = options.image;
    const storyRunIndex = Math.max(1, Number(sceneLoop.storyRunIndex) || 1);
    if (!this.lastEndFRame && sceneLoop.restartFromPreviousMovieLastFrame) {
      this.lastEndFRame = await restorePreviousMovieLastFrame({ imageDir: this.imageDir });
      if (this.lastEndFRame) {
        logger.payload('restored previous movie last frame', this.lastEndFRame);
      }
    }
    const promptDir = path.join(
      this.imageDir,
      'parts',
      'scene-prompts',
      `iteration-${String(storyRunIndex).padStart(4, '0')}`
    );
    await fs.ensureDir(promptDir);
    const previousLastFramePath = this.lastEndFRame?.image?.path || '';
    const iterationStartDecision = resolveIterationStartDecision({
      sceneLoop,
      hasPreviousLastFrame: Boolean(previousLastFramePath),
    });
    const loopStartsFromLastFrame = iterationStartDecision.startFromPreviousLastFrame;
    let startFrame = loopStartsFromLastFrame
      ? this.lastEndFRame
      : await this.resolveStartFrame(
        streams,
        imageOptions,
        sceneLoop.openingImage,
        {
          index: 1,
          total: clipCount,
          isFirst: true,
          isLast: clipCount === 1,
        },
        { allowLastEndFrame: loopStartsFromLastFrame }
      );
    const iterationStartDir = path.join(this.imageDir, 'parts', 'iteration-start');
    await fs.ensureDir(iterationStartDir);
    const iterationStartLogPath = path.join(
      iterationStartDir,
      `iteration-${String(storyRunIndex).padStart(4, '0')}.json`
    );
    await saveJSON(iterationStartLogPath, {
      iteration: storyRunIndex,
      configuredMode: sceneLoop.iterationStartMode || 'legacy',
      decision: iterationStartDecision.mode,
      reason: iterationStartDecision.reason,
      plannedFirstScene: sceneLoop.scenePlan?.[0]
        ? {
            title: sceneLoop.scenePlan[0].title || '',
            frameSource: sceneLoop.scenePlan[0].frameSource || '',
            videoMode: sceneLoop.scenePlan[0].videoMode || '',
            freshImage: sceneLoop.scenePlan[0].freshImage === true,
            useCameraShot: sceneLoop.scenePlan[0].useCameraShot === true,
          }
        : null,
      previousLastFramePath: previousLastFramePath || null,
      currentCameraImagePath: sceneLoop.currentCameraImagePath || sceneLoop.openingImage?.imagePath || null,
      appliedStartFramePath: startFrame?.image?.path || null,
    });
    logger.info(
      `iteration start: ${storyRunIndex} | ${iterationStartDecision.mode} | ${iterationStartDecision.reason}`
    );
    logger.info(`  previous film frame: ${previousLastFramePath || 'none'}`);
    logger.info(`  current camera image: ${sceneLoop.currentCameraImagePath || sceneLoop.openingImage?.imagePath || 'none'}`);
    logger.info(`  applied start image: ${startFrame?.image?.path || 'none'}`);
    logger.info(`  iteration start log: ${iterationStartLogPath}`);
    return this.continueSceneLoop({
      streams,
      options,
      fileName,
      sceneLoop,
      clipCount,
      imageOptions,
      promptDir,
      clipResults: [],
      startFrame,
      startIndex: 0,
      loopStartsFromLastFrame,
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
      if (this.repeatPromptGeneration) {
        return await this.runRepeatPromptGeneration();
      }

      if (this.repeatVideoGeneration) {
        return await this.runRepeatVideoGeneration();
      }

      if (options.sceneLoop?.enabled) {
        return await this.promptSceneLoop(streams, options, fileName);
      }

      const imageOptions = options.image;
      const startFrame = await this.resolveStartFrame(streams, imageOptions);

      const { videoType, videoTypeCandidates, videoModel, generatedPrompt } = await this.prepareVideoGeneration({
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
      const requestedDuration = capVideoDurationForBackend(
        await resolveRequestedDurationOption(
          mergedConfig?.duration_seconds
        ),
        {
          useSingleImage,
          videoType,
        }
      );
      if (Number.isFinite(Number(requestedDuration)) && requestedDuration > 0) {
        mergedConfig.duration_seconds = requestedDuration;
      }

      const videoData = await this.generateVideoData(
        videoType,
        startFrame,
        mergedConfig,
        useSingleImage,
        {
          videoTypeCandidates,
        }
      );
      await this.finalizeGeneratedVideo({
        videoData,
        mergedConfig,
        requestedDuration,
        captureLastFrame: !useSingleImage,
        startFrame,
        endFramePrompt: generatedPrompt || mergedConfig.prompt || startFrame.json?.metadata?.prompt,
      });

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
