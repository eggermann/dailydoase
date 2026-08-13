import fs from 'fs-extra';
import path from 'path';
import { execFileSync, execSync } from 'node:child_process';

import PostTo from '../../PostTo.js';

import { buildImagePrompt, mergeImageConfig } from './image-utils.js';
import { initModels } from './init-models.js';
import {
  normalizeVisionText,
  summarizeVisionStoryContext,
} from '../helpers/frame-vision.js';
import {
  buildVideoConfig,
  createRepeatVideoGeneration,
  prepareVideoGeneration,
} from './video-utils.js';
import {
  deterministicPercentDecision,
  resolveDriftCorrectionFocus,
  uniquePaths,
} from './drift-correction.js';
import { normalizeOpeningStartMode } from './opening-start.js';
import { resolveProviderDuration } from './scene-duration.js';
import {
  resolveSceneStartFrameStrategy,
  shouldDriftCorrectLastFrame,
  shouldGenerateLocationStartFrame,
} from './scene-start-strategy.js';
import {
  assertMonsterFreePromptSafety,
  buildFluxPrompt,
  CANONICAL_MONSTER_REALISM_LOCK,
  LOCATION_RULE,
  needsMonsterIdentitySeed,
  PHOTOGRAPHIC_REALISM_LOCK,
  shouldIncludeMonsterReference,
  stripMonsterIdentityFromMonsterFreePrompt,
  translateSemanticTermsForProductionPrompt,
} from './scene-prompt-selection.js';
import { addMireloAudioAndUpload, buildSemanticMireloPrompt } from './mirelo-utils.js';
import { isGpuAbort } from './retry-utils.js';
import {
  concatMp4Lossless,
  concatTrailerWithCollisionCuts,
  createStillVideoClip,
  extractLastFrame,
  forceVideoEndImage,
  normalizeVideoOutput,
  probeVideoDurationSeconds,
  probeVideoStream,
} from '../../ffmpeg-helpers.js';
import { renderExhibitionEndCard } from './end-card.js';
import { createLogger } from '../../logger.js';
import { saveJSON } from '../../save-utils.js';

const logger = createLogger('shorty-book:generator', { envKeys: ['GENERATOR_DEBUG'] });
const TRUTHY_VALUES = new Set(['1', 'true', 'yes', 'on']);
const FALSY_VALUES = new Set(['0', 'false', 'no', 'off', '']);
const DEFAULT_CONTEXT_SCREENSHOT_BUFFER_SIZE = 8;
const PUBLIC_WAN_FIRST_LAST_MAX_DURATION_SECONDS = 5.1;
const RUNWARE_FLUX_PROMPT_MAX_CHARACTERS = 2950;

const compactPromptFragment = (value, maxCharacters = 220) => {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (text.length <= maxCharacters) return text;
  const truncated = text.slice(0, maxCharacters + 1);
  const lastSpace = truncated.lastIndexOf(' ');
  return `${truncated.slice(0, lastSpace > 0 ? lastSpace : maxCharacters).trim()}.`;
};

export const compactFluxPromptForProvider = ({
  prompt = '',
  scenePlanEntry = {},
  locationRule = '',
  creatureRule = '',
  maxCharacters = RUNWARE_FLUX_PROMPT_MAX_CHARACTERS,
} = {}) => {
  const normalized = String(prompt || '').replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxCharacters) {
    return translateSemanticTermsForProductionPrompt(normalized, scenePlanEntry);
  }
  const compacted = buildFluxPrompt({
    scene: {
      ...scenePlanEntry,
      stillPrompt: scenePlanEntry.stillPrompt || prompt,
      consequence: scenePlanEntry.consequence || scenePlanEntry.localConsequence,
    },
    locationRule,
    creatureRule,
  });
  return translateSemanticTermsForProductionPrompt(
    compacted.slice(0, maxCharacters).trim(),
    scenePlanEntry
  );
};

export const buildEnvironmentSceneContextFluxPrompt = ({
  scenePlanEntry = {},
  contextImage = null,
} = {}) => [
  PHOTOGRAPHIC_REALISM_LOCK,
  'Use the supplied Kaufhaus photograph as the scene location.',
  LOCATION_RULE,
  scenePlanEntry.stillPrompt ? `Scene event: ${scenePlanEntry.stillPrompt}` : '',
  scenePlanEntry.consequence ? `Visible result: ${scenePlanEntry.consequence}` : '',
  'Express the Semantic Stream event through the Kaufhaus architecture, circulation, objects, light, reflections, people, or unexplained physical traces.',
  contextImage?.url ? `Scene context source URL: ${contextImage.url}` : '',
  'Create one unretouched documentary image matching the source exposure, perspective, wear, grain and material texture. No readable text, labels, panels or logos.',
].filter(Boolean).join(' ');

export const buildMonsterSceneContextFluxPrompt = ({
  scenePlanEntry = {},
  contextImage = null,
  personaReferenceIdentityClause = '',
} = {}) => [
  PHOTOGRAPHIC_REALISM_LOCK,
  CANONICAL_MONSTER_REALISM_LOCK,
  'Use the supplied Kaufhaus photograph as the scene location.',
  LOCATION_RULE,
  'Use the separate protagonist image as the canonical identity of this exact Green Monster.',
  'Preserve its face, proportions, amber eye placement, leaf ears, mouth tendril, rooted botanical structure and weathered physical materials.',
  'Use the Kaufhaus photograph for composition and location.',
  personaReferenceIdentityClause,
  scenePlanEntry.stillPrompt ? `Scene event: ${scenePlanEntry.stillPrompt}` : '',
  scenePlanEntry.monsterPresence ? `Monster presence: ${scenePlanEntry.monsterPresence}` : '',
  scenePlanEntry.consequence ? `Visible result: ${scenePlanEntry.consequence}` : '',
  contextImage?.url ? `Scene context source URL: ${contextImage.url}` : '',
  'Change only pose, expression, framing, scale, action and interaction.',
  'Create one unretouched documentary image matching the source exposure, perspective, wear, grain and material texture. No readable text, labels, panels or logos.',
].filter(Boolean).join(' ');

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

const buildPersonaReferenceIdentityClauseFromConfig = (
  openingImageConfig = {},
  { subjectType = 'person', enabled = true } = {}
) => {
  if (!enabled) return '';
  const personaReferenceDescription = String(
    openingImageConfig?.personaReferenceDescription
    || ''
  ).trim();
  const personaReferenceVisionText = String(
    openingImageConfig?.personaReferenceVisionText
    || ''
  ).trim();

  const identityDescription = personaReferenceDescription || personaReferenceVisionText;
  if (subjectType === 'creature') {
    return normalizeIdentityClause([
      'Use the supplied protagonist reference as the canonical identity.',
      'Show the exact same individual Green Monster, not a similar creature.',
      identityDescription ? `Canonical creature identity: ${identityDescription}` : '',
      'Preserve its exact face, amber eye placement, two leaf ears, mouth tendril, proportions and botanical anatomy.',
    ].filter(Boolean).join(' '));
  }
  if (!identityDescription) return '';
  const personaReferenceStrength = Number(openingImageConfig?.personaReferenceStrength) || 0;
  const identityLock = personaReferenceStrength > 0
    ? `Keep the exact same real person as the saved webcam anchor image. Match this detected person exactly: ${identityDescription}`
    : `Keep the exact same real person as the saved webcam anchor image: ${identityDescription}`;
  return normalizeIdentityClause(identityLock);
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

export const restorePreviousMovieLastFrame = async ({ imageDir, requirePipelineVersion = false } = {}) => {
  const partsDir = path.join(String(imageDir || ''), 'parts');
  const lastFrameEntries = await sortEntriesByMtimeDesc(
    partsDir,
    (name) => /-last-frame\.(png|jpg|jpeg|webp)$/i.test(name)
  );
  const latestLastFrame = lastFrameEntries[0];

  if (!latestLastFrame) {
    return null;
  }
  const metadata = await readJsonIfExists(
    latestLastFrame.path.replace(/\.(png|jpg|jpeg|webp)$/i, '.json')
  );
  if (requirePipelineVersion && metadata?.monsterIdentityPipelineVersion !== 2) {
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
        ...metadata,
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
    this.openingFluxContextModel = null;
    this.driftCorrectionModel = null;
    this.contextScreenshotBuffer = [];
    this.personaReferenceCapturePromise = null;
    this.lastPersonaReferenceCaptureAt = 0;
    this.lastMonsterFrame = null;
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
    this.openingFluxContextModel = openingFluxContextModel;
    this.driftCorrectionModel = driftCorrectionModel;

    // await store.initCache(this.imageDir);
    return this;
  }

  async generateImage(streams, options, promptSource = null) {
    const resolvedOptions = this.buildPersonaReferenceImageOptions(options);
    const prompt = await buildImagePrompt(streams, resolvedOptions, promptSource);
    const scenePlanEntry = getScenePlanEntry(options?.sceneLoop, options?.sceneContext);
    const includesMonster = shouldIncludeMonsterReference(scenePlanEntry);
    const isMonsterPipeline = Boolean(this.getOpeningImageConfig()?.monsterContinuityAnchorPath);
    const personaReferenceIdentityClause = buildPersonaReferenceIdentityClauseFromConfig(
      this.getOpeningImageConfig(),
      {
        subjectType: isMonsterPipeline ? 'creature' : 'person',
        enabled: isMonsterPipeline ? includesMonster : true,
      }
    );
    const effectivePrompt = [
      personaReferenceIdentityClause,
      prompt,
    ].filter(Boolean).join(' ');
    const safePrompt = isMonsterPipeline
      ? stripMonsterIdentityFromMonsterFreePrompt(effectivePrompt, scenePlanEntry)
      : effectivePrompt;
    const referenceImages = Array.isArray(resolvedOptions?.images) ? resolvedOptions.images : [];
    if (scenePlanEntry) {
      assertMonsterFreePromptSafety({ scene: scenePlanEntry, prompt: safePrompt, referenceImages });
    }
    const mergedConfig = mergeImageConfig(this.config, resolvedOptions);
    const imageModel = this.shouldUsePersonaReferenceImageModel(resolvedOptions)
      ? this.personaReferenceImageModel
      : this.flux;

    return imageModel.prompt(
      this.addStaticPrompt(safePrompt, options.staticPrompt),
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

  getEndFrameAnalysisConfig() {
    return this.config?.sceneLoop?.endFrameAnalysis || {};
  }

  getOpeningImageConfig() {
    return this.config?.sceneLoop?.openingImage || {};
  }

  getSceneContextImageConfig() {
    return this.config?.sceneLoop?.sceneContextImage || {};
  }

  async resolveMonsterContinuityReference() {
    const openingImageConfig = this.getOpeningImageConfig();
    const candidates = [
      {
        path: openingImageConfig?.personaReferencePath || openingImageConfig?.referenceImagePath,
        source: 'canonicalOriginalMonsterReference',
      },
      {
        path: openingImageConfig?.monsterContinuityAnchorPath,
        source: 'canonicalCompleteMonsterScene',
      },
      {
        path: this.lastMonsterFrame?.image?.path,
        source: 'lastCompleteMonsterSceneFallback',
      },
    ];

    for (const candidate of candidates) {
      const candidatePath = String(candidate.path || '').trim();
      if (candidatePath && await fs.pathExists(candidatePath)) {
        return { path: candidatePath, source: candidate.source };
      }
    }

    return { path: '', source: 'missing' };
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

  buildPersonaReferenceIdentityClause(options = {}) {
    return buildPersonaReferenceIdentityClauseFromConfig(this.getOpeningImageConfig(), options);
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
    const openingScene = openingImageOptions?.scenePlanEntry
      || sceneContext?.scenePlanEntry
      || {};
    const includeMonsterReference = shouldIncludeMonsterReference(openingScene);
    const monsterContinuityReference = includeMonsterReference
      ? await this.resolveMonsterContinuityReference()
      : { path: '', source: 'notNeeded' };
    if (includeMonsterReference && !monsterContinuityReference.path) {
      throw new Error(
        'Monster opening requires a complete Kaufhaus-monster reference image. Refusing to generate a prompt-only green creature.'
      );
    }
    const hasSceneContextImage = resolvedSceneContextImagePath
      && await fs.pathExists(resolvedSceneContextImagePath);
    const primaryImagePath = includeMonsterReference
      ? (hasSceneContextImage ? resolvedSceneContextImagePath : monsterContinuityReference.path)
      : (hasSceneContextImage ? resolvedSceneContextImagePath : resolvedReferenceImagePath);
    const referenceImages = includeMonsterReference
      && primaryImagePath !== monsterContinuityReference.path
      ? [{ path: monsterContinuityReference.path }]
      : [];

    const openingModelOptions = {
      ...(openingImageOptions?.model || {}),
      imagePath: primaryImagePath,
      images: referenceImages,
      contextReference: referenceImages.length > 0 ? { enabled: true } : undefined,
      prompt: generatedPrompt,
      sceneContext,
      frameRole: 'opening',
    };
    assertMonsterFreePromptSafety({
      scene: openingScene,
      prompt: generatedPrompt,
      referenceImages,
    });

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
            sceneFocus: openingScene.sceneFocus,
            monsterReferenceIncluded: includeMonsterReference && Boolean(monsterContinuityReference.path),
            monsterContinuityReferencePath: monsterContinuityReference.path,
            monsterContinuityReferenceSource: monsterContinuityReference.source,
            monsterIdentityState: includeMonsterReference ? 'canonical' : 'absent',
            canonicalMonsterReferenceUsed: includeMonsterReference,
            monsterEntryMode: includeMonsterReference ? 'freshCanonicalFlux' : 'none',
            monsterIdentityPipelineVersion: 2,
          },
        },
      };
    } catch (error) {
      logger.warn(`opening flux-context image generation failed, falling back to raw start image: ${error?.message || error}`);
      return null;
    }
  }

  buildSceneContextFluxPrompt({
    scenePlanEntry = {},
    sceneContext = {},
    contextImage = null,
    protagonistAlreadyCompositedOverride,
  } = {}) {
    const sceneContextImageConfig = this.getSceneContextImageConfig();
    const includeMonsterReference = shouldIncludeMonsterReference(scenePlanEntry);
    const protagonistAlreadyComposited = typeof protagonistAlreadyCompositedOverride === 'boolean'
      ? protagonistAlreadyCompositedOverride
      : sceneContextImageConfig?.protagonistAlreadyComposited === true;
    if (protagonistAlreadyComposited && !includeMonsterReference) {
      return [
        PHOTOGRAPHIC_REALISM_LOCK,
        LOCATION_RULE,
        'Continue from the supplied previous frame.',
        'Compose the new scene from its planned subjects and event.',
        scenePlanEntry.stillPrompt ? `Scene event: ${scenePlanEntry.stillPrompt}` : '',
        scenePlanEntry.consequence ? `Visible result: ${scenePlanEntry.consequence}` : '',
        'Preserve environmental continuity while applying the new semantic event.',
      ].filter(Boolean).join(' ');
    }
    if (!includeMonsterReference) {
      return buildEnvironmentSceneContextFluxPrompt({ scenePlanEntry, contextImage });
    }
    return buildMonsterSceneContextFluxPrompt({
      scenePlanEntry,
      contextImage,
      personaReferenceIdentityClause: this.buildPersonaReferenceIdentityClause({ subjectType: 'creature' }),
    });
  }

  buildSceneContextSemanticReconstructionPrompt({ scenePlanEntry = {}, sceneContext = {} } = {}) {
    if (!shouldIncludeMonsterReference(scenePlanEntry)) {
      return [
        'Edit the supplied Kaufhaus seed into the final semantic scene.',
        LOCATION_RULE,
        scenePlanEntry.stillPrompt,
        scenePlanEntry.consequence ? `Visible result: ${scenePlanEntry.consequence}` : '',
        'Output one realistic Kaufhaus photograph.',
      ].filter(Boolean).join(' ');
    }
    return buildMonsterSceneContextFluxPrompt({
      scenePlanEntry,
      personaReferenceIdentityClause: this.buildPersonaReferenceIdentityClause({ subjectType: 'creature' }),
    });
  }

  async generateSceneContextFluxFrame({
    scenePlanEntry = {},
    sceneContext = {},
    imageOptions = {},
    contextImageOverride = null,
    protagonistAlreadyCompositedOverride,
  } = {}) {
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
    const contextImage = contextImageOverride
      || contextImages[(sceneIndex - 1) % contextImages.length];
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
    const rawPrompt = this.buildSceneContextFluxPrompt({
      scenePlanEntry,
      sceneContext,
      contextImage,
      protagonistAlreadyCompositedOverride,
    });
    const prompt = compactFluxPromptForProvider({
      prompt: rawPrompt,
      scenePlanEntry,
      locationRule: 'Preserve supplied Kaufhaus as recognizable location: keep main geometry, camera perspective, floor, ceiling, columns, windows, walls, and elevators.',
      creatureRule: 'When visible, preserve supplied Green Monster identity, while allowing new pose, scale, and interaction.',
    });
    const protagonistAlreadyComposited = typeof protagonistAlreadyCompositedOverride === 'boolean'
      ? protagonistAlreadyCompositedOverride
      : sceneContextImageConfig?.protagonistAlreadyComposited === true;
    const includeMonsterReference = shouldIncludeMonsterReference(scenePlanEntry);
    const monsterContinuityReference = includeMonsterReference
      ? await this.resolveMonsterContinuityReference()
      : { path: '', source: 'notNeeded' };
    if (includeMonsterReference && !monsterContinuityReference.path) {
      throw new Error(
        `Scene ${sceneIndex} requires a complete Kaufhaus-monster reference image. Refusing to generate a prompt-only green creature.`
      );
    }
    const referenceImages = includeMonsterReference
      && monsterContinuityReference.path
      ? [{ path: monsterContinuityReference.path }]
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
    assertMonsterFreePromptSafety({
      scene: scenePlanEntry,
      prompt,
      referenceImages,
    });

    try {
      const generatedFrame = await this.openingFluxContextModel.prompt(prompt, modelOptions);
      const firstPassPath = String(
        generatedFrame?.image?.path
        || generatedFrame?.file
        || generatedFrame?.path
        || ''
      ).trim();
      if (sceneContextImageConfig?.semanticReconstructionPass === true && firstPassPath) {
        const rawReconstructionPrompt = this.buildSceneContextSemanticReconstructionPrompt({
          scenePlanEntry,
          sceneContext,
        });
        const reconstructionPrompt = compactFluxPromptForProvider({
          prompt: rawReconstructionPrompt,
          scenePlanEntry,
        });
        try {
          const reconstructedFrame = await this.openingFluxContextModel.prompt(
            reconstructionPrompt,
            {
              ...(sceneContextImageConfig?.model || {}),
              ...imageOptions,
              imagePath: firstPassPath,
              images: referenceImages,
              contextReference: referenceImages.length > 0 ? { enabled: true } : undefined,
              prompt: reconstructionPrompt,
              sceneContext,
              frameRole: 'scene-context-semantic-reconstruction',
            }
          );
          return {
            ...reconstructedFrame,
            json: {
              ...(reconstructedFrame?.json || {}),
              metadata: {
                ...(reconstructedFrame?.json?.metadata || {}),
                prompt: reconstructionPrompt,
                semanticReconstructionPass: true,
                semanticReconstructionSeedPath: firstPassPath,
                sceneContextImagePath: path.resolve(contextImagePath),
                protagonistReferencePath,
                monsterContinuityReferencePath: monsterContinuityReference.path,
                monsterContinuityReferenceSource: monsterContinuityReference.source,
                sceneIndex,
                sceneFocus: scenePlanEntry.sceneFocus,
                monsterReferenceIncluded: referenceImages.length > 0,
                monsterIdentityState: includeMonsterReference ? 'canonical' : 'absent',
                canonicalMonsterReferenceUsed: includeMonsterReference,
                monsterEntryMode: includeMonsterReference ? 'freshCanonicalFlux' : 'none',
                monsterIdentityPipelineVersion: 2,
              },
            },
          };
        } catch (error) {
          logger.warn(`scene semantic reconstruction failed, using identity seed: ${error?.message || error}`);
        }
      }
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
            monsterContinuityReferencePath: monsterContinuityReference.path,
            monsterContinuityReferenceSource: monsterContinuityReference.source,
            protagonistAlreadyComposited,
            sceneIndex,
            sceneFocus: scenePlanEntry.sceneFocus,
            monsterReferenceIncluded: referenceImages.length > 0,
            monsterIdentityState: includeMonsterReference ? 'canonical' : 'absent',
            canonicalMonsterReferenceUsed: includeMonsterReference,
            monsterEntryMode: includeMonsterReference ? 'freshCanonicalFlux' : 'none',
            monsterIdentityPipelineVersion: 2,
          },
        },
      };
    } catch (error) {
      logger.warn(`scene context flux image generation failed, falling back to existing start frame: ${error?.message || error}`);
      return null;
    }
  }

  async resolveNextSceneLocationReference({
    nextScenePlanEntry = {},
    nextSceneContext = {},
  } = {}) {
    const sceneContextConfig = this.getSceneContextImageConfig();
    const configuredImages = Array.isArray(sceneContextConfig?.images)
      ? sceneContextConfig.images
      : [];
    if (configuredImages.length === 0) {
      return null;
    }

    const sceneIndex = Math.max(1, Number(nextSceneContext?.index) || 1);
    const explicitPath = String(
      nextScenePlanEntry?.sceneContextImagePath
      || nextScenePlanEntry?.locationReferencePath
      || ''
    ).trim();
    const fallbackEntry = configuredImages[(sceneIndex - 1) % configuredImages.length];
    const selectedPath = explicitPath || String(
      typeof fallbackEntry === 'string' ? fallbackEntry : fallbackEntry?.path || ''
    ).trim();
    if (!selectedPath || !(await fs.pathExists(selectedPath))) {
      return null;
    }

    return {
      path: path.resolve(selectedPath),
      sourceType: explicitPath ? 'explicitSceneLocation' : 'mappedSceneLocation',
      sceneIndex,
    };
  }

  async shouldApplyDriftCorrection({ nextScenePlanEntry, nextSceneContext } = {}) {
    const driftCorrection = this.getDriftCorrectionConfig();
    if (!driftCorrection?.enabled || !this.driftCorrectionModel) {
      return false;
    }

    const startFrameStrategy = resolveSceneStartFrameStrategy(
      nextScenePlanEntry,
      Math.max(0, Number(nextSceneContext?.index || 1) - 1)
    );
    if (startFrameStrategy === 'locationReanchor'
      || nextScenePlanEntry?.monsterEntryMode === 'freshCanonicalFlux') {
      logger.info(`drift scene=${nextSceneContext?.index || '?'} skipped=fresh-location-reanchor`);
      return false;
    }

    const plannerDecision = shouldDriftCorrectLastFrame({
      scene: nextScenePlanEntry,
      sceneIndex: Math.max(0, Number(nextSceneContext?.index || 1) - 1),
      plannerControlEnabled: driftCorrection.plannerControlled === true,
    });
    const videoMode = String(nextScenePlanEntry?.videoMode || '').trim();
    const frameSource = String(nextScenePlanEntry?.frameSource || '').trim();
    if (videoMode === 'firstLast' && driftCorrection.applyToFirstLast !== true) {
      return false;
    }
    if (videoMode === 'singleImage' && frameSource === 'lastFrame' && driftCorrection.applyToSingleImage !== true) {
      return false;
    }

    const localLocationReference = typeof this.resolveNextSceneLocationReference === 'function'
      ? await this.resolveNextSceneLocationReference({ nextScenePlanEntry, nextSceneContext })
      : null;
    const lastFrameMetadata = this.lastEndFRame?.json?.metadata || {};
    const previousLocationPath = String(lastFrameMetadata.sceneContextImagePath || '').trim();
    const analysisText = String(
      lastFrameMetadata.endFrameAnalysis || lastFrameMetadata.endFrameContinuity || ''
    );
    const reasons = [];
    if (plannerDecision === true) reasons.push('planner-request');
    if (plannerDecision === null
      && driftCorrection.plannerControlled !== true
      && driftCorrection.localLocationPercent === undefined) {
      reasons.push('compatibility-enabled-profile');
    }
    if (Number(nextSceneContext?.rawLastFrameStreak) >= Number(driftCorrection.maxConsecutiveRawLastFrames || 2)) {
      reasons.push('raw-last-frame-streak');
    }
    if (/location drift|geometry drift|wrong (?:room|location)|different (?:room|location)|warped (?:room|geometry)/i.test(analysisText)) {
      reasons.push('visible-location-drift');
    }
    if (localLocationReference?.path && previousLocationPath
      && path.resolve(previousLocationPath) !== localLocationReference.path) {
      reasons.push('mapped-location-change');
    }
    if (shouldIncludeMonsterReference(nextScenePlanEntry)
      && lastFrameMetadata.monsterIdentityState !== 'canonical') {
      reasons.push('unknown-monster-identity');
    }

    const deterministicKey = [
      (typeof this.getOpeningImageConfig === 'function'
        ? this.getOpeningImageConfig()?.storyRunIndex
        : null) || 1,
      nextSceneContext?.index || 1,
      nextScenePlanEntry?.semanticAnchor || '',
      nextScenePlanEntry?.semanticCollision || '',
    ].join('|');
    if (deterministicPercentDecision(deterministicKey, driftCorrection.localLocationPercent)) {
      reasons.push('deterministic-local-selection');
    }

    const apply = reasons.length > 0;
    nextSceneContext.driftCorrectionReason = reasons.join(',');
    nextSceneContext.driftCorrectionFocus = resolveDriftCorrectionFocus(nextScenePlanEntry);
    logger.info(
      `drift scene=${nextSceneContext?.index || '?'} apply=${apply} reason=${reasons.join(',') || 'none'} focus=${nextSceneContext.driftCorrectionFocus} local=${localLocationReference?.path || 'none'}`
    );
    return apply;
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
    this.contextScreenshotBuffer.push(path.resolve(resolvedPath));
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

  buildDriftCorrectionPrompt({
    lastFrame,
    nextScenePlanEntry,
    nextSceneContext,
    localLocationReference,
  }) {
    const includesMonster = shouldIncludeMonsterReference(nextScenePlanEntry);
    const openingImageConfig = this.getOpeningImageConfig();
    const isMonsterPipeline = Boolean(openingImageConfig?.monsterContinuityAnchorPath);
    const genericPersonaIdentity = isMonsterPipeline
      ? ''
      : buildPersonaReferenceIdentityClauseFromConfig(openingImageConfig, {
        subjectType: 'person',
      });
    const genericContinuity = String(
      openingImageConfig?.continuityAnchor || openingImageConfig?.continuityVisionText || ''
    ).trim();
    const endFrameContinuity = compactPromptFragment(
      lastFrame?.json?.metadata?.endFrameContinuity,
      360
    );
    return [
      PHOTOGRAPHIC_REALISM_LOCK,
      includesMonster ? CANONICAL_MONSTER_REALISM_LOCK : '',
      'Edit the supplied WAN end frame only enough to repair local continuity drift.',
      localLocationReference?.path
        ? 'Use the supplied local Kaufhaus reference as the canonical identity of this part of the building.'
        : 'Preserve the recognizable Kaufhaus geometry already visible in the frame.',
      'Restore local geometry, dusty matte concrete, sweep marks, exposed ducts and wiring, fluorescent fixtures, columns, windows, elevators, plain walls, perspective, mixed-light family and ordinary construction texture when they have drifted.',
      'Match the reference as unretouched documentary appearance: modest dynamic range, imperfect exposure, slight wide-angle distortion, natural noise and no glossy finish.',
      'Do not reset the frame to a generic opening composition.',
      'Do not replace the current room with a different Kaufhaus interior, polished mall, studio set, warehouse fantasy or CGI hall.',
      'Do not erase the planned semantic event or its visible consequence.',
      'Do not add unrelated props or architectural features.',
      !isMonsterPipeline
        ? [
          genericPersonaIdentity,
          genericContinuity ? `Canonical opening continuity: ${genericContinuity}` : '',
          'Preserve the existing real person and current action without changing identity.',
        ].filter(Boolean).join(' ')
        : includesMonster
        ? 'The canonical monster reference is supplied separately. Repair only identity drift in the already planned protagonist. Preserve its exact elongated bark face, proportions, amber eye placement, two leaf ears, mouth tendril and botanical anatomy. Preserve pose and event. Do not create a second creature or redesign the protagonist.'
        : 'This next scene is monster-free. Remove any accidental monster, generic green creature, green humanoid, plant person, creature-shaped shadow or substitute protagonist. Do not add a new living figure.',
      endFrameContinuity ? `Visible continuity to retain: ${endFrameContinuity}` : '',
      nextScenePlanEntry?.stillPrompt
        ? `Preserve the next scene event: ${nextScenePlanEntry.stillPrompt}`
        : '',
      nextScenePlanEntry?.consequence
        ? `Preserve this intended visible result: ${nextScenePlanEntry.consequence}`
        : '',
      `Drift focus: ${resolveDriftCorrectionFocus(nextScenePlanEntry)}.`,
      'Apply only moderate drift handling.',
      'Keep the correction local and moderate.',
      'Output one realistic corrected Kaufhaus frame.',
    ].filter(Boolean).join(' ');
  }

  buildEndFrameAnalysisPrompt({ nextScenePlanEntry = {}, nextSceneContext = {} } = {}) {
    const nextTitle = String(nextScenePlanEntry?.title || '').trim();
    const nextBeat = String(
      nextScenePlanEntry?.storyBeat
      || nextScenePlanEntry?.beat
      || nextSceneContext?.storyBeat
      || ''
    ).trim();

    return [
      'Describe only this final video frame for the next scene continuity.',
      'Return concise labeled lines: Subject, Setting, Framing, Lighting, Visible transformation, and Continuity.',
      'State exact pose, silhouette, objects, spatial layout, light direction, and any semantic mutation that must carry forward.',
      'Do not invent off-screen action, hidden objects, text, names, or a different location.',
      nextTitle ? `The next planned scene is: ${nextTitle}.` : '',
      nextBeat ? `Its planned new event is: ${nextBeat}.` : '',
    ].filter(Boolean).join(' ');
  }

  async analyzeLastFrameForNextScene({ lastFrame, nextScenePlanEntry, nextSceneContext } = {}) {
    const endFrameAnalysis = this.getEndFrameAnalysisConfig();
    const analyzeFrame = endFrameAnalysis?.analyzeFrame;
    const lastFramePath = String(lastFrame?.image?.path || '').trim();
    if (endFrameAnalysis?.enabled !== true || typeof analyzeFrame !== 'function' || !lastFramePath) {
      return lastFrame;
    }

    try {
      const analysisPrompt = String(endFrameAnalysis.prompt || '').trim()
        || this.buildEndFrameAnalysisPrompt({ nextScenePlanEntry, nextSceneContext });
      const analysisResult = await analyzeFrame(lastFrame, { prompt: analysisPrompt });
      const outputText = normalizeVisionText(
        typeof analysisResult === 'string'
          ? analysisResult
          : analysisResult?.outputText
      );
      const continuity = compactPromptFragment(
        summarizeVisionStoryContext(outputText) || outputText,
        240
      );
      if (!continuity) {
        return lastFrame;
      }

      return {
        ...lastFrame,
        json: {
          ...(lastFrame?.json || {}),
          metadata: {
            ...(lastFrame?.json?.metadata || {}),
            endFrameAnalysis: outputText,
            endFrameContinuity: continuity,
            endFrameAnalysisForScene: String(nextSceneContext?.index || ''),
          },
        },
      };
    } catch (error) {
      logger.warn(`end-frame analysis failed, continuing without it: ${error?.message || error}`);
      return lastFrame;
    }
  }

  async resolveDriftCorrectionReferenceImage({ lastFrame } = {}) {
    const driftCorrection = this.getDriftCorrectionConfig();
    const referenceImageConfig = driftCorrection?.referenceImage || null;
    const lastFramePath = lastFrame?.image?.path || '';

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
    const localLocationReference = typeof this.resolveNextSceneLocationReference === 'function'
      ? await this.resolveNextSceneLocationReference({ nextScenePlanEntry, nextSceneContext })
      : null;
    const includesMonster = shouldIncludeMonsterReference(nextScenePlanEntry);
    const monsterContinuityReference = includesMonster
      ? await this.resolveMonsterContinuityReference()
      : { path: '', source: 'notNeeded' };
    const contextBufferConfig = this.getContextBufferConfig();
    let contextScreenshotPaths = [];
    if (contextBufferConfig.enabled) {
      contextScreenshotPaths = await this.updateContextScreenshotBuffer({
        referenceImage: { ...referenceImage, path: referenceImagePath },
        contextBufferConfig,
      });
    }
    const monsterPipeline = Boolean(openingImageConfig?.monsterContinuityAnchorPath);
    const usefulOpeningImagePath = !monsterPipeline || includesMonster ? openingImagePath : '';
    const secondaryReferencePaths = uniquePaths([
      localLocationReference?.path,
      includesMonster ? monsterContinuityReference.path : '',
      usefulOpeningImagePath,
      referenceImagePath !== primaryInputPath ? referenceImagePath : '',
      ...contextScreenshotPaths,
    ]).filter((entryPath) => entryPath !== path.resolve(primaryInputPath));

    const cameraHoldNegativePrompt = driftCorrection?.cameraMode
      ? 'heavy blur, motion smear, double exposure, silhouette, rear view, hidden face, changed room'
      : '';
    const correctionPrompt = this.buildDriftCorrectionPrompt({
      lastFrame,
      nextScenePlanEntry,
      nextSceneContext,
      localLocationReference,
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
        monsterPipeline && !includesMonster
          ? 'monster, green creature, green humanoid, plant person, creature-shaped shadow, substitute protagonist'
          : '',
      ].filter(Boolean).join(', '),
      seed: driftCorrection?.model?.seed,
      width: driftCorrection?.model?.width,
      height: driftCorrection?.model?.height,
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
          driftCorrectionFocus: resolveDriftCorrectionFocus(nextScenePlanEntry),
          driftCorrectionReason: nextSceneContext?.driftCorrectionReason || '',
          driftCorrectionLocalLocationPath: localLocationReference?.path || '',
          driftCorrectionLocalLocationSource: localLocationReference?.sourceType || '',
          driftCorrectionMonsterReferenceIncluded: includesMonster && Boolean(monsterContinuityReference.path),
          driftCorrectionMonsterReferencePath: includesMonster ? monsterContinuityReference.path : '',
          monsterIdentityState: includesMonster && monsterContinuityReference.path ? 'canonical' : 'absent',
          canonicalMonsterReferenceUsed: includesMonster && Boolean(monsterContinuityReference.path),
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
    const analyzedLastFrame = typeof this.analyzeLastFrameForNextScene === 'function'
      ? await this.analyzeLastFrameForNextScene({
        lastFrame: this.lastEndFRame,
        nextScenePlanEntry,
        nextSceneContext,
      })
      : this.lastEndFRame;
    if (!await this.shouldApplyDriftCorrection({ nextScenePlanEntry, nextSceneContext })) {
      return analyzedLastFrame;
    }

    try {
      return await this.correctLastFrameForNextScene({
        lastFrame: analyzedLastFrame,
        nextScenePlanEntry,
        nextSceneContext,
      });
    } catch (error) {
      logger.warn(`Drift correction failed, falling back to raw last frame: ${error?.message || error}`);
      return analyzedLastFrame;
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
    const rawVideoCandidates = Array.isArray(videoRunOptions.videoTypeCandidates) && videoRunOptions.videoTypeCandidates.length > 0
      ? videoRunOptions.videoTypeCandidates
      : [videoType];
    const videoCandidates = dedupeVideoCandidates(rawVideoCandidates);
    let lastError = null;

    for (let index = 0; index < videoCandidates.length; index += 1) {
      const activeVideoType = videoCandidates[index];
      try {
        const providerDuration = resolveProviderDuration({
          durationSeconds: mergedConfig?.duration_seconds,
          videoModelType: activeVideoType?.config?.type || mergedConfig?.type || this.config?.model?.type,
          model: activeVideoType?.config?.model || mergedConfig?.model || this.config?.model?.model,
        });
        const activeMergedConfig = {
          ...mergedConfig,
          duration_seconds: providerDuration.durationSeconds,
          providerDurationRule: providerDuration.rule,
        };
        this.repeatVideoGeneration = createRepeatVideoGeneration({
          videoType: activeVideoType,
          startFrame,
          mergedConfig: activeMergedConfig,
        });

        const videoData = await this.repeatVideoGeneration();
        delete this.repeatVideoGeneration;
        mergedConfig.duration_seconds = providerDuration.durationSeconds;
        mergedConfig.providerDurationRule = providerDuration.rule;
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
      await saveJSON(lastPngPath, this.lastEndFRame.json.metadata);
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
    const scenePlanEntry = getScenePlanEntry(options?.sceneLoop, options?.sceneContext);
    const startFrameMetadata = startFrame?.json?.metadata || {};
    if (shouldIncludeMonsterReference(scenePlanEntry)
      && startFrameMetadata.monsterIdentityState !== 'canonical') {
      throw new Error(
        `Scene ${options?.sceneContext?.index || '?'}: WAN cannot introduce the monster from a non-canonical start frame.`
      );
    }
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
    assertMonsterFreePromptSafety({
      scene: scenePlanEntry,
      prompt: generatedPrompt,
      referenceImages: [],
    });

    const mergedConfig = this.buildVideoConfig(
      generatedPrompt,
      videoModel,
      startFrame,
      clipOptions
    );
    const requestedDuration = capVideoDurationForBackend(
      await resolveRequestedDurationOption(
        // A scene plan owns its rhythm. The model's duration is only the
        // fallback default when this clip has no planned beat length.
        clipOptions?.sceneContext?.durationSeconds,
        mergedConfig?.duration_seconds
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
      const preQuantizedDuration = Number(resolvedDuration);
      mergedConfig.duration_seconds = preQuantizedDuration;
      if (clipOptions?.sceneContext) {
        clipOptions.sceneContext.preQuantizedDurationSeconds = preQuantizedDuration;
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

    if (clipOptions?.sceneContext) {
      clipOptions.sceneContext.providerDurationSeconds = mergedConfig.duration_seconds;
      clipOptions.sceneContext.providerDurationRule = mergedConfig.providerDurationRule || 'provider-native-duration';
      clipOptions.sceneContext.durationSeconds = mergedConfig.duration_seconds;
    }

    await this.finalizeGeneratedVideo({
      videoData,
      mergedConfig,
      requestedDuration: mergedConfig.duration_seconds,
      captureLastFrame,
      startFrame,
      endFramePrompt: generatedPrompt || mergedConfig.prompt || startFrame.json?.metadata?.prompt,
      endFrameImagePath: endFrameOverride?.path || null,
    });

    return { generatedPrompt, mergedConfig, videoData };
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

    let endCardResult = null;
    if (sceneLoop.endCard?.enabled === true) {
      const stream = await probeVideoStream(clipPaths[0]);
      const lastSceneFramePath = path.join(
        this.imageDir,
        'parts',
        'end-card',
        'last-scene-frame.png'
      );
      // ffmpeg writes this frame directly and cannot create its parent folder.
      // A resumed scene loop may reach the end card before that folder exists.
      await fs.ensureDir(path.dirname(lastSceneFramePath));
      await extractLastFrame(clipPaths[clipPaths.length - 1], lastSceneFramePath);
      const endCardImagePath = path.join(this.imageDir, 'parts', 'end-card', 'trailer-end-card.png');
      endCardResult = await renderExhibitionEndCard({
        dossierPath: sceneLoop.endCard.dossierPath,
        outputPath: endCardImagePath,
        backgroundImagePath: lastSceneFramePath,
        width: stream.width || sceneLoop.endCard.width || 1184,
        height: stream.height || sceneLoop.endCard.height || 880,
      });
      const endCardVideoPath = await createStillVideoClip(
        endCardResult.path,
        path.join(mergedOutDir, `${fileName}-end-card.mp4`),
        {
          durationSeconds: Number(sceneLoop.endCard.durationSeconds) || 4,
          width: stream.width || endCardResult.width,
          height: stream.height || endCardResult.height,
          fps: stream.fps || 24,
        }
      );
      clipPaths.push(endCardVideoPath);
      endCardResult.videoPath = endCardVideoPath;
    }

    const concatenatedVideoPath = clipPaths.length === 1
      ? clipPaths[0]
      : sceneLoop.collisionTransitions?.enabled === true
        ? await concatTrailerWithCollisionCuts(
          clipPaths,
          path.join(mergedOutDir, `${fileName}-collision-cut.mp4`),
          sceneLoop.collisionTransitions
        )
        : await concatMp4Lossless(
          clipPaths,
          path.join(mergedOutDir, `${fileName}-concat.mp4`),
          mergedOutDir
        );

    const totalTrackDuration = await probeVideoDurationSeconds(concatenatedVideoPath);
    const fallbackMireloPrompt = clipResults
      .map((clip) => clip.generatedPrompt)
      .filter(Boolean)
      .join('\n\n')
      || startFrame.json?.metadata?.prompt;
    const mireloPrompt = buildSemanticMireloPrompt({
      semanticWords: sceneLoop.semanticWords,
      scenePlan: sceneLoop.scenePlan,
      fallbackPrompt: fallbackMireloPrompt,
    });

    const sceneLoopSummary = {
      sceneCount: clipResults.length,
      totalTrackDuration,
      concatenatedVideoPath,
      mireloMode: sceneLoop.mireloMode || 'finalOnly',
      endCard: endCardResult,
      clips: clipResults.map((clip) => ({
        index: clip.index,
        title: clip.scenePlanEntry?.title || '',
        durationSeconds: clip.sceneContext?.durationSeconds || null,
        rawTaktmusterDuration: clip.sceneContext?.rawTaktmusterDuration ?? null,
        curvedDurationSeconds: clip.sceneContext?.curvedDurationSeconds ?? null,
        preQuantizedDurationSeconds: clip.sceneContext?.preQuantizedDurationSeconds ?? null,
        providerDurationSeconds: clip.sceneContext?.providerDurationSeconds ?? null,
        rhythmCurve: clip.sceneContext?.rhythmCurve || '',
        rhythmCurveExponent: clip.sceneContext?.rhythmCurveExponent ?? null,
        providerDurationRule: clip.sceneContext?.providerDurationRule || '',
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
    console.log(
      '[shorty-book:duration]',
      `preQuantized=${sceneLoopSummary.clips.map((clip) => clip.preQuantizedDurationSeconds).join(',')} | provider=${sceneLoopSummary.clips.map((clip) => clip.providerDurationSeconds).join(',')} | rules=${[...new Set(sceneLoopSummary.clips.map((clip) => clip.providerDurationRule).filter(Boolean))].join(',')}`
    );

    if (sceneLoop.mireloMode === 'afterEachVideo' || sceneLoop.mireloMode === 'off') {
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
      sceneContext.title = scenePlanEntry?.title || '';
      sceneContext.storyBeat = scenePlanEntry?.storyBeat || scenePlanEntry?.beat || '';
      sceneContext.plannedDurationSeconds = Number(scenePlanEntry?.durationSeconds) || null;
      sceneContext.durationSeconds = Number(scenePlanEntry?.requestedDurationSeconds)
        || sceneContext.plannedDurationSeconds;
      sceneContext.rawTaktmusterDuration = scenePlanEntry?.rawTaktmusterDuration ?? null;
      sceneContext.curvedDurationSeconds = scenePlanEntry?.curvedDurationSeconds ?? null;
      sceneContext.preQuantizedDurationSeconds = scenePlanEntry?.preQuantizedDurationSeconds
        ?? sceneContext.durationSeconds;
      sceneContext.rhythmCurve = scenePlanEntry?.rhythmCurve || '';
      sceneContext.rhythmCurveExponent = scenePlanEntry?.rhythmCurveExponent ?? null;
      sceneContext.frameSource = isFirstClip
        ? (loopStartsFromLastFrame
          ? 'lastFrame'
          : (openingImageSourceType || scenePlanEntry?.frameSource || 'newImage'))
        : (scenePlanEntry?.frameSource || 'lastFrame');
      sceneContext.startFrameStrategy = resolveSceneStartFrameStrategy(scenePlanEntry, index);
      sceneContext.startFrameReason = scenePlanEntry?.startFrameReason || '';
      const plannerControlsStartFrames = sceneLoop.startFrameStrategy?.enabled === true;
      const previousScenePlanEntry = index > 0
        ? getScenePlanEntry(sceneLoop, { index, total: clipCount })
        : null;
      const requiresMonsterIdentitySeed = needsMonsterIdentitySeed({
        scene: scenePlanEntry,
        previousScene: previousScenePlanEntry,
      });
      const mustStartMonsterFresh = sceneLoop.monsterVisibleAlwaysFresh === true
        && shouldIncludeMonsterReference(scenePlanEntry);
      const needsLocationStartFrame = shouldGenerateLocationStartFrame({
        scene: scenePlanEntry,
        sceneIndex: index,
        plannerControlEnabled: plannerControlsStartFrames,
      }) || requiresMonsterIdentitySeed || mustStartMonsterFresh;
      const sceneContextFrame = needsLocationStartFrame
        && typeof this.generateSceneContextFluxFrame === 'function'
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
      if (!sceneContextFrame && useFreshImage) {
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
        if (endFrameOverride?.path) {
          await this.refreshPersonaReferenceFromCameraShot(endFrameOverride.path, sceneContext);
        }
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
      if (shouldIncludeMonsterReference(scenePlanEntry) && this.lastEndFRame?.image?.path) {
        this.lastMonsterFrame = this.lastEndFRame;
      }

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

      const asyncPersonaReferenceConfig = this.getAsyncPersonaReferenceConfig();
      const forceByBeat = typeof this.shouldCapturePersonaReferenceForBeat === 'function'
        ? this.shouldCapturePersonaReferenceForBeat(asyncPersonaReferenceConfig, sceneContext)
        : false;
      void this.scheduleAsyncPersonaReferenceCapture(sceneContext, { forceByBeat });

      await saveJSON(
        path.join(promptDir, `${String(index + 1).padStart(2, '0')}-scene-prompt.json`),
        {
          sceneIndex: index + 1,
          sceneTitle: scenePlanEntry?.title || '',
          durationSeconds: sceneContext.durationSeconds,
          plannedDurationSeconds: sceneContext.plannedDurationSeconds,
          rawTaktmusterDuration: sceneContext.rawTaktmusterDuration,
          curvedDurationSeconds: sceneContext.curvedDurationSeconds,
          preQuantizedDurationSeconds: sceneContext.preQuantizedDurationSeconds,
          providerDurationSeconds: sceneContext.providerDurationSeconds,
          rhythmCurve: sceneContext.rhythmCurve,
          rhythmCurveExponent: sceneContext.rhythmCurveExponent,
          providerDurationRule: sceneContext.providerDurationRule,
          frameSource: sceneContext.frameSource || scenePlanEntry?.frameSource || '',
          startFrameStrategy: sceneContext.startFrameStrategy,
          startFrameReason: sceneContext.startFrameReason,
          videoMode: useSingleImage ? 'singleImage' : 'firstLast',
          prompt: clipResult.generatedPrompt || clipResult.mergedConfig?.prompt || '',
          startFramePath: currentStartFrame?.image?.path || '',
          sceneContextImagePath: currentStartFrame?.json?.metadata?.sceneContextImagePath || '',
          sceneContextImageUrl: currentStartFrame?.json?.metadata?.sceneContextImageUrl || '',
          endFramePath: endFrameOverride?.path || null,
          nextStartFrameSourcePath: this.lastEndFRame?.image?.path || '',
          videoFile: clipVideoFile,
        }
      );

      const hasNextScene = index + 1 < clipCount;
      const shouldPrepareNextChainedFrame = plannerControlsStartFrames || !useFreshImage;
      if (hasNextScene && shouldPrepareNextChainedFrame && this.lastEndFRame) {
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
        if (nextSceneContext) {
          let rawLastFrameStreak = 0;
          for (let planIndex = index + 1; planIndex >= 0; planIndex -= 1) {
            const candidate = getScenePlanEntry(sceneLoop, {
              index: planIndex + 1,
              total: clipCount,
            });
            if (resolveSceneStartFrameStrategy(candidate, planIndex) !== 'rawLastFrame') break;
            rawLastFrameStreak += 1;
          }
          nextSceneContext.rawLastFrameStreak = rawLastFrameStreak;
        }
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
    const chainFromPreviousLoopLastFrame = sceneLoop.chainFromPreviousLoopLastFrame !== false;
    if (!this.lastEndFRame && sceneLoop.restartFromPreviousMovieLastFrame) {
      this.lastEndFRame = await restorePreviousMovieLastFrame({
        imageDir: this.imageDir,
        requirePipelineVersion: true,
      });
      if (this.lastEndFRame) {
        logger.payload('restored previous movie last frame', this.lastEndFRame);
      }
    }
    const promptDir = path.join(this.imageDir, 'parts', 'scene-prompts');
    await fs.ensureDir(promptDir);
    const loopStartsFromLastFrame = chainFromPreviousLoopLastFrame && !!this.lastEndFRame;
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

  async promptSceneImagesOnly(options, fileName) {
    const sceneLoop = options.sceneLoop || {};
    const scenePlan = Array.isArray(sceneLoop.scenePlan) ? sceneLoop.scenePlan : [];
    if (scenePlan.length === 0) {
      throw new Error('Image-only test requires a generated scene plan.');
    }

    const runIndex = Math.max(1, Number(sceneLoop.imageOnly?.runIndex) || 1);
    const sceneNumberOffset = Math.max(
      0,
      Number(sceneLoop.imageOnly?.sceneNumberOffset) || 0
    );
    const outputDir = path.join(this.imageDir, 'parts', 'image-only-scenes');
    await fs.ensureDir(outputDir);

    const generatedScenes = [];
    let previousSceneOutputPath = String(
      sceneLoop.imageOnly?.previousScenePath || ''
    ).trim();
    if (previousSceneOutputPath && !(await fs.pathExists(previousSceneOutputPath))) {
      throw new Error(`Image-only previous scene is missing: ${previousSceneOutputPath}`);
    }
    for (let index = 0; index < scenePlan.length; index += 1) {
      const scenePlanEntry = scenePlan[index];
      const sceneNumber = sceneNumberOffset + index + 1;
      const startFrameStrategy = String(scenePlanEntry?.startFrameStrategy || '').trim();
      const continueFromPreviousScene = Boolean(previousSceneOutputPath)
        && ['driftCorrectedLastFrame', 'rawLastFrame'].includes(startFrameStrategy);
      const previousScenePlanEntry = index > 0
        ? scenePlan[index - 1]
        : null;
      const requiresMonsterIdentitySeed = needsMonsterIdentitySeed({
        scene: scenePlanEntry,
        previousScene: previousScenePlanEntry,
      });
      const sceneContext = {
        index: sceneNumber,
        total: sceneNumberOffset + scenePlan.length,
        isFirst: sceneNumber === 1,
        isLast: index === scenePlan.length - 1,
        title: scenePlanEntry?.title || '',
        storyBeat: scenePlanEntry?.storyBeat || scenePlanEntry?.beat || '',
      };
      const generatedFrame = await this.generateSceneContextFluxFrame({
        scenePlanEntry,
        sceneContext,
        imageOptions: options.image || {},
        contextImageOverride: continueFromPreviousScene && !requiresMonsterIdentitySeed
          ? { path: previousSceneOutputPath }
          : null,
        protagonistAlreadyCompositedOverride: continueFromPreviousScene && !requiresMonsterIdentitySeed
          ? true
          : undefined,
      });
      const generatedPath = String(generatedFrame?.image?.path || '').trim();
      if (!generatedPath || !(await fs.pathExists(generatedPath))) {
        throw new Error(`Image-only scene ${sceneNumber} returned no usable image.`);
      }

      const extension = path.extname(generatedPath) || '.png';
      const sceneFileName = [
        `run-${String(runIndex).padStart(2, '0')}`,
        `scene-${String(sceneNumber).padStart(2, '0')}`,
      ].join('-');
      const sceneOutputPath = path.join(outputDir, `${sceneFileName}${extension}`);
      await fs.copy(generatedPath, sceneOutputPath, { overwrite: true });
      previousSceneOutputPath = sceneOutputPath;

      generatedScenes.push({
        runIndex,
        sceneIndex: sceneNumber,
        title: scenePlanEntry?.title || '',
        semanticAnchor: scenePlanEntry?.semanticAnchor || '',
        semanticCollision: scenePlanEntry?.semanticCollision || '',
        sceneFocus: scenePlanEntry?.sceneFocus || 'location',
        event: scenePlanEntry?.event || sceneContext.storyBeat,
        monsterPresence: scenePlanEntry?.monsterPresence || '',
        monsterReferenceIncluded: generatedFrame?.json?.metadata?.monsterReferenceIncluded === true,
        consequence: scenePlanEntry?.consequence || '',
        stillPrompt: scenePlanEntry?.stillPrompt || '',
        generatedPrompt: generatedFrame?.json?.metadata?.prompt || '',
        generatedImagePath: sceneOutputPath,
      });
      logger.info(`Image-only run ${runIndex}, scene ${sceneNumber}: ${sceneOutputPath}`);
    }

    if (sceneLoop.endCard?.enabled === true) {
      const lastSceneImagePath = generatedScenes[generatedScenes.length - 1]?.outputPath || '';
      const endCardOutputPath = path.join(
        outputDir,
        `run-${String(runIndex).padStart(2, '0')}-end-card.png`
      );
      const endCard = await renderExhibitionEndCard({
        dossierPath: sceneLoop.endCard.dossierPath,
        outputPath: endCardOutputPath,
        backgroundImagePath: lastSceneImagePath,
        width: Number(sceneLoop.endCard.width) || 1184,
        height: Number(sceneLoop.endCard.height) || 880,
      });
      generatedScenes.push({
        runIndex,
        sceneIndex: scenePlan.length + 1,
        type: 'endCard',
        title: endCard.data.title,
        artists: endCard.data.artists,
        outputPath: endCard.path,
      });
      logger.info(`Image-only run ${runIndex}, end card: ${endCard.path}`);
    }

    const summaryPath = path.join(
      outputDir,
      `run-${String(runIndex).padStart(2, '0')}-summary.json`
    );
    let summaryScenes = generatedScenes;
    if (await fs.pathExists(summaryPath)) {
      const previousSummary = await fs.readJson(summaryPath);
      const replacedSceneNumbers = new Set(
        generatedScenes.map((scene) => Number(scene.sceneIndex))
      );
      const preservedScenes = Array.isArray(previousSummary?.scenes)
        ? previousSummary.scenes.filter(
          (scene) => !replacedSceneNumbers.has(Number(scene?.sceneIndex))
        )
        : [];
      summaryScenes = [...preservedScenes, ...generatedScenes].sort(
        (left, right) => Number(left?.sceneIndex) - Number(right?.sceneIndex)
      );
    }

    const summary = await saveJSON(
      summaryPath,
      {
        mode: 'image-only',
        runIndex,
        generatedAt: new Date().toISOString(),
        requestName: fileName,
        scenes: summaryScenes,
      }
    );
    logger.info(`Image-only run ${runIndex} complete: ${outputDir}`);
    return summary;
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

      if (options.sceneLoop?.imageOnly?.enabled === true) {
        return await this.promptSceneImagesOnly(options, fileName);
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
        requestedDuration: mergedConfig.duration_seconds,
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
