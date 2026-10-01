import path from 'node:path';

import {
  createEmergencyScenePlan,
  generateScenePlanWithFallback,
  resolveSceneCountFromConfig,
  resolveSceneLengthsInput,
} from '../helpers/scene-generator.js';
import {
  extractVisionStoryContext,
  summarizeVisionStoryContext,
} from '../helpers/frame-vision.js';
import {
  captureWebcamImage,
  createWebcamFrameVision,
  createWebcamVisionStoreHandler,
  describeWebcamCameraScenePlanIssues,
  sanitizeWebcamCameraScenePlan,
} from './webcam-defaults.js';
import {
  buildOpeningFluxContextPrompt,
  shouldUseOpeningFluxContextImage,
} from './opening-start.js';
import {
  isReferenceImageActorMode,
  parsePositiveNumber,
  pickEnvValue,
} from './LiveContextOrchestrator-config.js';
import {
  normalizeDriftCorrectionLevel,
  resolveDriftCorrectionModelConfig,
  resolveDriftCorrectionProfile,
} from './drift-correction.js';
import { buildSourceCues, resolveSemanticSceneCount } from './source-cues.js';
import { adaptSelfomatScenePlan } from './selfomat.js';
import { createSelfomatSession, createSelfomatAnnouncement } from './selfomat-session.js';
import { saveSelfomatRunLog } from './selfomat-run-log.js';
import { createSceneRhythmController } from './runtime/scene-rhythm.js';
import { logSceneLoopSummary } from './runtime/scene-loop-log.js';
import { prepareStoryIteration } from './runtime/story-iteration.js';
import { createMediaProviders } from './runtime/media-providers.js';
import { createCameraSnapshotArtifactSaver } from './runtime/artifacts.js';
import { createSceneLoopPrompt } from './runtime/scene-loop.js';
import {
  createDriftCorrectionConfig,
  createSceneLoopConfig,
} from './runtime/loop-config.js';
import { createRuntimeProviders } from './runtime/providers.js';
import {
  attachCastReferencesToScenePlan,
  createStoryTransportController,
  formatStoryTransportForPrompt,
  saveStoryTransportArtifact,
} from './story-transport.js';

import runtimeValues from './runtime/config.js';

const {
  PROJECT_ROOT,
  openai,
  LOCAL_MISTRAL_MODEL,
  localMistralChatFallback,
  CHAT_MODEL,
  ENABLE_PAID_FAL_FALLBACKS,
  RETRY_ON_FAILURE,
  MAX_ITERATIONS,
  VIDEO_MAX_RETRIES_ON_FAILURE,
  VIDEO_RETRY_DELAY_MS,
  SCENE_PLAN_TEMPERATURE,
  SCENE_PLAN_TOP_P,
  SELFOMAT_ENABLED,
  SELFOMAT_IMAGE_ONLY,
  SELFOMAT_DRY_RUN,
  VISION_MAX_TOKENS,
  USE_WEBCAM_PERSONA_REFERENCE,
  WEBCAM_PERSONA_REFERENCE_MODEL,
  WEBCAM_PERSONA_REFERENCE_PROVIDER,
  ASYNC_WEBCAM_PERSONA_REFERENCE_UPDATES,
  ASYNC_WEBCAM_PERSONA_REFERENCE_INTERVAL,
  ASYNC_WEBCAM_PERSONA_REFERENCE_BURST_COUNT,
  ASYNC_WEBCAM_PERSONA_REFERENCE_MIN_BEAT_SECONDS,
  DRIFT_CORRECTION_STEPS_INPUT,
  DRIFT_CORRECTION_GUIDANCE_INPUT,
  TEST_INPUT_IMAGE_PATH,
  TEST_INPUT_IMAGE_FOLDER,
  TEST_INPUT_IMAGE_VISION_TEXT,
  TEST_INPUT_IMAGE_MODE,
  CAMERA_PERSON_QUEUE_PATH,
  CAMERA_PERSON_QUEUE_CONSUMED_PATH,
  CAMERA_OUTPUT_DIR,
  CONFIG,
  DIRECT_EXPLICIT_FAL_SINGLE_MODEL,
  DIRECT_EXPLICIT_RUNWARE_SINGLE_MODEL,
  EFFECTIVE_POLLING_TIME_MS,
  FIRST_LAST_RUNWARE_FALLBACKS,
  SINGLE_RUNWARE_FALLBACKS,
  FIRST_LAST_FAL_FALLBACKS,
  SINGLE_FAL_FALLBACKS,
  VISION_PROVIDERS,
  SCENE_PLAN_SYSTEM_PROMPT,
  OPENAI_VISION_MODEL,
  VISION_PROMPT,
} = runtimeValues;
let storyRunIndex = 0;
let scenePlannerTrace = [];
const resetScenePlannerTrace = () => {
  scenePlannerTrace = [];
};
const recordScenePlannerRequest = ({ model, payload } = {}) => {
  scenePlannerTrace.push({
    model: model || '',
    payload: payload || null,
    response: null,
  });
};
const recordScenePlannerResponse = (response = {}) => {
  const latestAttempt = scenePlannerTrace[scenePlannerTrace.length - 1];
  if (latestAttempt) {
    latestAttempt.response = response;
  }
};
const storyTransportController = createStoryTransportController();
const selfomatSession = SELFOMAT_ENABLED
  ? await createSelfomatSession({
      directory: path.resolve(PROJECT_ROOT, pickEnvValue('FRESHWEB_SELFOMAT_STATE_DIR') || '.selfomat'),
      port: parsePositiveNumber(pickEnvValue('FRESHWEB_SELFOMAT_PORT'), 4011),
    })
  : null;
if (selfomatSession) {
  console.log(`[selfomat] display: ${selfomatSession.url}`);
}

const nextStoryRunIndex = () => {
  storyRunIndex += 1;
  return storyRunIndex;
};

const sceneRhythm = createSceneRhythmController({
  story: CONFIG.story,
  resolveSceneCountFromConfig,
  resolveSceneLengthsInput,
  resolveSemanticSceneCount,
});

const {
  applyRequestedSceneDurations,
  currentSceneDuration,
  currentSingleImageDuration,
  nextSceneDuration,
  refreshResolvedSceneLengths,
  resolveSceneCount,
  setActiveSceneDuration,
} = sceneRhythm;

let latestVisionResult = null;
let openingPromptContinuityVision = '';
const storeVisionResult = createWebcamVisionStoreHandler({ prompt: VISION_PROMPT });

const getFrameVision = createWebcamFrameVision({
  enabled: CONFIG.models.visionEnabled,
  prompt: VISION_PROMPT,
  providers: VISION_PROVIDERS,
  maxTokens: VISION_MAX_TOKENS,
  logPrefix: 'freshweb-middle-cost',
  onResult: async (payload) => {
    latestVisionResult = {
      imagePath: payload.imagePath,
      outputText: payload.outputText,
      provider: payload.result?.provider || '',
      model: payload.result?.model || '',
    };
    await storeVisionResult(payload);
  },
});

const getPromptContinuityVision = async () => (
  CONFIG.story.lockPromptContinuityToOpeningFrame
    ? openingPromptContinuityVision
    : ''
);
const setOpeningPromptContinuityVision = (value = '') => {
  openingPromptContinuityVision = value;
};


const runtimeProviders = createRuntimeProviders({
  config: CONFIG,
  openai,
  fallbackOpenai: localMistralChatFallback,
  localMistralModel: LOCAL_MISTRAL_MODEL,
  scenePlanSystemPrompt: SCENE_PLAN_SYSTEM_PROMPT,
  scenePlanTemperature: SCENE_PLAN_TEMPERATURE,
  scenePlanTopP: SCENE_PLAN_TOP_P,
  useWebcamPersonaReference: USE_WEBCAM_PERSONA_REFERENCE,
  webcamPersonaReferenceModel: WEBCAM_PERSONA_REFERENCE_MODEL,
  webcamPersonaReferenceProvider: WEBCAM_PERSONA_REFERENCE_PROVIDER,
  videoMaxRetriesOnFailure: VIDEO_MAX_RETRIES_ON_FAILURE,
  videoRetryDelayMs: VIDEO_RETRY_DELAY_MS,
  firstLastRunwareFallbacks: FIRST_LAST_RUNWARE_FALLBACKS,
  singleRunwareFallbacks: SINGLE_RUNWARE_FALLBACKS,
  firstLastFalFallbacks: FIRST_LAST_FAL_FALLBACKS,
  singleFalFallbacks: SINGLE_FAL_FALLBACKS,
  directExplicitFalSingleModel: DIRECT_EXPLICIT_FAL_SINGLE_MODEL,
  directExplicitRunwareSingleModel: DIRECT_EXPLICIT_RUNWARE_SINGLE_MODEL,
  enablePaidFalFallbacks: ENABLE_PAID_FAL_FALLBACKS,
  getFrameVision,
  getPromptContinuityVision,
  setActiveSceneDuration,
  nextSceneDuration,
  currentSceneDuration,
  currentSingleImageDuration,
  cameraOutputDir: CAMERA_OUTPUT_DIR,
  captureWebcamImage,
  extractVisionStoryContext,
  getLatestVisionResult: () => latestVisionResult,
  selfomatSession,
  visionPrompt: VISION_PROMPT,
  onScenePlannerRequest: recordScenePlannerRequest,
  onScenePlannerResponse: recordScenePlannerResponse,
  cameraSettings: {
    TEST_INPUT_IMAGE_MODE,
    TEST_INPUT_IMAGE_PATH,
    TEST_INPUT_IMAGE_FOLDER,
    TEST_INPUT_IMAGE_VISION_TEXT,
    CAMERA_PERSON_QUEUE_PATH,
    CAMERA_PERSON_QUEUE_CONSUMED_PATH,
    ASYNC_WEBCAM_PERSONA_REFERENCE_BURST_COUNT,
    SELFOMAT_ENABLED,
    USE_WEBCAM_PERSONA_REFERENCE,
  },
});
const {
  sceneGenerator,
  resolveLaterClipSingleImageMode,
  applySceneLoopDefaultsToPlan,
  image,
  video,
  video2,
  mireloAI,
  singleVideoPromptFlavor,
  resolveSceneContextImages,
  captureBestPersonaReferenceShot,
  resolveOpeningCameraShot,
  resolveRunningIterationCameraShot,
  buildOpeningVisionPayload,
  persistOpeningPersonaReference,
} = runtimeProviders;
const saveCameraSnapshotArtifact = createCameraSnapshotArtifactSaver({
  config: CONFIG,
  openAiVisionModel: OPENAI_VISION_MODEL,
  visionPrompt: VISION_PROMPT,
  visionProviders: VISION_PROVIDERS,
  scenePlanSystemPrompt: SCENE_PLAN_SYSTEM_PROMPT,
});
const driftCorrectionConfig = createDriftCorrectionConfig({
  config: CONFIG,
  driftStepsInput: DRIFT_CORRECTION_STEPS_INPUT,
  driftGuidanceInput: DRIFT_CORRECTION_GUIDANCE_INPUT,
  resolveDriftCorrectionProfile,
  resolveDriftCorrectionModelConfig,
  isReferenceImageActorMode,
  resolveRunningIterationCameraShot,
});

const sceneLoopConfig = createSceneLoopConfig({
  config: CONFIG,
  imageOnly: SELFOMAT_IMAGE_ONLY,
  dryRun: SELFOMAT_DRY_RUN,
  resolveSceneCount,
  resolveLaterClipSingleImageMode,
  isReferenceImageActorMode,
  resolveRunningIterationCameraShot,
  useWebcamPersonaReference: USE_WEBCAM_PERSONA_REFERENCE,
  webcamPersonaReferenceModel: WEBCAM_PERSONA_REFERENCE_MODEL,
  webcamPersonaReferenceProvider: WEBCAM_PERSONA_REFERENCE_PROVIDER,
  asyncPersonaReferenceUpdates: ASYNC_WEBCAM_PERSONA_REFERENCE_UPDATES,
  asyncPersonaReferenceInterval: ASYNC_WEBCAM_PERSONA_REFERENCE_INTERVAL,
  asyncPersonaReferenceMinBeatSeconds: ASYNC_WEBCAM_PERSONA_REFERENCE_MIN_BEAT_SECONDS,
  captureBestPersonaReferenceShot,
});
const promptFunktion = createSceneLoopPrompt({
  CONFIG,
  SELFOMAT_ENABLED,
  SELFOMAT_IMAGE_ONLY,
  selfomatSession,
  resolveOpeningCameraShot,
  nextStoryRunIndex,
  prepareStoryIteration,
  resolveSceneCount,
  refreshResolvedSceneLengths,
  resolveSceneContextImages,
  buildSourceCues,
  getFrameVision,
  VISION_PROMPT,
  extractVisionStoryContext,
  summarizeVisionStoryContext,
  storyTransportController,
  adaptSelfomatScenePlan,
  formatStoryTransportForPrompt,
  persistOpeningPersonaReference,
  buildOpeningVisionPayload,
  setOpeningPromptContinuityVision,
  generateScenePlanWithFallback,
  sceneGenerator,
  singleVideoPromptFlavor,
  createEmergencyScenePlan,
  applySceneLoopDefaultsToPlan,
  attachCastReferencesToScenePlan,
  isReferenceImageActorMode,
  describeWebcamCameraScenePlanIssues,
  sanitizeWebcamCameraScenePlan,
  applyRequestedSceneDurations,
  shouldUseOpeningFluxContextImage,
  buildOpeningFluxContextPrompt,
  createSelfomatAnnouncement,
  openai,
  CHAT_MODEL,
  scenePlanSystemPrompt: SCENE_PLAN_SYSTEM_PROMPT,
  resetScenePlannerTrace,
  getScenePlannerTrace: () => scenePlannerTrace,
  saveSelfomatRunLog,
  saveStoryTransportArtifact,
  saveCameraSnapshotArtifact,
  logSceneLoopSummary,
  USE_WEBCAM_PERSONA_REFERENCE,
  WEBCAM_PERSONA_REFERENCE_MODEL,
  WEBCAM_PERSONA_REFERENCE_PROVIDER,
});
const adapterConfig = {
  refresh: true,
  folderName: CONFIG.render.folderName,
  streamMixType: 'random',
  model: {
    scriptName: CONFIG.render.scriptName,
    forceImageToVideoOnly: CONFIG.story.forceImageToVideoOnly,
    ...(EFFECTIVE_POLLING_TIME_MS !== null
      ? { pollingTime: EFFECTIVE_POLLING_TIME_MS }
      : {}),
    retryOnFailure: RETRY_ON_FAILURE,
    ...(MAX_ITERATIONS !== null ? { maxIterations: Math.floor(MAX_ITERATIONS) } : {}),
  },
  words: CONFIG.story.words,
  video,
  video2,
  mireloAI,
  image,
  driftCorrection: driftCorrectionConfig,
  sceneLoop: sceneLoopConfig,
  promptFunktion,
  ...(selfomatSession ? {
    onIterationFinished: async (success) => {
      const promptLog = sceneLoopConfig.promptLog;
      if (success !== false && promptLog?.outputDir && promptLog?.content) {
        await saveSelfomatRunLog({
          outputDir: promptLog.outputDir,
          ...promptLog.content,
          renderedSceneAssets: sceneLoopConfig.renderedSceneAssets || [],
        });
      }
      await selfomatSession.publish({
        phase: success === false ? 'error' : 'completed',
        ...(success === false ? { message: 'Dein Film konnte nicht fertiggestellt werden. Bitte eine neue Aufnahme machen.' } : {}),
      });
    },
    onIterationError: async (error) => {
      console.error('[shorty-book] iteration error:', error?.stack || error?.message || error);
      await selfomatSession.publish({ phase: 'error', message: 'Dein Film konnte nicht fertiggestellt werden. Bitte eine neue Aufnahme machen.' });
    },
  } : {}),
};

export default adapterConfig;

import('../../../../semantic-stream.js')
  .then((module) => module.default([adapterConfig]))
  .catch((err) => {
    console.error('Error in shorty-book/LiveContextOrchestrator.js:', err);
    process.exit(1);
  });
