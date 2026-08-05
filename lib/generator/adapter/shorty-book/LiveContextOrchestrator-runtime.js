import dotenv from 'dotenv';
import OpenAI from 'openai';
import fs from 'fs-extra';
import crypto from 'node:crypto';
import path from 'node:path';
import { Taktmuster } from 'taktmuster';
import { fileURLToPath } from 'node:url';

import {
  generateScenePlanWithFallback,
  resolveSceneCountFromConfig,
  resolveSceneLengthsInput,
} from '../helpers/scene-generator.js';
import {
  normalizeVisionText,
  summarizeVisionStoryContext,
} from '../helpers/frame-vision.js';
import {
  createCameraPresenceDetector,
  DEFAULT_CAMERA_PRESENCE_PROMPT,
} from '../helpers/camera-presence.js';
import {
  applyWebcamScenePlanVideoModeDefaults,
  createWebcamFrameVision,
  createWebcamFirstLastPrompt,
  createWebcamImagePromptHandler,
  createWebcamSceneGenerator,
  createWebcamSingleImagePrompt,
  createWebcamVisionStoreHandler,
  captureWebcamImage,
  describeWebcamCameraScenePlanIssues,
  resolveWebcamScenePlanSystemPrompt,
  resolveWebcamVisionSettings,
  saveWebcamScenePlanArtifact,
  sanitizeWebcamCameraScenePlan,
} from './webcam-defaults.js';
import {
  buildOpeningFluxContextPrompt,
  normalizeOpeningStartMode,
  shouldUseOpeningFluxContextImage,
} from './opening-start.js';
import {
  isReferenceImageActorMode,
  normalizeStoryMode,
} from './LiveContextOrchestrator-config.js';
import {
  normalizeDriftCorrectionLevel,
  resolveDriftCorrectionModelConfig,
  resolveDriftCorrectionProfile,
} from './drift-correction.js';
import { normalizeStartFrameStrategy } from './scene-start-strategy.js';
import {
  createRemoteImageLoader,
  resolveLocalImageEntries,
} from './LiveContextOrchestrator-remote-images.js';
import { createVisionHelper, resolveOpenAiModel } from '../helpers/vision-model.js';
import { buildSourceCueBundle } from './source-cues.js';
import { downloadToFile } from '../../save-utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '../../../../');

// Wrapper scripts `cd` into lib/generator/adapter before starting this module,
// so load the repository root .env explicitly.
dotenv.config({
  path: path.join(PROJECT_ROOT, '.env'),
  override: false,
});

const parseBoolean = (value, fallback = false) => {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
};

const parsePositiveNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const parseFiniteNumber = (value, fallback) => {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const parseIterationLimit = (value, fallback = 2) => {
  const parsed = Number(value);
  if (parsed === -1) {
    return -1;
  }
  if (Number.isFinite(parsed) && parsed > 0) {
    return Math.floor(parsed);
  }
  return fallback;
};

const clampNumber = (value, min, max, fallback) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, parsed));
};

const pickEnvValue = (...names) => {
  for (const name of names) {
    const value = process.env[name];
    if (value !== undefined && value !== null && value !== '') {
      return value;
    }
  }
  return '';
};

const resolveOpenAiBaseUrl = () => {
  const value = pickEnvValue('OPENAI_BASE_URL', 'OPENAI_API_BASE', 'OPENAI_BASEPATH');
  return value ? String(value).trim() : '';
};

const normalizeUrl = (value) => String(value || '').trim().replace(/\/+$/g, '');

const appendUniqueLast = (items = [], value = '') => {
  const normalizedValue = String(value || '').trim();
  if (!normalizedValue) {
    return items;
  }
  const nextItems = items.filter((item) => String(item || '').trim() && String(item).trim() !== normalizedValue);
  nextItems.push(normalizedValue);
  return nextItems;
};

const parseOptionalPositiveNumber = (value) => {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};

const parsePositiveNumberList = (value) => String(value || '')
  .split(',')
  .map((entry) => Number(entry.trim()))
  .filter((entry) => Number.isFinite(entry) && entry > 0);

const parsePipeList = (value, fallback = []) => {
  const items = String(value || '')
    .split('|')
    .map((entry) => entry.trim())
    .filter(Boolean);
  return items.length > 0 ? items : fallback;
};

const parseCommaList = (value, fallback = []) => {
  const items = String(value || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  return items.length > 0 ? items : fallback;
};

const parseWordPairs = (value, fallback = [['horror', 'de']]) => {
  const raw = String(value || '').trim();
  if (!raw) {
    return fallback;
  }

  const pairs = raw
    .split('|')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [word, lang] = entry.split(',').map((part) => part.trim());
      if (!word) {
        return null;
      }
      return [word, lang || 'en'];
    })
    .filter(Boolean);

  return pairs.length > 0 ? pairs : fallback;
};

const OPENAI_BASE_URL = resolveOpenAiBaseUrl();
const OPENAI_API_KEY = pickEnvValue('OPENAI_API_KEY') || 'local-mistral';
const openai = new OpenAI({
  apiKey: OPENAI_API_KEY,
  ...(OPENAI_BASE_URL ? { baseURL: OPENAI_BASE_URL } : {}),
});
const LOCAL_MISTRAL_AS_CHAT = parseBoolean(
  pickEnvValue('LOCAL_MISTRAL_AS_CHAT', 'FRESHWEB_LOCAL_MISTRAL_AS_CHAT'),
  false
);
const LOCAL_MISTRAL_AS_VISION = parseBoolean(
  pickEnvValue('LOCAL_MISTRAL_AS_VISION', 'FRESHWEB_LOCAL_MISTRAL_AS_VISION'),
  false
);
const LOCAL_MISTRAL_BASE_URL = normalizeUrl(
  pickEnvValue('LOCAL_MISTRAL_OPENAI_BASE_URL', 'LOCAL_MISTRAL_BASE_URL', 'LOCAL_MISTRAL_URL')
);
const LOCAL_MISTRAL_MODEL = pickEnvValue('LOCAL_MISTRAL_MODEL', 'LOCAL_MISTRAL_CHAT_MODEL')
  || 'ministral-3-3b';
const LOCAL_MISTRAL_API_KEY = pickEnvValue('LOCAL_MISTRAL_OPENAI_API_KEY', 'LOCAL_MISTRAL_API_KEY')
  || 'local-mistral';
const localMistralChatFallback = LOCAL_MISTRAL_AS_CHAT
  && LOCAL_MISTRAL_BASE_URL
  && LOCAL_MISTRAL_BASE_URL !== normalizeUrl(OPENAI_BASE_URL)
  ? new OpenAI({
      apiKey: LOCAL_MISTRAL_API_KEY,
      baseURL: LOCAL_MISTRAL_BASE_URL,
    })
  : null;
const CHAT_MODEL = pickEnvValue('FRESHWEB_SCENE_PLAN_MODEL', 'OPENAI_MODEL', 'FRESHWEB_CHAT_MODEL') || 'gpt-5-mini';
const MULTIMODALART_FIRST_LAST_SPACE = 'multimodalart/wan-2-2-first-last-frame';
const WAN22_FIRST_LAST_SPACE = process.env.WAN22_FIRST_LAST_SPACE || 'cakegreen/Wan-2-2-first-last-frame';
const WAN22_SINGLE_SPACE = process.env.WAN22_SINGLE_SPACE || 'Wan-AI/Wan-2.2-5B';
const LTX_SINGLE_SPACE = pickEnvValue('FRESHWEB_LTX_SINGLE_SPACE', 'LTX_SINGLE_SPACE') || 'Lightricks/ltx-video-distilled';
const WAN22_FIRST_LAST_SELF_HOSTED_SPACE = process.env.WAN22_FIRST_LAST_SELF_HOSTED_SPACE || 'eggman-poff/wan-flf2v';
const WAN22_SINGLE_SELF_HOSTED_SPACE = process.env.WAN22_SINGLE_SELF_HOSTED_SPACE || 'eggman-poff/wan-s';
const FIRST_LAST_VIDEO_MODEL_TYPE = String(
  pickEnvValue('FRESHWEB_FIRST_LAST_VIDEO_MODEL_TYPE', 'FRESHWEB_FIRST_LAST_VIDEO_BACKEND')
  || 'wanFirstLast'
).trim() || 'wanFirstLast';
const FIRST_LAST_VIDEO_MODEL = String(
  pickEnvValue('FRESHWEB_FIRST_LAST_VIDEO_MODEL', 'FRESHWEB_FIRST_LAST_VIDEO_MODEL_ID')
  || ''
).trim();
const SINGLE_VIDEO_MODEL_TYPE = String(
  pickEnvValue('FRESHWEB_SINGLE_VIDEO_MODEL_TYPE', 'FRESHWEB_SINGLE_VIDEO_BACKEND')
  ?? 'wanSingleImage'
).trim() || 'wanSingleImage';
const SINGLE_VIDEO_MODEL = String(
  pickEnvValue('FRESHWEB_SINGLE_VIDEO_MODEL', 'FRESHWEB_SINGLE_VIDEO_MODEL_ID')
  || ''
).trim();
const WAN_NATIVE_AUDIO_ENABLED = parseBoolean(
  pickEnvValue('FRESHWEB_WAN_AUDIO_ENABLED'),
  false
);
const SINGLE_VIDEO_PROMPT_FLAVOR = String(
  pickEnvValue('FRESHWEB_SINGLE_VIDEO_PROMPT_FLAVOR', 'FRESHWEB_SINGLE_PROMPT_FLAVOR')
  || ''
).trim();
const LTX_SINGLE_FALLBACK_SPACES = parsePipeList(
  pickEnvValue('FRESHWEB_LTX_SINGLE_FALLBACK_SPACES'),
  []
);
const WAN_FIRST_LAST_FALLBACK_SPACES = parsePipeList(
  pickEnvValue('FRESHWEB_WAN_FIRST_LAST_FALLBACK_SPACES', 'WAN22_FIRST_LAST_FALLBACK_SPACES'),
  []
);
const WAN_SINGLE_FALLBACK_SPACES = parsePipeList(
  pickEnvValue('FRESHWEB_WAN_SINGLE_FALLBACK_SPACES', 'WAN22_SINGLE_FALLBACK_SPACES'),
  []
);
const USE_MULTIMODALART_FIRST_LAST = parseBoolean(
  pickEnvValue('FRESHWEB_USE_MULTIMODALART_FIRST_LAST'),
  false
);
const USE_SELF_HOSTED_FIRST_LAST = parseBoolean(
  pickEnvValue('FRESHWEB_SELF_HOSTED_FIRST_LAST'),
  true
);
const USE_SELF_HOSTED_SINGLE = parseBoolean(
  pickEnvValue('FRESHWEB_SELF_HOSTED_SINGLE'),
  true
);
const ENABLE_RUNWARE_FALLBACKS = parseBoolean(
  pickEnvValue(
    'FRESHWEB_ENABLE_RUNWARE_FALLBACKS',
    'FRESHWEB_USE_RUNWARE_FALLBACKS',
    'ENABLE_RUNWARE_FALLBACKS',
    'USE_RUNWARE_FALLBACKS'
  ),
  true
);
const ENABLE_PAID_FAL_FALLBACKS = parseBoolean(
  pickEnvValue('FRESHWEB_ENABLE_PAID_FAL_FALLBACKS'),
  false
);
const ALLOW_PAID_FAL_POLLING = parseBoolean(
  pickEnvValue('FRESHWEB_ALLOW_PAID_FAL_POLLING'),
  false
);
const ALLOW_PAID_FAL_MULTI_SCENE = parseBoolean(
  pickEnvValue('FRESHWEB_ALLOW_PAID_FAL_MULTI_SCENE'),
  false
);
const RETRY_ON_FAILURE = parseBoolean(
  pickEnvValue('FRESHWEB_RETRY_ON_FAILURE'),
  false
);
const VIDEO_MAX_RETRIES_ON_FAILURE = parseOptionalPositiveNumber(
  pickEnvValue('FRESHWEB_VIDEO_MAX_RETRIES_ON_FAILURE')
);
const VIDEO_RETRY_DELAY_MS = parsePositiveNumber(
  pickEnvValue('FRESHWEB_VIDEO_RETRY_DELAY_MS'),
  10000
);
const RESOLVED_WAN22_FIRST_LAST_SPACE = USE_MULTIMODALART_FIRST_LAST
  ? MULTIMODALART_FIRST_LAST_SPACE
  : WAN22_FIRST_LAST_SPACE;
const RESOLVED_USE_SELF_HOSTED_FIRST_LAST = USE_MULTIMODALART_FIRST_LAST
  ? false
  : USE_SELF_HOSTED_FIRST_LAST;
const EXPLICIT_SCENE_LENGTHS = parsePositiveNumberList(
  pickEnvValue('FRESHWEB_SCENE_LENGTHS')
);
const EXPLICIT_SCENE_COUNT = parseOptionalPositiveNumber(
  pickEnvValue('FRESHWEB_SCENE_COUNT')
);
const SCENE_COUNT_BIAS = parseFiniteNumber(
  pickEnvValue('FRESHWEB_SCENE_COUNT_BIAS'),
  0
);
const SCENE_COUNT_TAKTMUSTER_COUNT = parsePositiveNumber(
  pickEnvValue('FRESHWEB_SCENE_COUNT_TAKT_COUNT'),
  2
);
const SCENE_COUNT_TAKTMUSTER_ZAEHLER = parsePositiveNumber(
  pickEnvValue('FRESHWEB_SCENE_COUNT_TAKT_ZAEHLER', 'FRESHWEB_SCENE_COUNT_TAKT', 'FRESHWEB_TAKT'),
  3
);
const SCENE_COUNT_TAKTMUSTER_NENNER = parsePositiveNumber(
  pickEnvValue('FRESHWEB_SCENE_COUNT_TAKT_NENNER'),
  4
);
const SCENE_COUNT_INITIAL_PATTERN = parsePositiveNumberList(
  pickEnvValue('FRESHWEB_SCENE_COUNT_INITIAL_PATTERN')
);
const TRIPPY_REANCHOR_INTERVAL = parseOptionalPositiveNumber(
  pickEnvValue('FRESHWEB_TRIPPY_REANCHOR_INTERVAL')
);
const CAMERA_REANCHOR_INTERVAL = parseOptionalPositiveNumber(
  pickEnvValue('FRESHWEB_CAMERA_REANCHOR_INTERVAL', 'FRESHWEB_CAMERA_FRESH_START_INTERVAL')
);
const USE_TAKTMUSTER_LENGTHS = parseBoolean(
  pickEnvValue('FRESHWEB_USE_TAKTMUSTER_LENGTHS'),
  EXPLICIT_SCENE_LENGTHS.length === 0
);
const FORCE_IMAGE_TO_VIDEO_ONLY = parseBoolean(
  pickEnvValue(
    'FRESHWEB_IMAGE_TO_VIDEO_ONLY',
    'FRESHWEB_SINGLE_IMAGE_ONLY'
  ),
  false
);
const IMAGE_ONLY_TEST_ENABLED = parseBoolean(
  pickEnvValue('FRESHWEB_IMAGE_ONLY_TEST_ENABLED'),
  false
);
const IMAGE_ONLY_TEST_RUN_INDEX = parsePositiveNumber(
  pickEnvValue('FRESHWEB_IMAGE_ONLY_TEST_RUN_INDEX'),
  1
);
const IMAGE_ONLY_TEST_RUN_COUNT = parseIterationLimit(
  pickEnvValue('FRESHWEB_IMAGE_ONLY_TEST_RUN_COUNT'),
  2
);
const DEFAULT_SCENE_LENGTH_MULTIPLIER = EXPLICIT_SCENE_LENGTHS.length > 0 ? 1 : 1.6;
const SCENE_COUNT_TAKTMUSTER_TAKT = parsePositiveNumber(
  pickEnvValue('FRESHWEB_SCENE_COUNT_TAKT', 'FRESHWEB_TAKT'),
  4
);
const SCENE_COUNT_TAKTMUSTER_TYPE = String(
  pickEnvValue('FRESHWEB_SCENE_COUNT_TAKT_TYPE', 'FRESHWEB_TAKT_TYPE')
  ?? 'balanced'
).trim() || 'balanced';
const SCENE_LENGTH_TAKTMUSTER_TAKT = parsePositiveNumber(
  pickEnvValue('FRESHWEB_SCENE_LENGTH_TAKT', 'FRESHWEB_TAKT'),
  4
);
const SCENE_LENGTH_TAKTMUSTER_TYPE = String(
  pickEnvValue('FRESHWEB_SCENE_LENGTH_TAKT_TYPE', 'FRESHWEB_TAKT_TYPE')
  ?? 'balanced'
).trim() || 'balanced';
const SCENE_LENGTH_BIAS = parseFiniteNumber(
  pickEnvValue('FRESHWEB_SCENE_LENGTH_BIAS'),
  0
);
const SCENE_PLAN_TEMPERATURE = clampNumber(
  parseFiniteNumber(pickEnvValue('FRESHWEB_SCENE_PLAN_TEMPERATURE'), 0.35),
  0,
  2,
  0.35
);
const SCENE_PLAN_TOP_P = clampNumber(
  parseFiniteNumber(pickEnvValue('FRESHWEB_SCENE_PLAN_TOP_P'), 0.85),
  0,
  1,
  0.85
);
const START_FRAME_STRATEGY_MODE = String(
  pickEnvValue('FRESHWEB_START_FRAME_STRATEGY_MODE') || 'legacy'
).trim().toLowerCase();
const START_FRAME_STRATEGY_ENABLED = START_FRAME_STRATEGY_MODE === 'planner';
const START_FRAME_STRATEGY = {
  enabled: START_FRAME_STRATEGY_ENABLED,
  rawLastFramePercent: clampNumber(
    parseFiniteNumber(pickEnvValue('FRESHWEB_START_FRAME_RAW_PERCENT'), 50),
    0,
    100,
    50
  ),
  driftCorrectedLastFramePercent: clampNumber(
    parseFiniteNumber(pickEnvValue('FRESHWEB_START_FRAME_DRIFT_PERCENT'), 20),
    0,
    100,
    20
  ),
  locationReanchorPercent: clampNumber(
    parseFiniteNumber(pickEnvValue('FRESHWEB_START_FRAME_LOCATION_PERCENT'), 30),
    0,
    100,
    30
  ),
  maxConsecutiveRawLastFrames: parsePositiveNumber(
    pickEnvValue('FRESHWEB_START_FRAME_MAX_RAW_STREAK'),
    2
  ),
  firstSceneStrategy: normalizeStartFrameStrategy(
    pickEnvValue('FRESHWEB_START_FRAME_FIRST_STRATEGY'),
    'locationReanchor'
  ),
  lastSceneStrategy: normalizeStartFrameStrategy(
    pickEnvValue('FRESHWEB_START_FRAME_LAST_STRATEGY'),
    'rawLastFrame'
  ),
  guidance: String(pickEnvValue('FRESHWEB_START_FRAME_STRATEGY_GUIDANCE') || '').trim(),
};
const IMAGE_SEED = parseFiniteNumber(pickEnvValue('IMG_SEED', 'FRESHWEB_IMG_SEED'), 0);
const VIDEO_SEED = parseFiniteNumber(pickEnvValue('VID_SEED', 'FRESHWEB_VID_SEED'), 0);
const STORY_MODE = normalizeStoryMode(pickEnvValue('FRESHWEB_MODE') || 'reference-image-actor');
const SOURCE_CUE_MODE = String(pickEnvValue('FRESHWEB_SOURCE_CUE_MODE') || 'mixed').trim();
const SEMANTIC_STRICT_MODE = SOURCE_CUE_MODE === 'collision'
  && parseBoolean(pickEnvValue('FRESHWEB_SEMANTIC_STRICT_MODE'), true);
const ALLOW_PEOPLE = parseBoolean(pickEnvValue('FRESHWEB_ALLOW_PEOPLE'), false);
const STORY_WORDS = parseWordPairs(
  pickEnvValue('FRESHWEB_WORDS'),
  [['horror', 'de']]
);
const OPENING_PROMPT_SOURCE = pickEnvValue(
  'FRESHWEB_OPENING_PROMPT'
) || 'freshweb webcam shot, candid documentary still, natural light, clear subject focus';
const STORY_VISUAL_DIRECTION = pickEnvValue(
  'FRESHWEB_SCENE_VISUAL_DIRECTION',
  'FRESHWEB_VISUAL_DIRECTION'
) || 'documentary, realistic, visually distinct scenes, coherent camera-led progression, better image quality, visible body motion, clear gesture changes, expressive face movement, readable camera movement';
const STATIC_TEST_MODE = parseBoolean(
  pickEnvValue('FRESHWEB_STATIC_TEST'),
  false
);
const STATIC_TEST_SOURCE_CUES = parsePipeList(
  pickEnvValue('FRESHWEB_STATIC_SOURCE_CUES'),
  [
    'urban documentary opening',
    'street detail close-up',
    'human interaction at a market',
    'quiet reflective ending',
  ]
);
const SCENE_LENGTH_MULTIPLIER = parsePositiveNumber(
  pickEnvValue('FRESHWEB_SCENE_LENGTH_MULTIPLIER'),
  DEFAULT_SCENE_LENGTH_MULTIPLIER
);
const MIN_SCENE_DURATION_SECONDS = parsePositiveNumber(
  pickEnvValue('FRESHWEB_MIN_SCENE_DURATION_SECONDS'),
  1
);
const SINGLE_IMAGE_MAX_DURATION = parseOptionalPositiveNumber(
  pickEnvValue('FRESHWEB_SINGLE_VIDEO_MAX_DURATION')
);
const CAMERA_SINGLE_IMAGE_STABILITY_MAX_DURATION = parsePositiveNumber(
  pickEnvValue('FRESHWEB_CAMERA_SINGLE_IMAGE_STABILITY_MAX_DURATION'),
  3.2
);
const CAMERA_FIRST_LAST_MAX_DURATION = parsePositiveNumber(
  pickEnvValue('FRESHWEB_CAMERA_FIRST_LAST_MAX_DURATION'),
  3.2
);
const FIRST_LAST_STEPS = parsePositiveNumber(
  pickEnvValue('FRESHWEB_FIRST_LAST_STEPS', 'FRESHWEB_VIDEO_STEPS'),
  isReferenceImageActorMode(STORY_MODE) ? 8 : 24
);
const FIRST_LAST_GUIDANCE = parseFiniteNumber(
  pickEnvValue('FRESHWEB_FIRST_LAST_GUIDANCE', 'FRESHWEB_VIDEO_GUIDANCE'),
  isReferenceImageActorMode(STORY_MODE) ? 1 : 5
);
const SCENE_PLAN_CONTROLS_VIDEO_MODE = parseBoolean(
  pickEnvValue('FRESHWEB_SCENE_PLAN_CONTROLS_VIDEO_MODE'),
  !FORCE_IMAGE_TO_VIDEO_ONLY
);
const FIRST_CLIP_VIDEO_MODE = pickEnvValue(
  'FRESHWEB_FIRST_CLIP_VIDEO_MODE'
) || 'singleImage';
const LATER_SINGLE_IMAGE_DEFAULT = parseBoolean(
  pickEnvValue('FRESHWEB_LATER_CLIPS_SINGLE_IMAGE'),
  FORCE_IMAGE_TO_VIDEO_ONLY
);
const DYNAMIC_LATER_SINGLE_IMAGE = parseBoolean(
  pickEnvValue(
    'FRESHWEB_DYNAMIC_SINGLE_IMAGE_LATER_CLIPS'
  ),
  !FORCE_IMAGE_TO_VIDEO_ONLY
);
const LOCK_PROMPT_CONTINUITY_TO_OPENING_FRAME = parseBoolean(
  pickEnvValue(
    'FRESHWEB_LOCK_PROMPT_CONTINUITY_TO_OPENING_FRAME'
  ),
  true
);
const RESTART_FROM_PREVIOUS_MOVIE_LAST_FRAME = parseBoolean(
  pickEnvValue(
    'FRESHWEB_RESTART_FROM_PREVIOUS_MOVIE_LAST_FRAME'
  ),
  false
);
const CHAIN_FROM_PREVIOUS_LOOP_LAST_FRAME = parseBoolean(
  pickEnvValue(
    'FRESHWEB_CHAIN_FROM_PREVIOUS_LOOP_LAST_FRAME'
  ),
  true
);
const MIRELO_MODE = pickEnvValue(
  'FRESHWEB_MIRELO_MODE'
) || 'finalOnly';
const MIRELO_RUNWARE_FALLBACK_ENABLED = parseBoolean(
  pickEnvValue('FRESHWEB_MIRELO_RUNWARE_FALLBACK_ENABLED'),
  true
);
const MIRELO_RUNWARE_FALLBACK_MODEL = pickEnvValue(
  'FRESHWEB_MIRELO_RUNWARE_FALLBACK_MODEL'
) || 'mirelo:1@1';
const MIRELO_RUNWARE_FALLBACK_STEPS = parsePositiveNumber(
  pickEnvValue('FRESHWEB_MIRELO_RUNWARE_FALLBACK_STEPS'),
  28
);
const SCENE_PLAN_SYSTEM_PROMPT_OVERRIDE = pickEnvValue(
  'FRESHWEB_SCENE_PLAN_SYSTEM_PROMPT'
);
const CAMERA_SCENE_PLAN_SYSTEM_PROMPT_OVERRIDE = pickEnvValue(
  'FRESHWEB_CAMERA_SCENE_PLAN_SYSTEM_PROMPT'
);
const VISION_PROMPT_OVERRIDE = pickEnvValue(
  'FRESHWEB_VISION_PROMPT'
);
const VISION_PROVIDERS_OVERRIDE = pickEnvValue(
  'FRESHWEB_VISION_PROVIDERS'
);
const VISION_ENABLED = parseBoolean(
  pickEnvValue('FRESHWEB_USE_VISION'),
  true
);
const END_FRAME_ANALYSIS_ENABLED = parseBoolean(
  pickEnvValue('FRESHWEB_END_FRAME_ANALYSIS'),
  true
);
const END_FRAME_ANALYSIS_PROMPT = pickEnvValue('FRESHWEB_END_FRAME_ANALYSIS_PROMPT');
const FOLDER_NAME = pickEnvValue('FRESHWEB_FOLDER')
  || 'freshweb-middle-cost-4-3-test';
const FLUX_VARIANT = pickEnvValue('FRESHWEB_FLUX_VARIANT')
  || 'schnell';
const OPENING_START_ENABLED = parseBoolean(
  pickEnvValue('FRESHWEB_OPENING_START_ENABLED'),
  false
);
const OPENING_START_MODE = normalizeOpeningStartMode(
  pickEnvValue('FRESHWEB_OPENING_START_MODE'),
  'cameraShot'
);
const OPENING_START_INTERVAL = parsePositiveNumber(
  pickEnvValue('FRESHWEB_OPENING_START_INTERVAL'),
  3
);
const OPENING_START_MODEL = pickEnvValue('FRESHWEB_OPENING_START_MODEL')
  || 'black-forest-labs/FLUX.1-Kontext-dev';
const OPENING_START_PROVIDER = pickEnvValue('FRESHWEB_OPENING_START_PROVIDER')
  || 'fal-ai';
const OPENING_START_STEPS = parsePositiveNumber(
  pickEnvValue('FRESHWEB_OPENING_START_STEPS'),
  28
);
const OPENING_START_GUIDANCE = parseFiniteNumber(
  pickEnvValue('FRESHWEB_OPENING_START_GUIDANCE'),
  2.5
);
const OPENING_START_NEGATIVE_PROMPT = pickEnvValue('FRESHWEB_OPENING_START_NEGATIVE_PROMPT')
  || 'different person, different room, broken anatomy, blur, low detail, collage, split screen';
const OPENING_START_SEED = parseFiniteNumber(
  pickEnvValue('FRESHWEB_OPENING_START_SEED'),
  0
);
const OPENING_START_WIDTH = parsePositiveNumber(
  pickEnvValue('FRESHWEB_OPENING_START_WIDTH'),
  640
);
const OPENING_START_HEIGHT = parsePositiveNumber(
  pickEnvValue('FRESHWEB_OPENING_START_HEIGHT'),
  480
);
const USE_WEBCAM_PERSONA_REFERENCE = isReferenceImageActorMode(STORY_MODE)
  ? parseBoolean(
    pickEnvValue(
      'FRESHWEB_USE_WEBCAM_PERSONA_REFERENCE',
      'FRESHWEB_USE_OPENING_PERSONA_REFERENCE'
    ),
    true
  )
  : false;
const WEBCAM_PERSONA_REFERENCE_MODEL = pickEnvValue('FRESHWEB_WEBCAM_PERSONA_REFERENCE_MODEL')
  || 'Qwen/Qwen-Image-Edit-2511';
const WEBCAM_PERSONA_REFERENCE_PROVIDER = pickEnvValue('FRESHWEB_WEBCAM_PERSONA_REFERENCE_PROVIDER')
  || 'fal-ai';
const ASYNC_WEBCAM_PERSONA_REFERENCE_UPDATES = USE_WEBCAM_PERSONA_REFERENCE
  ? parseBoolean(
    pickEnvValue('FRESHWEB_ASYNC_PERSONA_REFERENCE_UPDATES'),
    true
  )
  : false;
const ASYNC_WEBCAM_PERSONA_REFERENCE_INTERVAL = parsePositiveNumber(
  pickEnvValue('FRESHWEB_ASYNC_PERSONA_REFERENCE_INTERVAL'),
  1
);
const ASYNC_WEBCAM_PERSONA_REFERENCE_BURST_COUNT = parsePositiveNumber(
  pickEnvValue('FRESHWEB_ASYNC_PERSONA_REFERENCE_BURST_COUNT'),
  3
);
const ASYNC_WEBCAM_PERSONA_REFERENCE_MIN_BEAT_SECONDS = parsePositiveNumber(
  pickEnvValue('FRESHWEB_ASYNC_PERSONA_REFERENCE_MIN_BEAT_SECONDS'),
  0
);
const DRIFT_CORRECTION_LEVEL = normalizeDriftCorrectionLevel(
  pickEnvValue('FRESHWEB_DRIFT_CORRECTION_LEVEL', 'FRESHWEB_DRIFT_HANDLING'),
  'default'
);
const ENABLE_DRIFT_CORRECTION = DRIFT_CORRECTION_LEVEL === 'off'
  ? false
  : parseBoolean(
    pickEnvValue('FRESHWEB_ENABLE_DRIFT_CORRECTION'),
    DRIFT_CORRECTION_LEVEL !== 'default' && DRIFT_CORRECTION_LEVEL !== 'off'
  );
const DRIFT_CORRECTION_MODEL = pickEnvValue('FRESHWEB_DRIFT_CORRECTION_MODEL')
  || 'black-forest-labs/FLUX.1-Kontext-dev';
const DRIFT_CORRECTION_PROVIDER = pickEnvValue('FRESHWEB_DRIFT_CORRECTION_PROVIDER')
  || 'fal-ai';
const DRIFT_CORRECTION_STEPS_INPUT = pickEnvValue('FRESHWEB_DRIFT_CORRECTION_STEPS');
const DRIFT_CORRECTION_STEPS = parsePositiveNumber(
  DRIFT_CORRECTION_STEPS_INPUT,
  28
);
const DRIFT_CORRECTION_GUIDANCE_INPUT = pickEnvValue('FRESHWEB_DRIFT_CORRECTION_GUIDANCE');
const DRIFT_CORRECTION_GUIDANCE = parseFiniteNumber(
  DRIFT_CORRECTION_GUIDANCE_INPUT,
  2.5
);
const DRIFT_CORRECTION_NEGATIVE_PROMPT = pickEnvValue('FRESHWEB_DRIFT_CORRECTION_NEGATIVE_PROMPT')
  || 'different person, different location, changed outfit, new props, distorted face, blurry, low detail';
const DRIFT_CORRECTION_SEED = parseFiniteNumber(
  pickEnvValue('FRESHWEB_DRIFT_CORRECTION_SEED'),
  0
);
const DRIFT_CORRECTION_WIDTH = parsePositiveNumber(
  pickEnvValue('FRESHWEB_DRIFT_CORRECTION_WIDTH'),
  parsePositiveNumber(pickEnvValue('FRESHWEB_SINGLE_VIDEO_WIDTH', 'FRESHWEB_SINGLE_WIDTH'), 640)
);
const DRIFT_CORRECTION_HEIGHT = parsePositiveNumber(
  pickEnvValue('FRESHWEB_DRIFT_CORRECTION_HEIGHT'),
  parsePositiveNumber(pickEnvValue('FRESHWEB_SINGLE_VIDEO_HEIGHT', 'FRESHWEB_SINGLE_HEIGHT'), 480)
);
const DRIFT_CORRECTION_USE_CAMERA_REFERENCE = parseBoolean(
  pickEnvValue('FRESHWEB_DRIFT_CORRECTION_USE_CAMERA_REFERENCE'),
  false
);
const DRIFT_CONTEXT_BUFFER_ENABLED = parseBoolean(
  pickEnvValue('FRESHWEB_DRIFT_CONTEXT_BUFFER_ENABLED'),
  true
);
const DRIFT_CONTEXT_BUFFER_SIZE = parsePositiveNumber(
  pickEnvValue('FRESHWEB_DRIFT_CONTEXT_BUFFER_SIZE'),
  8
);
const DRIFT_CONTEXT_BUFFER_COLUMNS = parsePositiveNumber(
  pickEnvValue('FRESHWEB_DRIFT_CONTEXT_BUFFER_COLUMNS'),
  4
);
const DRIFT_CONTEXT_BUFFER_ROWS = parsePositiveNumber(
  pickEnvValue('FRESHWEB_DRIFT_CONTEXT_BUFFER_ROWS'),
  2
);
const DRIFT_CONTEXT_BUFFER_CAPTURE_BEFORE_EACH_CALL = parseBoolean(
  pickEnvValue('FRESHWEB_DRIFT_CONTEXT_BUFFER_CAPTURE_BEFORE_EACH_CALL'),
  true
);
const CAMERA_IMAGE_PATH = pickEnvValue(
  'FRESHWEB_CAMERA_IMAGE_PATH',
  'FRESHWEB_OPENING_IMAGE_PATH'
);
const CAMERA_IMAGE_URL = pickEnvValue(
  'FRESHWEB_CAMERA_IMAGE_URL',
  'FRESHWEB_OPENING_IMAGE_URL'
);
const PROTAGONIST_IMAGE_URL = pickEnvValue(
  'FRESHWEB_PROTAGONIST_IMAGE_URL',
  'FRESHWEB_PERSONA_IMAGE_URL'
);
const CAMERA_IMAGE_URLS = [
  ...parsePipeList(
    pickEnvValue('FRESHWEB_CAMERA_IMAGE_URLS', 'FRESHWEB_OPENING_IMAGE_URLS'),
    []
  ),
  ...(CAMERA_IMAGE_URL ? [CAMERA_IMAGE_URL] : []),
].filter(Boolean);
const SCENE_CONTEXT_IMAGE_URLS = parsePipeList(
  pickEnvValue('FRESHWEB_SCENE_CONTEXT_IMAGE_URLS', 'FRESHWEB_CONTEXT_IMAGE_URLS'),
  []
);
const SCENE_CONTEXT_IMAGE_PATHS = parsePipeList(
  pickEnvValue('FRESHWEB_SCENE_CONTEXT_IMAGE_PATHS', 'FRESHWEB_CONTEXT_IMAGE_PATHS'),
  []
);
const SCENE_CONTEXT_IMAGE_FOLDER_URL = pickEnvValue(
  'FRESHWEB_SCENE_CONTEXT_IMAGE_FOLDER_URL',
  'FRESHWEB_CONTEXT_IMAGE_FOLDER_URL'
);
const SCENE_CONTEXT_IMAGE_API_URL = pickEnvValue(
  'FRESHWEB_SCENE_CONTEXT_IMAGE_API_URL',
  'FRESHWEB_CONTEXT_IMAGE_API_URL'
);
const SCENE_CONTEXT_IMAGE_MAPPING_ENABLED = parseBoolean(
  pickEnvValue('FRESHWEB_SCENE_CONTEXT_IMAGE_MAPPING_ENABLED', 'FRESHWEB_CONTEXT_IMAGE_MAPPING_ENABLED'),
  false
);
const SCENE_CONTEXT_IMAGE_START_AFTER_PROTAGONIST = parseBoolean(
  pickEnvValue('FRESHWEB_SCENE_CONTEXT_IMAGE_START_AFTER_PROTAGONIST'),
  true
);
const SCENE_CONTEXT_LOCK_ACTOR_COUNT = parseBoolean(
  pickEnvValue('FRESHWEB_SCENE_CONTEXT_LOCK_ACTOR_COUNT'),
  true
);
const SCENE_CONTEXT_IMAGES_INCLUDE_PROTAGONIST = parseBoolean(
  pickEnvValue('FRESHWEB_SCENE_CONTEXT_IMAGES_INCLUDE_PROTAGONIST'),
  false
);
const SCENE_CONTEXT_PROTAGONIST_REFERENCE_MODE = pickEnvValue(
  'FRESHWEB_SCENE_CONTEXT_PROTAGONIST_REFERENCE_MODE',
  'image'
);
const SCENE_CONTEXT_SEMANTIC_RECONSTRUCTION_PASS = parseBoolean(
  pickEnvValue('FRESHWEB_SCENE_CONTEXT_SEMANTIC_RECONSTRUCTION_PASS'),
  false
);
const END_CARD_ENABLED = parseBoolean(pickEnvValue('FRESHWEB_END_CARD_ENABLED'), false);
const END_CARD_DOSSIER_PATH = pickEnvValue('FRESHWEB_END_CARD_DOSSIER_PATH');
const END_CARD_DURATION_SECONDS = parsePositiveNumber(
  pickEnvValue('FRESHWEB_END_CARD_DURATION_SECONDS'),
  4
);
const COLLISION_TRANSITIONS_ENABLED = parseBoolean(
  pickEnvValue('FRESHWEB_COLLISION_TRANSITIONS_ENABLED'),
  false
);
const COLLISION_TRANSITION_BOUNDARY_TRIM_SECONDS = parsePositiveNumber(
  pickEnvValue('FRESHWEB_COLLISION_TRANSITION_BOUNDARY_TRIM_SECONDS'),
  0.12
);
const COLLISION_TRANSITION_DURATION_SECONDS = parsePositiveNumber(
  pickEnvValue('FRESHWEB_COLLISION_TRANSITION_DURATION_SECONDS'),
  0.08
);
const GLOBAL_FORWARD_DOLLY_ENABLED = parseBoolean(
  pickEnvValue('FRESHWEB_GLOBAL_FORWARD_DOLLY_ENABLED'),
  false
);
const CAMERA_FALLBACK_IMAGE_PATH = pickEnvValue(
  'FRESHWEB_CAMERA_FALLBACK_IMAGE_PATH'
);
const CAMERA_OUTPUT_DIR = pickEnvValue(
  'FRESHWEB_CAMERA_OUTPUT_DIR'
) || path.resolve(__dirname, '../../../../tests/GENERATIONS/camera-shot');
const CAMERA_SOURCE_LABEL = pickEnvValue('FRESHWEB_CAMERA_SOURCE_LABEL')
  || (CAMERA_IMAGE_URLS.length > 0 ? 'source frame' : 'webcam shot');

const CONFIG = {
  story: {
    mode: STORY_MODE,
    sourceCueMode: SOURCE_CUE_MODE,
    semanticStrictMode: SEMANTIC_STRICT_MODE,
    allowPeople: ALLOW_PEOPLE,
    words: STORY_WORDS,
    openingPromptSource: OPENING_PROMPT_SOURCE,
    visualDirection: STORY_VISUAL_DIRECTION,
    staticTestMode: STATIC_TEST_MODE,
    staticSourceCues: STATIC_TEST_SOURCE_CUES,
    count: EXPLICIT_SCENE_COUNT,
    lengths: EXPLICIT_SCENE_LENGTHS,
    useTaktmusterLengths: USE_TAKTMUSTER_LENGTHS,
    sceneCountBias: SCENE_COUNT_BIAS,
    sceneCountInitialPattern: SCENE_COUNT_INITIAL_PATTERN,
    sceneCountTaktmusterCount: SCENE_COUNT_TAKTMUSTER_COUNT,
    sceneCountTaktmusterZaehler: SCENE_COUNT_TAKTMUSTER_ZAEHLER,
    sceneCountTaktmusterNenner: SCENE_COUNT_TAKTMUSTER_NENNER,
    trippyReanchorInterval: TRIPPY_REANCHOR_INTERVAL,
    cameraReanchorInterval: CAMERA_REANCHOR_INTERVAL,
    sceneCountTaktmusterTakt: SCENE_COUNT_TAKTMUSTER_TAKT,
    sceneCountTaktmusterType: SCENE_COUNT_TAKTMUSTER_TYPE,
    sceneLengthTaktmusterTakt: SCENE_LENGTH_TAKTMUSTER_TAKT,
    sceneLengthTaktmusterType: SCENE_LENGTH_TAKTMUSTER_TYPE,
    sceneLengthMultiplier: SCENE_LENGTH_MULTIPLIER,
    sceneLengthBias: SCENE_LENGTH_BIAS,
    minSceneDurationSeconds: MIN_SCENE_DURATION_SECONDS,
    singleImageMaxDuration: SINGLE_IMAGE_MAX_DURATION,
    cameraSingleImageStabilityMaxDuration: CAMERA_SINGLE_IMAGE_STABILITY_MAX_DURATION,
    cameraFirstLastMaxDurationSeconds: CAMERA_FIRST_LAST_MAX_DURATION,
    controlsVideoMode: SCENE_PLAN_CONTROLS_VIDEO_MODE,
    forceImageToVideoOnly: FORCE_IMAGE_TO_VIDEO_ONLY,
    imageOnlyTestEnabled: IMAGE_ONLY_TEST_ENABLED,
    imageOnlyTestRunIndex: IMAGE_ONLY_TEST_RUN_INDEX,
    imageOnlyTestRunCount: IMAGE_ONLY_TEST_RUN_COUNT,
    firstClipVideoMode: FIRST_CLIP_VIDEO_MODE,
    laterSingleImageDefault: LATER_SINGLE_IMAGE_DEFAULT,
    dynamicLaterSingleImage: DYNAMIC_LATER_SINGLE_IMAGE,
    lockPromptContinuityToOpeningFrame: LOCK_PROMPT_CONTINUITY_TO_OPENING_FRAME,
    chainFromPreviousLoopLastFrame: CHAIN_FROM_PREVIOUS_LOOP_LAST_FRAME,
    restartFromPreviousMovieLastFrame: RESTART_FROM_PREVIOUS_MOVIE_LAST_FRAME,
    mireloMode: MIRELO_MODE,
    scenePlanSystemPrompt: SCENE_PLAN_SYSTEM_PROMPT_OVERRIDE,
    cameraScenePlanSystemPrompt: CAMERA_SCENE_PLAN_SYSTEM_PROMPT_OVERRIDE,
    visionPrompt: VISION_PROMPT_OVERRIDE,
    visionProviders: VISION_PROVIDERS_OVERRIDE ? VISION_PROVIDERS_OVERRIDE.split(',').map((entry) => entry.trim()).filter(Boolean) : [],
    startFrameStrategy: START_FRAME_STRATEGY,
  },
  models: {
    chatModel: CHAT_MODEL,
    imageSeed: IMAGE_SEED,
    videoSeed: VIDEO_SEED,
    visionEnabled: VISION_ENABLED,
    firstLastVideoModelType: FIRST_LAST_VIDEO_MODEL_TYPE,
    firstLastVideoModel: FIRST_LAST_VIDEO_MODEL,
    singleVideoModelType: SINGLE_VIDEO_MODEL_TYPE,
    singleVideoModel: SINGLE_VIDEO_MODEL,
    useSelfHostedFirstLast: RESOLVED_USE_SELF_HOSTED_FIRST_LAST,
    useSelfHostedSingle: USE_SELF_HOSTED_SINGLE,
    wanFirstLastSpace: RESOLVED_WAN22_FIRST_LAST_SPACE,
    wanSingleSpace: WAN22_SINGLE_SPACE,
    ltxSingleSpace: LTX_SINGLE_SPACE,
    wanFirstLastSelfHostedSpace: WAN22_FIRST_LAST_SELF_HOSTED_SPACE,
    wanSingleSelfHostedSpace: WAN22_SINGLE_SELF_HOSTED_SPACE,
    mireloModelVersion: 'latest',
    wanFirstLastFallbackSpaces: WAN_FIRST_LAST_FALLBACK_SPACES,
    wanSingleFallbackSpaces: WAN_SINGLE_FALLBACK_SPACES,
    ltxSingleFallbackSpaces: LTX_SINGLE_FALLBACK_SPACES,
    runwareFirstLastModel: 'alibaba:wan@2.6-flash',
    runwareSingleModel: 'alibaba:wan@2.6-flash',
    falFirstLastFallbacks: [
      { type: 'falFirstLast', model: 'fal-ai/wan-flf2v' },
    ],
    falSingleFallbacks: [
      { type: 'falImageToVideo', model: 'fal-ai/wan/v2.2-5b/image-to-video' },
      { type: 'falImageToVideo', model: 'fal-ai/wan/turbo/image-to-video' },
    ],
  },
  camera: {
    imagePath: CAMERA_IMAGE_PATH,
    protagonistImageUrl: PROTAGONIST_IMAGE_URL,
    imageUrls: CAMERA_IMAGE_URLS,
    fallbackImagePath: CAMERA_FALLBACK_IMAGE_PATH,
    outputDir: CAMERA_OUTPUT_DIR,
    sourceLabel: CAMERA_SOURCE_LABEL,
    width: parsePositiveNumber(pickEnvValue('FRESHWEB_CAMERA_WIDTH'), 1024),
    height: parsePositiveNumber(pickEnvValue('FRESHWEB_CAMERA_HEIGHT'), 768),
    quality: parsePositiveNumber(pickEnvValue('FRESHWEB_CAMERA_QUALITY'), 100),
    warmupSeconds: parsePositiveNumber(pickEnvValue('FRESHWEB_CAMERA_WARMUP_SECONDS'), 1),
    device: pickEnvValue('FRESHWEB_CAMERA_DEVICE') || false,
  },
  sceneContextImage: {
    enabled: SCENE_CONTEXT_IMAGE_MAPPING_ENABLED,
    paths: SCENE_CONTEXT_IMAGE_PATHS,
    urls: SCENE_CONTEXT_IMAGE_URLS,
    folderUrl: SCENE_CONTEXT_IMAGE_FOLDER_URL,
    apiUrl: SCENE_CONTEXT_IMAGE_API_URL,
    startAfterProtagonist: SCENE_CONTEXT_IMAGE_START_AFTER_PROTAGONIST,
    lockActorCount: SCENE_CONTEXT_LOCK_ACTOR_COUNT,
    allowPeople: ALLOW_PEOPLE,
    protagonistAlreadyComposited: SCENE_CONTEXT_IMAGES_INCLUDE_PROTAGONIST,
    protagonistReferenceMode: SCENE_CONTEXT_PROTAGONIST_REFERENCE_MODE,
    semanticReconstructionPass: SCENE_CONTEXT_SEMANTIC_RECONSTRUCTION_PASS,
  },
  render: {
    folderName: FOLDER_NAME,
    scriptName: './adapter/shorty-book/index.js',
    pollingTimeMs: parseOptionalPositiveNumber(
      pickEnvValue('POLLING_TIME_MS', 'FRESHWEB_POLLING_TIME_MS')
    ),
    fluxVariant: FLUX_VARIANT,
    image: {
      width: parsePositiveNumber(pickEnvValue('FRESHWEB_IMAGE_WIDTH'), 640),
      height: parsePositiveNumber(pickEnvValue('FRESHWEB_IMAGE_HEIGHT'), 480),
      numInferenceSteps: parsePositiveNumber(pickEnvValue('FRESHWEB_IMAGE_STEPS'), 16),
      guidanceScale: parseFiniteNumber(pickEnvValue('FRESHWEB_IMAGE_GUIDANCE'), 3),
      negativePrompt: pickEnvValue('FRESHWEB_IMAGE_NEGATIVE_PROMPT')
        || 'blurry, low detail, warped anatomy, broken perspective',
    },
    openingStart: {
      enabled: OPENING_START_ENABLED,
      mode: OPENING_START_MODE,
      interval: OPENING_START_INTERVAL,
      model: {
        model: OPENING_START_MODEL,
        hfProvider: OPENING_START_PROVIDER,
        num_inference_steps: OPENING_START_STEPS,
        guidance_scale: OPENING_START_GUIDANCE,
        negative_prompt: OPENING_START_NEGATIVE_PROMPT,
        seed: OPENING_START_SEED,
        width: OPENING_START_WIDTH,
        height: OPENING_START_HEIGHT,
      },
    },
    driftCorrection: {
      enabled: ENABLE_DRIFT_CORRECTION,
      level: DRIFT_CORRECTION_LEVEL,
      useCameraReference: DRIFT_CORRECTION_USE_CAMERA_REFERENCE,
      contextBuffer: {
        enabled: DRIFT_CONTEXT_BUFFER_ENABLED,
        size: DRIFT_CONTEXT_BUFFER_SIZE,
        columns: DRIFT_CONTEXT_BUFFER_COLUMNS,
        rows: DRIFT_CONTEXT_BUFFER_ROWS,
        captureBeforeEachCall: DRIFT_CONTEXT_BUFFER_CAPTURE_BEFORE_EACH_CALL,
      },
      model: {
        model: DRIFT_CORRECTION_MODEL,
        hfProvider: DRIFT_CORRECTION_PROVIDER,
        num_inference_steps: DRIFT_CORRECTION_STEPS,
        guidance_scale: DRIFT_CORRECTION_GUIDANCE,
        negative_prompt: DRIFT_CORRECTION_NEGATIVE_PROMPT,
        seed: DRIFT_CORRECTION_SEED,
        width: DRIFT_CORRECTION_WIDTH,
        height: DRIFT_CORRECTION_HEIGHT,
      },
    },
    video: {
      aspectRatio: pickEnvValue('FRESHWEB_VIDEO_ASPECT_RATIO') || '4:3',
      first: {
        width: parsePositiveNumber(pickEnvValue('FRESHWEB_VIDEO_WIDTH'), 640),
        height: parsePositiveNumber(pickEnvValue('FRESHWEB_VIDEO_HEIGHT'), 480),
        steps: FIRST_LAST_STEPS,
        guidanceScale: FIRST_LAST_GUIDANCE,
        fps: parsePositiveNumber(pickEnvValue('FRESHWEB_VIDEO_FPS'), 10),
        numFrames: parsePositiveNumber(pickEnvValue('FRESHWEB_VIDEO_NUM_FRAMES'), 41),
        customMaxArea: parsePositiveNumber(
          pickEnvValue('FRESHWEB_VIDEO_CUSTOM_MAX_AREA'),
          640 * 480
        ),
        randomizeSeed: parseBoolean(pickEnvValue('FRESHWEB_VIDEO_RANDOMIZE_SEED'), true),
      },
      single: {
        width: parsePositiveNumber(pickEnvValue('FRESHWEB_SINGLE_VIDEO_WIDTH', 'FRESHWEB_SINGLE_WIDTH'), 640),
        height: parsePositiveNumber(pickEnvValue('FRESHWEB_SINGLE_VIDEO_HEIGHT', 'FRESHWEB_SINGLE_HEIGHT'), 480),
        fps: Number(pickEnvValue('FRESHWEB_SINGLE_FPS')) || (FORCE_IMAGE_TO_VIDEO_ONLY ? 10 : 8),
        samplingSteps: Number(pickEnvValue('FRESHWEB_VIDEO_SAMPLING_STEPS')) || (FORCE_IMAGE_TO_VIDEO_ONLY ? 18 : 24),
        guideScale: Number(pickEnvValue('FRESHWEB_VIDEO_GUIDE_SCALE')) || (FORCE_IMAGE_TO_VIDEO_ONLY ? 4 : 5),
        shift: Number(pickEnvValue('FRESHWEB_VIDEO_SHIFT')) || (FORCE_IMAGE_TO_VIDEO_ONLY ? 5 : 4),
      },
    },
    mirelo: {
      steps: parsePositiveNumber(pickEnvValue('FRESHWEB_MIRELO_STEPS'), 10),
      creativityCoef: parseFiniteNumber(pickEnvValue('FRESHWEB_MIRELO_CREATIVITY'), 2.8),
    },
  },
};

const DIRECT_EXPLICIT_FAL_SINGLE_MODEL = String(CONFIG.models.singleVideoModelType || '').trim() === 'falImageToVideo'
  && Boolean(String(CONFIG.models.singleVideoModel || '').trim());
const DIRECT_EXPLICIT_RUNWARE_SINGLE_MODEL = String(CONFIG.models.singleVideoModelType || '').trim() === 'runwareImageToVideo'
  && Boolean(String(CONFIG.models.singleVideoModel || '').trim());
const EFFECTIVE_POLLING_TIME_MS = DIRECT_EXPLICIT_FAL_SINGLE_MODEL && !ALLOW_PAID_FAL_POLLING
  ? null
  : CONFIG.render.pollingTimeMs;

if (DIRECT_EXPLICIT_FAL_SINGLE_MODEL && !ALLOW_PAID_FAL_MULTI_SCENE) {
  CONFIG.story.count = 1;
  CONFIG.story.lengths = [];
  CONFIG.story.sceneCountBias = 0;
  CONFIG.story.sceneCountInitialPattern = [1];
  CONFIG.story.sceneCountTaktmusterCount = 1;
  CONFIG.story.sceneCountTaktmusterZaehler = 1;
  CONFIG.story.sceneCountTaktmusterNenner = 1;
  CONFIG.story.sceneCountTaktmusterTakt = 1;
}

const FAL_KEY = process.env.FAL_KEY || process.env.FAL_API_KEY || process.env.FAL_AI_API_KEY || '';
const RUNWARE_KEY = ENABLE_RUNWARE_FALLBACKS
  ? (process.env.RUNWARE_API_KEY || process.env.RUNWARE_KEY || '')
  : '';
// Wan2.6 Flash supports only a first-frame input, so it must never be offered
// as a first/last-frame fallback.
const FIRST_LAST_RUNWARE_FALLBACKS = [];
const SINGLE_RUNWARE_FALLBACKS = RUNWARE_KEY
  ? [{ type: 'runwareImageToVideo', model: CONFIG.models.runwareSingleModel }]
  : [];
const FIRST_LAST_FAL_FALLBACKS = FAL_KEY
  ? [{ type: 'falFirstLast', model: 'fal-ai/wan-flf2v' }]
  : [];
const SINGLE_FAL_FALLBACKS = FAL_KEY
  ? [
      { type: 'falImageToVideo', model: 'fal-ai/wan/v2.2-5b/image-to-video' },
      { type: 'falImageToVideo', model: 'fal-ai/wan/turbo/image-to-video' },
    ]
  : [];

const { prompt: VISION_PROMPT, providers: BASE_VISION_PROVIDERS } = resolveWebcamVisionSettings({
  middlePrompt: CONFIG.story.visionPrompt,
  testPrompt: '',
  middleProviders: CONFIG.story.visionProviders.join(','),
  testProviders: '',
});
const VISION_PROVIDERS = LOCAL_MISTRAL_AS_VISION
  ? appendUniqueLast(BASE_VISION_PROVIDERS, 'lmstudio')
  : BASE_VISION_PROVIDERS;

const SCENE_PLAN_SYSTEM_PROMPT = resolveWebcamScenePlanSystemPrompt({
  configMode: CONFIG.story.mode,
  scenePlanSystemPrompt: CONFIG.story.scenePlanSystemPrompt,
  cameraScenePlanSystemPrompt: CONFIG.story.cameraScenePlanSystemPrompt,
  sceneFlavor: SINGLE_VIDEO_PROMPT_FLAVOR,
});
const OPENAI_VISION_MODEL = resolveOpenAiModel();

let resolvedSceneLengths = CONFIG.story.lengths.length > 0 ? [...CONFIG.story.lengths] : [];
let sceneLengthSource = resolvedSceneLengths;
let sceneLengthIndex = 0;
let activeSceneDuration = resolvedSceneLengths[0] || 3;
let storyRunIndex = 0;

const nextStoryRunIndex = () => {
  storyRunIndex += 1;
  return storyRunIndex;
};

const nextSceneDuration = () => {
  const nextLength = resolvedSceneLengths[sceneLengthIndex % resolvedSceneLengths.length] || activeSceneDuration;
  sceneLengthIndex += 1;
  activeSceneDuration = nextLength;
  return activeSceneDuration;
};

const setActiveSceneDuration = (value) => {
  activeSceneDuration = Number.isFinite(Number(value)) && Number(value) > 0
    ? Number(value)
    : activeSceneDuration;
  return activeSceneDuration;
};

const currentSceneDuration = () => activeSceneDuration;

const resolveSingleImageDuration = (value) => {
  const plannedDuration = Number(value);
  const normalizedDuration = Number.isFinite(plannedDuration) && plannedDuration > 0
    ? plannedDuration
    : currentSceneDuration();
  const cameraStabilityMax = isReferenceImageActorMode(CONFIG.story.mode)
    ? Number(CONFIG.story.cameraSingleImageStabilityMaxDuration)
    : null;
  const configuredMax = Number(CONFIG.story.singleImageMaxDuration);
  const effectiveMax = [configuredMax, cameraStabilityMax]
    .filter((candidate) => Number.isFinite(candidate) && candidate > 0)
    .reduce((minValue, candidate) => (minValue === null ? candidate : Math.min(minValue, candidate)), null);
  if (Number.isFinite(effectiveMax) && effectiveMax > 0) {
    return Math.min(normalizedDuration, effectiveMax);
  }
  return normalizedDuration;
};

const currentSingleImageDuration = () => {
  return resolveSingleImageDuration(currentSceneDuration());
};

const applyRequestedSceneDurations = (scenePlan = []) => scenePlan.map((scene) => {
  const plannedDuration = Number(scene?.durationSeconds);
  const normalizedDuration = Number.isFinite(plannedDuration) && plannedDuration > 0
    ? plannedDuration
    : null;

  return {
    ...scene,
    requestedDurationSeconds: scene?.videoMode === 'singleImage'
      ? resolveSingleImageDuration(normalizedDuration)
      : normalizedDuration,
  };
});

const createTaktmusterRuntime = ({
  takt,
  taktCnt = takt,
  zaehler = 4,
  nenner = 4,
  type,
  initialPattern = [],
} = {}) => {
  const taktmuster = new Taktmuster();
  taktmuster.setTakt(taktCnt, zaehler, nenner);
  taktmuster.setType(type);
  const pendingInitialPattern = Array.isArray(initialPattern)
    ? initialPattern
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value) && value > 0)
      .map((value) => Math.round(value))
    : [];
  const nextValue = () => {
    const step = taktmuster.getNext();
    const value = Number(step?.patternValue ?? step);
    return Number.isFinite(value) && value > 0 ? Math.round(value) : 1;
  };

  return {
    taktCnt,
    zaehler,
    nenner,
    nextSceneCount: () => (pendingInitialPattern.length > 0 ? pendingInitialPattern.shift() : nextValue()),
    nextSceneLength: () => nextValue(),
  };
};

const sceneCountTaktmusterRuntime = createTaktmusterRuntime({
  taktCnt: CONFIG.story.sceneCountTaktmusterCount,
  zaehler: CONFIG.story.sceneCountTaktmusterZaehler,
  nenner: CONFIG.story.sceneCountTaktmusterNenner,
  type: CONFIG.story.sceneCountTaktmusterType,
  initialPattern: CONFIG.story.sceneCountInitialPattern,
});

const sceneLengthTaktmusterRuntime = createTaktmusterRuntime({
  takt: CONFIG.story.sceneLengthTaktmusterTakt,
  type: CONFIG.story.sceneLengthTaktmusterType,
});

const applySceneCountBias = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 1;
  }
  const bias = Number(CONFIG.story.sceneCountBias);
  if (!Number.isFinite(bias) || Math.abs(bias) < 0.0001) {
    return Math.max(1, Math.floor(parsed));
  }
  return Math.max(1, Math.floor(parsed + bias));
};

const resolveSceneCount = () => {
  return resolveSceneCountFromConfig({
    sceneLengths: CONFIG.story.useTaktmusterLengths ? [] : sceneLengthSource,
    sceneCount: CONFIG.story.count,
    defaultSceneCount: CONFIG.story.useTaktmusterLengths
      ? applySceneCountBias(sceneCountTaktmusterRuntime.nextSceneCount())
      : CONFIG.story.count,
  });
};

const applySceneLengthQualityFloor = (sceneLengths = []) => sceneLengths.map((value) => {
  const minLength = Number(CONFIG.story.minSceneDurationSeconds) || 1;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return minLength;
  }
  return Math.max(minLength, parsed);
});

const applySceneLengthMultiplier = (sceneLengths = []) => {
  const multiplier = Number(CONFIG.story.sceneLengthMultiplier);
  if (!Number.isFinite(multiplier) || multiplier <= 0 || Math.abs(multiplier - 1) < 0.0001) {
    return sceneLengths;
  }

  return sceneLengths.map((value) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return value;
    }
    return Number((parsed * multiplier).toFixed(2));
  });
};

const applySceneLengthBias = (sceneLengths = []) => {
  const bias = Number(CONFIG.story.sceneLengthBias);
  if (!Number.isFinite(bias) || Math.abs(bias) < 0.0001) {
    return sceneLengths;
  }

  return sceneLengths.map((value) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return value;
    }
    return Number((parsed + bias).toFixed(2));
  });
};

const refreshResolvedSceneLengths = async (sceneCount) => {
  const nextSource = CONFIG.story.useTaktmusterLengths
    ? sceneLengthTaktmusterRuntime.nextSceneLength
    : CONFIG.story.lengths;

  sceneLengthSource = nextSource;
  resolvedSceneLengths = applySceneLengthQualityFloor(
    applySceneLengthBias(
      applySceneLengthMultiplier(
        await resolveSceneLengthsInput(nextSource, sceneCount, 3)
      )
    )
  );
  sceneLengthIndex = 0;
  activeSceneDuration = resolvedSceneLengths[0] || 3;
  return resolvedSceneLengths;
};

let latestVisionResult = null;
let openingPromptContinuityVision = '';
const storeVisionResult = createWebcamVisionStoreHandler({ prompt: VISION_PROMPT });

const getFrameVision = createWebcamFrameVision({
  enabled: CONFIG.models.visionEnabled,
  prompt: VISION_PROMPT,
  providers: VISION_PROVIDERS,
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

const CAMERA_CAPTURE_MAX_ATTEMPTS = parsePositiveNumber(
  pickEnvValue('FRESHWEB_CAMERA_CAPTURE_MAX_ATTEMPTS'),
  3
);
const VALIDATE_CAMERA_SHOT = parseBoolean(
  pickEnvValue('FRESHWEB_VALIDATE_CAMERA_SHOT'),
  false
);
const REQUIRE_PERSON_IN_CAMERA = parseBoolean(
  pickEnvValue('FRESHWEB_REQUIRE_PERSON_IN_CAMERA', 'FRESHWEB_CAMERA_REQUIRE_PERSON'),
  false
);
const CAMERA_EMPTY_FRAME_WAIT_MS = parsePositiveNumber(
  pickEnvValue('FRESHWEB_CAMERA_EMPTY_FRAME_WAIT_MS'),
  1500
);
const CAMERA_PRESENCE_PROMPT = pickEnvValue('FRESHWEB_CAMERA_PRESENCE_PROMPT')
  || DEFAULT_CAMERA_PRESENCE_PROMPT;
const CAMERA_PRESENCE_VISION_PROVIDERS = parseCommaList(
  pickEnvValue('FRESHWEB_CAMERA_PRESENCE_VISION_PROVIDERS'),
  ['lmstudio']
);
const PERSON_DESCRIPTION_PROMPT = pickEnvValue('FRESHWEB_PERSONA_DESCRIPTION_PROMPT')
  || [
    'Check only real visible human people in this live camera frame.',
    'Ignore mirrors, posters, paintings, screens, mannequins, printed faces, and reflections.',
    'Reply with exactly three lines:',
    'PERSON_PRESENT: yes or no',
    'PERSON_STRENGTH: integer 0-100 based on how clearly one real visible person is framed and readable',
    'PERSON_DESCRIPTION: one concise sentence describing the strongest visible real person only',
  ].join(' ');
const PERSON_DESCRIPTION_VISION_PROVIDERS = parseCommaList(
  pickEnvValue('FRESHWEB_PERSONA_DESCRIPTION_VISION_PROVIDERS'),
  ['localMistral']
);
const ANSI_RED = '\x1b[31m';
const ANSI_YELLOW = '\x1b[33m';
const ANSI_RESET = '\x1b[0m';
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const cameraPresenceDetector = REQUIRE_PERSON_IN_CAMERA
  ? createCameraPresenceDetector({
      prompt: CAMERA_PRESENCE_PROMPT,
      providers: CAMERA_PRESENCE_VISION_PROVIDERS,
    })
  : null;
const cameraPersonDescriptionHelper = createVisionHelper({
  prompt: PERSON_DESCRIPTION_PROMPT,
  providers: PERSON_DESCRIPTION_VISION_PROVIDERS,
});
let cameraPresenceGuardAvailable = REQUIRE_PERSON_IN_CAMERA;
let hasLoggedCameraPresenceGuardDisable = false;
let cameraPersonDescriptionAvailable = true;
let hasLoggedCameraPersonDescriptionDisable = false;

const parsePersonStrength = (value = '') => {
  const match = String(value || '').match(/PERSON_STRENGTH\s*:\s*(\d{1,3})/i);
  if (!match) return 0;
  const score = Number(match[1]);
  return Number.isFinite(score) ? Math.max(0, Math.min(100, score)) : 0;
};

const parsePersonPresent = (value = '') => /PERSON_PRESENT\s*:\s*yes/i.test(String(value || ''));

const parsePersonDescription = (value = '') => {
  const match = String(value || '').match(/PERSON_DESCRIPTION\s*:\s*(.+)/i);
  return match ? String(match[1]).trim() : '';
};

const describeCameraPerson = async ({ imagePath } = {}) => {
  if (!imagePath || !cameraPersonDescriptionAvailable) {
    return null;
  }

  try {
    const result = await cameraPersonDescriptionHelper({ imagePath });
    const visionText = String(result?.outputText || '').trim();
    return {
      provider: String(result?.provider || '').trim(),
      visionText,
      hasPerson: parsePersonPresent(visionText),
      personStrength: parsePersonStrength(visionText),
      personDescription: parsePersonDescription(visionText),
    };
  } catch (error) {
    cameraPersonDescriptionAvailable = false;
    if (!hasLoggedCameraPersonDescriptionDisable) {
      hasLoggedCameraPersonDescriptionDisable = true;
      console.warn(
        `${ANSI_YELLOW}[freshweb-middle-cost-4-3] local camera person description disabled: ${error?.message || error}${ANSI_RESET}`
      );
    }
    return null;
  }
};

const captureBestPersonaReferenceShot = async ({ burstCount = ASYNC_WEBCAM_PERSONA_REFERENCE_BURST_COUNT } = {}) => {
  const totalCaptures = Math.max(1, Number(burstCount) || 1);
  let bestShot = null;

  for (let index = 0; index < totalCaptures; index += 1) {
    const captured = await captureValidatedCameraShot();
    const described = await describeCameraPerson({ imagePath: captured.imagePath });
    const currentShot = {
      path: captured.imagePath,
      metadata: {
        personDescription: described?.personDescription || '',
        personStrength: described?.hasPerson ? (described?.personStrength || 0) : 0,
        provider: described?.provider || '',
        visionText: described?.visionText || '',
      },
    };
    if (!bestShot || currentShot.metadata.personStrength > bestShot.metadata.personStrength) {
      bestShot = currentShot;
    }
  }

  return bestShot;
};

const looksLikeBadCameraShot = (visionText = '') => {
  const text = normalizeVisionText(visionText).toLowerCase();
  if (!text) {
    return true;
  }

  const badSignals = [
    '(none visible)',
    'none visible',
    'interior room ceiling detail',
    'underside of a ceiling',
    'exposed pipes',
    'upper wall segments',
    'no visible person',
    'no visible actor',
  ];
  if (badSignals.some((signal) => text.includes(signal))) {
    return true;
  }

  const goodSignals = [
    'person',
    'actor',
    'man',
    'woman',
    'face',
    'portrait',
    'selfie',
    'shoulders up',
    'glasses',
    'smile',
    'gaze',
  ];
  return !goodSignals.some((signal) => text.includes(signal));
};

const sceneGenerator = createWebcamSceneGenerator({
  openai,
  fallbackOpenai: localMistralChatFallback,
  model: CONFIG.models.chatModel,
  fallbackModel: LOCAL_MISTRAL_MODEL,
  // Planner receives the compact system contract from createSceneGenerator.
  // Older presets may still carry long prompt overrides, but no longer expand
  // the paid whole-sequence planning request.
  systemPrompt: '',
  temperature: SCENE_PLAN_TEMPERATURE,
  top_p: SCENE_PLAN_TOP_P,
});

const resolveLaterClipSingleImageMode = ({ isLast } = {}) => {
  if (CONFIG.story.forceImageToVideoOnly) {
    return true;
  }
  if (!CONFIG.story.dynamicLaterSingleImage) {
    return CONFIG.story.laterSingleImageDefault;
  }
  return !Boolean(isLast);
};

const resolveConfiguredVideoMode = ({ index, total, isFirst, isLast }) => {
  if (CONFIG.story.forceImageToVideoOnly) {
    return 'singleImage';
  }
  const useSingleImage = isFirst
    ? CONFIG.story.firstClipVideoMode === 'singleImage'
    : resolveLaterClipSingleImageMode({ index, total, isFirst, isLast });
  return useSingleImage ? 'singleImage' : 'firstLast';
};

const applySceneLoopDefaultsToPlan = (scenePlan = []) => applyWebcamScenePlanVideoModeDefaults(scenePlan, {
  resolveConfiguredVideoMode,
  scenePlanControlsVideoMode: CONFIG.story.controlsVideoMode,
  firstClipVideoMode: CONFIG.story.firstClipVideoMode,
});

const isLtxSingleVideoModel = (value = '') => String(value || '')
  .trim()
  .toLowerCase()
  .startsWith('ltx');

const resolveSingleVideoPromptFlavor = () => {
  if (SINGLE_VIDEO_PROMPT_FLAVOR) {
    return SINGLE_VIDEO_PROMPT_FLAVOR;
  }
  return isLtxSingleVideoModel(CONFIG.models.singleVideoModelType) ? 'ltx' : 'default';
};
const SINGLE_VIDEO_PROMPT_FLAVOR_RESOLVED = resolveSingleVideoPromptFlavor();

const image = {
  ...(USE_WEBCAM_PERSONA_REFERENCE
    ? {
      type: 'imageActorInScene',
      model: {
        model: WEBCAM_PERSONA_REFERENCE_MODEL,
        hfProvider: WEBCAM_PERSONA_REFERENCE_PROVIDER,
        width: CONFIG.render.image.width,
        height: CONFIG.render.image.height,
        num_inference_steps: CONFIG.render.image.numInferenceSteps,
        guidance_scale: CONFIG.render.image.guidanceScale,
        negative_prompt: CONFIG.render.image.negativePrompt,
        seed: CONFIG.models.imageSeed,
      },
    }
    : {}),
  fluxVariant: CONFIG.render.fluxVariant,
  width: CONFIG.render.image.width,
  height: CONFIG.render.image.height,
  num_inference_steps: CONFIG.render.image.numInferenceSteps,
  guidance_scale: CONFIG.render.image.guidanceScale,
  negative_prompt: CONFIG.render.image.negativePrompt,
  seed: CONFIG.models.imageSeed,
  prompts: {
    create: createWebcamImagePromptHandler,
  },
  staticPrompt: {},
};

const video = {
  prompts: {
    create: createWebcamFirstLastPrompt({
      configMode: CONFIG.story.mode,
      getFrameVision,
      getContinuityFrameVision: getPromptContinuityVision,
      setActiveSceneDuration,
      nextSceneDuration,
      lockActorCount: !CONFIG.story.allowPeople,
      cameraSourceLabel: CONFIG.camera.sourceLabel,
    }),
  },
  model: {
    type: CONFIG.models.firstLastVideoModelType,
    ...(CONFIG.models.firstLastVideoModel ? { model: CONFIG.models.firstLastVideoModel } : {}),
    audioOnly: true,
    providerAudio: WAN_NATIVE_AUDIO_ENABLED,
    steps: CONFIG.render.video.first.steps,
    duration_seconds: currentSceneDuration,
    width: CONFIG.render.video.first.width,
    height: CONFIG.render.video.first.height,
    guidance_scale: CONFIG.render.video.first.guidanceScale,
    fps: CONFIG.render.video.first.fps,
    seed: CONFIG.models.videoSeed,
    randomize_seed: CONFIG.render.video.first.randomizeSeed,
    custom_max_area: CONFIG.render.video.first.customMaxArea,
    space: CONFIG.models.wanFirstLastSpace,
    selfHostedHugginfaceModel: CONFIG.models.useSelfHostedFirstLast,
    selfHostedHugginfaceSpace: CONFIG.models.wanFirstLastSelfHostedSpace,
    aspect_ratio: CONFIG.render.video.aspectRatio,
    ...(VIDEO_MAX_RETRIES_ON_FAILURE !== null
      ? { maxRetriesOnFailure: VIDEO_MAX_RETRIES_ON_FAILURE }
      : {}),
    retryDelayMs: VIDEO_RETRY_DELAY_MS,
    fallbacks: [
      ...CONFIG.models.wanFirstLastFallbackSpaces.map((space) => ({ type: 'wanFirstLast', space })),
      ...FIRST_LAST_RUNWARE_FALLBACKS,
      ...FIRST_LAST_FAL_FALLBACKS,
    ],
  },
  useImagePrompt: false,
};

const video2 = {
  prompts: {
    create: createWebcamSingleImagePrompt({
      configMode: CONFIG.story.mode,
      getFrameVision,
      getContinuityFrameVision: getPromptContinuityVision,
      setActiveSceneDuration,
      nextSceneDuration,
      promptFlavor: SINGLE_VIDEO_PROMPT_FLAVOR_RESOLVED,
      lockActorCount: !CONFIG.story.allowPeople,
      cameraSourceLabel: CONFIG.camera.sourceLabel,
    }),
  },
  model: {
    type: CONFIG.models.singleVideoModelType,
    ...(CONFIG.models.singleVideoModel ? { model: CONFIG.models.singleVideoModel } : {}),
    audioOnly: true,
    providerAudio: WAN_NATIVE_AUDIO_ENABLED,
    steps: CONFIG.render.video.first.steps,
    duration_seconds: currentSingleImageDuration,
    height: CONFIG.render.video.single.height,
    width: CONFIG.render.video.single.width,
    fps: CONFIG.render.video.single.fps,
    sampling_steps: CONFIG.render.video.single.samplingSteps,
    guide_scale: CONFIG.render.video.single.guideScale,
    shift: CONFIG.render.video.single.shift,
    seed: CONFIG.models.videoSeed,
    randomize_seed: false,
    space: isLtxSingleVideoModel(CONFIG.models.singleVideoModelType)
      ? CONFIG.models.ltxSingleSpace
      : CONFIG.models.wanSingleSpace,
    selfHostedHugginfaceModel: isLtxSingleVideoModel(CONFIG.models.singleVideoModelType)
      ? false
      : CONFIG.models.useSelfHostedSingle,
    selfHostedHugginfaceSpace: isLtxSingleVideoModel(CONFIG.models.singleVideoModelType)
      ? undefined
      : CONFIG.models.wanSingleSelfHostedSpace,
    aspect_ratio: CONFIG.render.video.aspectRatio,
    ...(VIDEO_MAX_RETRIES_ON_FAILURE !== null
      ? { maxRetriesOnFailure: VIDEO_MAX_RETRIES_ON_FAILURE }
      : {}),
    retryDelayMs: VIDEO_RETRY_DELAY_MS,
    fallbacks: isLtxSingleVideoModel(CONFIG.models.singleVideoModelType)
      ? [
          ...CONFIG.models.ltxSingleFallbackSpaces.map((space) => ({ type: 'ltxImageToVideo', space })),
        ]
      : DIRECT_EXPLICIT_RUNWARE_SINGLE_MODEL
        ? []
      : DIRECT_EXPLICIT_FAL_SINGLE_MODEL && !ENABLE_PAID_FAL_FALLBACKS
        ? []
      : [
          ...CONFIG.models.wanSingleFallbackSpaces.map((space) => ({ type: 'wanSingleImage', space })),
          ...SINGLE_RUNWARE_FALLBACKS,
          ...SINGLE_FAL_FALLBACKS,
        ],
  },
  useImagePrompt: false,
};

const mireloAI = {
  duration: async () => currentSceneDuration(),
  num_samples: 1,
  steps: CONFIG.render.mirelo.steps,
  seed: -1,
  creativity_coef: CONFIG.render.mirelo.creativityCoef,
  model_version: CONFIG.models.mireloModelVersion,
  maxRetries5xx: 0,
  retryDelayMs: 250,
  auto_upload_if_local: true,
  runwareFallback: {
    enabled: MIRELO_RUNWARE_FALLBACK_ENABLED,
    model: MIRELO_RUNWARE_FALLBACK_MODEL,
    seed: CONFIG.models.videoSeed,
    steps: MIRELO_RUNWARE_FALLBACK_STEPS,
  },
};

const remoteImageLoader = createRemoteImageLoader({
  cacheDir: path.join(CAMERA_OUTPUT_DIR, '.remote-camera-cache'),
});
let remoteCameraImageCursor = 0;

const getRemoteCameraImagePath = (imageUrl, imageIndex) => remoteImageLoader.buildPath(imageUrl, imageIndex, 'camera');
const getRemoteProtagonistImagePath = (imageUrl) => remoteImageLoader.buildPath(imageUrl, 0, 'protagonist');
const getRemoteSceneContextImagePath = (imageUrl, imageIndex) => remoteImageLoader.buildPath(imageUrl, imageIndex, 'scene-context');
const downloadRemoteImageToCache = async (imageUrl, imagePath) => remoteImageLoader.ensureCached(imageUrl, imagePath);
const buildFolderImagesApiUrl = (folderUrl) => {
  const resolvedFolderUrl = String(folderUrl || '').trim();
  return resolvedFolderUrl ? `https://dailydoase.de/api/folder-images?url=${encodeURIComponent(resolvedFolderUrl)}` : '';
};
const loadSceneContextImageUrls = async () => remoteImageLoader.loadFolderImages({
  apiUrl: CONFIG.sceneContextImage.apiUrl || buildFolderImagesApiUrl(CONFIG.sceneContextImage.folderUrl),
  explicitUrls: CONFIG.sceneContextImage.urls.filter(Boolean),
  startAfterImageFile: CONFIG.sceneContextImage.startAfterProtagonist && CONFIG.camera.protagonistImageUrl
    ? path.basename(new URL(CONFIG.camera.protagonistImageUrl).pathname)
    : '',
});
const resolveSceneContextImages = async ({ sceneCount = 0 } = {}) => {
  if (!CONFIG.sceneContextImage.enabled) {
    return [];
  }
  const localImages = await resolveLocalImageEntries({
    imagePaths: CONFIG.sceneContextImage.paths,
    baseDir: PROJECT_ROOT,
  });
  const urls = await loadSceneContextImageUrls();
  const imageSources = [
    ...localImages,
    ...urls.map((url, index) => ({
      path: '',
      url,
      source: `scene-context-remote-${index + 1}`,
    })),
  ];
  if (imageSources.length === 0) {
    return [];
  }
  const count = Math.max(1, Number(sceneCount) || imageSources.length);
  const entries = [];
  for (let index = 0; index < count; index += 1) {
    const imageSource = imageSources[index % imageSources.length];
    const imagePath = imageSource.path
      || getRemoteSceneContextImagePath(imageSource.url, index);
    if (imageSource.url) {
      await downloadRemoteImageToCache(imageSource.url, imagePath);
    }
    entries.push({
      index: index + 1,
      url: imageSource.url,
      path: imagePath,
      source: imageSource.source,
    });
  }
  return entries;
};

const resolveConfiguredCameraImage = async () => {
  if (CONFIG.camera.protagonistImageUrl) {
    const imageUrl = CONFIG.camera.protagonistImageUrl;
    const imagePath = getRemoteProtagonistImagePath(imageUrl);
    await downloadRemoteImageToCache(imageUrl, imagePath);
    return {
      imagePath,
      imageSource: 'protagonist-reference-url',
    };
  }

  if (CONFIG.camera.imageUrls.length > 0) {
    const imageIndex = remoteCameraImageCursor;
    remoteCameraImageCursor += 1;
    const imageUrl = CONFIG.camera.imageUrls[imageIndex % CONFIG.camera.imageUrls.length];
    const imagePath = getRemoteCameraImagePath(imageUrl, imageIndex);
    await downloadRemoteImageToCache(imageUrl, imagePath);
    return {
      imagePath,
      imageSource: `remote-image-${(imageIndex % CONFIG.camera.imageUrls.length) + 1}`,
    };
  }

  if (CONFIG.camera.imagePath) {
    return {
      imagePath: path.resolve(CONFIG.camera.imagePath),
      imageSource: 'configured',
    };
  }

  return {
    imagePath: await captureWebcamImage({
      cameraOutputDir: CONFIG.camera.outputDir,
      cameraFallbackImagePath: CONFIG.camera.fallbackImagePath,
      captureOptions: {
        width: CONFIG.camera.width,
        height: CONFIG.camera.height,
        quality: CONFIG.camera.quality,
        warmupSeconds: CONFIG.camera.warmupSeconds,
        output: 'jpeg',
        extension: 'jpg',
        device: CONFIG.camera.device,
      },
    }),
    imageSource: 'captured',
  };
};

const captureValidatedCameraShot = async ({ attempts = CAMERA_CAPTURE_MAX_ATTEMPTS } = {}) => {
  let fallbackPath = '';
  let emptyFrameCount = 0;
  let usableShotAttempts = 0;

  while (true) {
    const captured = await resolveConfiguredCameraImage();
    const imagePath = captured.imagePath;
    fallbackPath = imagePath;

    if (cameraPresenceDetector && cameraPresenceGuardAvailable) {
      try {
        const presence = await cameraPresenceDetector({ imagePath });
        if (!presence.hasPerson) {
          emptyFrameCount += 1;
          const detail = presence.outputText ? ` | ${presence.outputText}` : '';
          console.warn(
            `${ANSI_RED}[freshweb-middle-cost-4-3] empty webcam frame ${emptyFrameCount}: no person detected by local vision`
            + `${CAMERA_EMPTY_FRAME_WAIT_MS > 0 ? `, waiting ${CAMERA_EMPTY_FRAME_WAIT_MS}ms` : ''}`
            + `${detail}${ANSI_RESET}`
          );
          if (CAMERA_EMPTY_FRAME_WAIT_MS > 0) {
            await wait(CAMERA_EMPTY_FRAME_WAIT_MS);
          }
          continue;
        }
      } catch (error) {
        cameraPresenceGuardAvailable = false;
        if (!hasLoggedCameraPresenceGuardDisable) {
          hasLoggedCameraPresenceGuardDisable = true;
          console.warn(
            `${ANSI_YELLOW}[freshweb-middle-cost-4-3] local camera presence guard disabled: ${error?.message || error}${ANSI_RESET}`
          );
        }
      }
    }

    if (!VALIDATE_CAMERA_SHOT) {
      return {
        imagePath,
        visionText: '',
        imageSource: emptyFrameCount > 0 ? `captured-waited-${emptyFrameCount}` : captured.imageSource,
      };
    }

    const visionText = await getFrameVision(
      { image: { path: imagePath } },
      { prompt: VISION_PROMPT }
    );

    if (!looksLikeBadCameraShot(visionText)) {
      return {
        imagePath,
        visionText,
        imageSource: usableShotAttempts === 0
          ? (emptyFrameCount > 0 ? `captured-waited-${emptyFrameCount}` : captured.imageSource)
          : `captured-retry-${usableShotAttempts + 1}`,
      };
    }

    usableShotAttempts += 1;
    console.warn(
      `[freshweb-middle-cost-4-3] rejected webcam capture ${usableShotAttempts}/${attempts}: frame does not show a usable visible subject`
    );
    if (usableShotAttempts >= attempts) {
      break;
    }
    if (CAMERA_EMPTY_FRAME_WAIT_MS > 0) {
      await wait(CAMERA_EMPTY_FRAME_WAIT_MS);
    }
  }

  return {
    imagePath: fallbackPath,
    visionText: '',
    imageSource: 'captured-fallback',
  };
};

const resolveOpeningCameraShot = async () => captureValidatedCameraShot();

const buildOpeningVisionPayload = (openingCameraShot, openingVisionText) => {
  if (!openingVisionText) {
    return {
      imagePath: openingCameraShot,
      outputText: '',
      provider: '',
      model: '',
    };
  }

  if (latestVisionResult?.imagePath === openingCameraShot) {
    return { ...latestVisionResult };
  }

  return {
    imagePath: openingCameraShot,
    outputText: openingVisionText,
    provider: '',
    model: '',
  };
};

const persistOpeningPersonaReference = async ({
  outputDir,
  openingCameraShot,
} = {}) => {
  const resolvedOpeningCameraShot = String(openingCameraShot || '').trim();
  if (!resolvedOpeningCameraShot) {
    return '';
  }

  const absoluteOpeningCameraShot = path.resolve(resolvedOpeningCameraShot);
  if (!USE_WEBCAM_PERSONA_REFERENCE || !outputDir) {
    return absoluteOpeningCameraShot;
  }

  const resolvedOutputDir = path.resolve(outputDir);
  const targetDir = path.join(resolvedOutputDir, 'parts');
  const ext = path.extname(absoluteOpeningCameraShot) || '.jpg';
  const targetPath = path.join(targetDir, `opening-persona-reference${ext}`);

  await fs.ensureDir(targetDir);
  if (targetPath !== absoluteOpeningCameraShot) {
    await fs.copy(absoluteOpeningCameraShot, targetPath, { overwrite: true });
  }
  return targetPath;
};

const saveCameraSnapshotArtifact = async ({
  outputDir,
  openingCameraShot,
  openingPersonaReferencePath,
  imageSource,
  sourceCues,
  sourceCueRecords,
  semanticValidation,
  sceneCount,
  sceneLengths,
  visionStoryContext,
  rawScenePlan,
  runtimeScenePlan,
  scenePlan,
  openingVision,
  storyRunIndex,
  openingFluxContextActive = false,
  openingFluxContextPrompt = '',
} = {}) => saveWebcamScenePlanArtifact({
  outputDir,
  payload: {
    openAiVisionModel: openingVision?.provider === 'openai'
      ? (openingVision.model || OPENAI_VISION_MODEL)
      : (VISION_PROVIDERS.includes('openai') ? OPENAI_VISION_MODEL : ''),
    openAiSceneModel: CONFIG.models.chatModel,
    configMode: CONFIG.story.mode,
    visionPrompt: VISION_PROMPT,
    visionProviders: VISION_PROVIDERS,
    scenePlanSystemPrompt: SCENE_PLAN_SYSTEM_PROMPT,
    requestedSceneCount: sceneCount,
    effectiveSceneCount: scenePlan.length,
    imagePath: openingCameraShot,
    openingPersonaReferencePath,
    imageSource,
    sourceCues,
    sourceCueRecords,
    semanticValidation,
    visionStoryContext,
    sceneLengths: sceneLengths.slice(0, scenePlan.length),
    vision: openingVision,
    storyRunIndex,
    openingStartMode: CONFIG.render.openingStart.mode,
    openingStartEnabled: CONFIG.render.openingStart.enabled,
    openingStartInterval: CONFIG.render.openingStart.interval,
    openingFluxContextActive,
    openingFluxContextPrompt,
    rawScenePlan,
    runtimeScenePlan,
    appliedScenePlan: scenePlan,
  },
});

const saveSemanticScenePlanArtifacts = async ({
  outputDir,
  sourceCueRecords = [],
  rawScenePlan = [],
  validatedScenePlan = [],
  semanticValidation = null,
} = {}) => {
  const promptDir = path.join(outputDir, 'parts', 'scene-prompts');
  await fs.ensureDir(promptDir);
  await Promise.all([
    fs.writeJson(path.join(promptDir, 'source-cue-records.json'), sourceCueRecords, { spaces: 2 }),
    fs.writeJson(path.join(promptDir, 'raw-scene-plan.json'), rawScenePlan, { spaces: 2 }),
    fs.writeJson(path.join(promptDir, 'final-scene-plan.json'), validatedScenePlan, { spaces: 2 }),
    semanticValidation?.errors?.length > 0
      ? fs.writeJson(path.join(promptDir, 'planner-errors.json'), semanticValidation.errors, { spaces: 2 })
      : Promise.resolve(),
  ]);
};

const buildDriftCorrectionConfig = () => {
  const driftProfile = resolveDriftCorrectionProfile({
    enabled: CONFIG.render.driftCorrection.enabled,
    level: CONFIG.render.driftCorrection.level,
    configMode: CONFIG.story.mode,
  });
  const driftModel = resolveDriftCorrectionModelConfig({
    model: CONFIG.render.driftCorrection.model,
    level: driftProfile.level,
    hasExplicitSteps: DRIFT_CORRECTION_STEPS_INPUT !== '',
    hasExplicitGuidance: DRIFT_CORRECTION_GUIDANCE_INPUT !== '',
  });
  const useCameraReference = driftProfile.enabled
    && CONFIG.render.driftCorrection.useCameraReference;

  return {
    ...CONFIG.render.driftCorrection,
    ...driftProfile,
    model: driftModel,
    cameraMode: isReferenceImageActorMode(CONFIG.story.mode),
    plannerControlled: CONFIG.story.startFrameStrategy.enabled,
    ...(useCameraReference
      ? {
        referenceImage: {
          captureFn: async () => {
            const result = await captureValidatedCameraShot();
            return result.imagePath;
          },
          promptSource: '',
        },
      }
    : {}),
  };
};

const buildSceneLoopConfig = () => ({
  enabled: true,
  imageOnly: {
    enabled: CONFIG.story.imageOnlyTestEnabled,
    runIndex: CONFIG.story.imageOnlyTestRunIndex,
  },
  sceneCount: async () => resolveSceneCount(),
  chainFromPreviousLoopLastFrame: CONFIG.story.chainFromPreviousLoopLastFrame,
  restartFromPreviousMovieLastFrame: CONFIG.story.restartFromPreviousMovieLastFrame,
  mireloMode: CONFIG.story.mireloMode,
  endCard: {
    enabled: END_CARD_ENABLED && Boolean(END_CARD_DOSSIER_PATH),
    dossierPath: END_CARD_DOSSIER_PATH,
    durationSeconds: END_CARD_DURATION_SECONDS,
    width: 1184,
    height: 880,
  },
  collisionTransitions: {
    enabled: COLLISION_TRANSITIONS_ENABLED,
    boundaryTrimSeconds: COLLISION_TRANSITION_BOUNDARY_TRIM_SECONDS,
    transitionSeconds: COLLISION_TRANSITION_DURATION_SECONDS,
    globalForwardDolly: GLOBAL_FORWARD_DOLLY_ENABLED,
  },
  independentSceneStarts: false,
  firstClipUseSingleImage: CONFIG.story.firstClipVideoMode === 'singleImage',
  subsequentClipsUseSingleImage: resolveLaterClipSingleImageMode,
  captureLastFrame: true,
  endFrameAnalysis: {
    enabled: END_FRAME_ANALYSIS_ENABLED && CONFIG.models.visionEnabled,
    analyzeFrame: getFrameVision,
    prompt: END_FRAME_ANALYSIS_PROMPT,
  },
  startFrameStrategy: CONFIG.story.startFrameStrategy,
  // initModels runs before promptFunktion resolves the local Kaufhaus files.
  // Declare the context stage here so its FLUX Kontext model is initialized;
  // promptFunktion fills the resolved image list immediately before scene 1.
  sceneContextImage: {
    enabled: CONFIG.sceneContextImage.enabled,
    model: {
      ...(CONFIG.render.openingStart.model || {}),
    },
  },
  ...(isReferenceImageActorMode(CONFIG.story.mode)
    ? {
        liveStartImage: {
          captureFn: async () => {
            const result = await captureValidatedCameraShot();
            return result.imagePath;
          },
          promptSource: '',
        },
        liveEndImage: {
          captureFn: async () => {
            const result = await captureValidatedCameraShot();
            return result.imagePath;
          },
          promptSource: '',
        },
      }
    : {}),
  openingImage: {
    promptSource: CONFIG.camera.imagePath ? '' : CONFIG.story.openingPromptSource,
    sourceType: 'cameraShot',
    enabled: CONFIG.render.openingStart.enabled,
    usePersonaReferenceForFreshImages: USE_WEBCAM_PERSONA_REFERENCE,
    personaReferenceModel: USE_WEBCAM_PERSONA_REFERENCE
      ? {
        model: WEBCAM_PERSONA_REFERENCE_MODEL,
        hfProvider: WEBCAM_PERSONA_REFERENCE_PROVIDER,
        width: CONFIG.render.image.width,
        height: CONFIG.render.image.height,
        num_inference_steps: CONFIG.render.image.numInferenceSteps,
        guidance_scale: CONFIG.render.image.guidanceScale,
        negative_prompt: CONFIG.render.image.negativePrompt,
        seed: CONFIG.models.imageSeed,
      }
      : undefined,
    asyncPersonaReference: ASYNC_WEBCAM_PERSONA_REFERENCE_UPDATES
      ? {
        enabled: true,
        intervalScenes: ASYNC_WEBCAM_PERSONA_REFERENCE_INTERVAL,
        minBeatMs: ASYNC_WEBCAM_PERSONA_REFERENCE_MIN_BEAT_SECONDS > 0
          ? ASYNC_WEBCAM_PERSONA_REFERENCE_MIN_BEAT_SECONDS * 1000
          : 0,
        captureFn: async () => {
          return captureBestPersonaReferenceShot();
        },
      }
      : undefined,
    mode: CONFIG.render.openingStart.mode,
    interval: CONFIG.render.openingStart.interval,
    model: {
      ...(CONFIG.render.openingStart.model || {}),
    },
    ...(CONFIG.camera.imagePath ? { imagePath: CONFIG.camera.imagePath } : {}),
  },
});

const logSceneLoopSummary = ({
  openingCameraShot,
  openingPersonaReferencePath = '',
  openingFluxContextActive = false,
  openingFluxContextPrompt = '',
  storyRunIndex = 1,
  sourceCues,
  scenePlan,
  sceneLengths,
} = {}) => {
  const loggedSceneLengths = scenePlan
    .map((scene) => Number(scene?.requestedDurationSeconds) || Number(scene?.durationSeconds) || 0)
    .filter((value) => Number.isFinite(value) && value > 0);
  console.log('[freshweb-middle-cost-4-3] openingCameraShot:', openingCameraShot);
  if (openingPersonaReferencePath) {
    console.log('[freshweb-middle-cost-4-3] openingPersonaReference:', openingPersonaReferencePath);
  }
  console.log('[freshweb-middle-cost-4-3] storyRunIndex:', storyRunIndex);
  console.log(
    '[freshweb-middle-cost-4-3] openingStart:',
    `${CONFIG.render.openingStart.mode} | enabled=${CONFIG.render.openingStart.enabled} | interval=${CONFIG.render.openingStart.interval} | active=${openingFluxContextActive}`
  );
  console.log(
    '[freshweb-middle-cost-4-3] driftCorrection:',
    `${CONFIG.render.driftCorrection.level} | enabled=${CONFIG.render.driftCorrection.enabled}`
  );
  if (openingFluxContextPrompt) {
    console.log('[freshweb-middle-cost-4-3] openingStartPrompt:', openingFluxContextPrompt);
  }
  if (CONFIG.story.staticTestMode) {
    console.log('[freshweb-middle-cost-4-3] staticTestMode: enabled');
  }
  console.log('[freshweb-middle-cost-4-3] sourceCues:', sourceCues.join(' | '));
  console.log('[freshweb-middle-cost-4-3] scenePlan:', scenePlan.map((scene) => scene.title).join(' | '));
  console.log('[freshweb-middle-cost-4-3] sceneModes:', scenePlan.map((scene) => scene.videoMode).join(' | '));
  console.log('[freshweb-middle-cost-4-3] IMG_SEED:', CONFIG.models.imageSeed, 'VID_SEED:', CONFIG.models.videoSeed);
  console.log(
    '[freshweb-middle-cost-4-3] sceneCountTaktmuster:',
    `${CONFIG.story.sceneCountTaktmusterType} | ${CONFIG.story.sceneCountTaktmusterCount} x ${CONFIG.story.sceneCountTaktmusterZaehler}/${CONFIG.story.sceneCountTaktmusterNenner}`
  );
  console.log('[freshweb-middle-cost-4-3] sceneCountBias:', CONFIG.story.sceneCountBias);
  console.log(
    '[freshweb-middle-cost-4-3] sceneCountInitialPattern:',
    (CONFIG.story.sceneCountInitialPattern || []).join(',') || 'none'
  );
  console.log(
    '[freshweb-middle-cost-4-3] sceneLengthTaktmuster:',
    `${CONFIG.story.sceneLengthTaktmusterType} | takt ${CONFIG.story.sceneLengthTaktmusterTakt}`
  );
  console.log('[freshweb-middle-cost-4-3] sceneLengthMultiplier:', CONFIG.story.sceneLengthMultiplier);
  console.log('[freshweb-middle-cost-4-3] sceneLengthBias:', CONFIG.story.sceneLengthBias);
  console.log('[freshweb-middle-cost-4-3] imageToVideoOnly:', CONFIG.story.forceImageToVideoOnly);
  console.log('[freshweb-middle-cost-4-3] mireloMode:', CONFIG.story.mireloMode);
  console.log(
    '[freshweb-middle-cost-4-3] sceneLengths:',
    (loggedSceneLengths.length > 0 ? loggedSceneLengths : sceneLengths).join(',')
  );
  console.log('[freshweb-middle-cost-4-3] scenes:');
  for (const scene of scenePlan) {
    const requestedDuration = Number(scene?.requestedDurationSeconds);
    const plannedDuration = Number(scene?.durationSeconds);
    const durationLabel = Number.isFinite(requestedDuration) && requestedDuration > 0
      ? (Number.isFinite(plannedDuration) && plannedDuration > 0 && Math.abs(requestedDuration - plannedDuration) >= 0.01
        ? `${requestedDuration}s (planned ${plannedDuration}s)`
        : `${requestedDuration}s`)
      : `${scene.durationSeconds}s`;
    console.log(
      `  ${scene.index}. ${scene.title} | ${scene.videoMode} | ${scene.frameSource} | ${durationLabel}`
    );
  }
};

const promptFunktion = async (streams, config) => {
  openingPromptContinuityVision = '';
  const currentStoryRunIndex = nextStoryRunIndex();
  const {
    imagePath: openingCameraShot,
    imageSource,
    visionText: capturedVisionText = '',
  } = await resolveOpeningCameraShot();
  const requestedSceneCount = resolveSceneCount();
  const requestedSceneLengths = await refreshResolvedSceneLengths(requestedSceneCount);
  const sceneContextImages = await resolveSceneContextImages({ sceneCount: requestedSceneCount });
  const { sourceCues, sourceCueRecords } = await buildSourceCueBundle({
    streams,
    sceneCount: requestedSceneCount,
    configMode: CONFIG.story.mode,
    staticTestMode: CONFIG.story.staticTestMode,
    staticSourceCues: CONFIG.story.staticSourceCues,
    cueMode: CONFIG.story.sourceCueMode,
  });
  config.semanticStreamLogResponse = sourceCues;
  const openingVisionText = capturedVisionText || await getFrameVision(
    { image: { path: openingCameraShot } },
    { prompt: VISION_PROMPT }
  );
  openingPromptContinuityVision = openingVisionText || '';
  const visionStoryContext = summarizeVisionStoryContext(openingVisionText);
  const openingPersonaReferencePath = await persistOpeningPersonaReference({
    outputDir: config.outputDir,
    openingCameraShot,
  });
  const resolvedOpeningPersonaReferencePath = openingPersonaReferencePath || openingCameraShot;
  const openingVision = buildOpeningVisionPayload(openingCameraShot, openingVisionText);

  let scenePlanResult;
  try {
    scenePlanResult = await generateScenePlanWithFallback({
      generateScenes: sceneGenerator,
      sceneCount: requestedSceneCount,
      sceneLengths: requestedSceneLengths,
      sourceCues,
      sourceCueRecords,
      visualDirection: CONFIG.story.visualDirection,
      visionStoryContext,
      configMode: CONFIG.story.mode,
      sceneFlavor: SINGLE_VIDEO_PROMPT_FLAVOR_RESOLVED,
      strictSemanticValidation: CONFIG.story.semanticStrictMode,
      startFrameStrategy: CONFIG.story.startFrameStrategy,
      onFallback: ({ requestedSceneCount: requestedCount, receivedSceneCount, nextSceneCount }) => {
        console.warn(
          `[freshweb-middle-cost-4-3] scene-plan fallback: requested ${requestedCount}, received ${receivedSceneCount}, retrying with ${nextSceneCount}`
        );
      },
    });
  } catch (error) {
    if (error?.name === 'SemanticSceneValidationError') {
      await saveSemanticScenePlanArtifacts({
        outputDir: config.outputDir,
        sourceCueRecords,
        rawScenePlan: error.rawScenePlan || error.scenePlan || [],
        validatedScenePlan: error.scenePlan || [],
        semanticValidation: error.validation || null,
      });
    }
    throw error;
  }

  const {
    scenePlan: validatedSemanticScenePlan,
    rawScenePlan,
    semanticValidation,
    effectiveSceneLengths,
  } = scenePlanResult;

  await saveSemanticScenePlanArtifacts({
    outputDir: config.outputDir,
    sourceCueRecords,
    rawScenePlan,
    validatedScenePlan: validatedSemanticScenePlan,
    semanticValidation,
  });

  if (isReferenceImageActorMode(CONFIG.story.mode)) {
    const rawCameraPlanIssues = describeWebcamCameraScenePlanIssues(validatedSemanticScenePlan);
    if (rawCameraPlanIssues.length > 0) {
      console.warn(
        `[freshweb-middle-cost-4-3] raw reference-image-actor scene-plan issues${CONFIG.story.forceImageToVideoOnly ? ' (before image-to-video-only override)' : ''}:`,
        rawCameraPlanIssues
      );
    }
  }

  const runtimeScenePlan = applySceneLoopDefaultsToPlan(validatedSemanticScenePlan);
  const scenePlan = isReferenceImageActorMode(CONFIG.story.mode)
    ? sanitizeWebcamCameraScenePlan(runtimeScenePlan, {
        visionStoryContext: openingVisionText,
        sourceCues,
        sceneFlavor: SINGLE_VIDEO_PROMPT_FLAVOR_RESOLVED,
        allowPeople: CONFIG.story.allowPeople,
        trippyReanchorInterval: CONFIG.story.trippyReanchorInterval,
        cameraReanchorInterval: CONFIG.story.cameraReanchorInterval,
        startFrameStrategy: CONFIG.story.startFrameStrategy,
      })
    : runtimeScenePlan;
  const requestedDurationScenePlan = applyRequestedSceneDurations(scenePlan);
  const openingFluxContextActive = shouldUseOpeningFluxContextImage({
    enabled: CONFIG.render.openingStart.enabled,
    mode: CONFIG.render.openingStart.mode,
    interval: CONFIG.render.openingStart.interval,
    iteration: currentStoryRunIndex,
  });
  const openingFluxContextPrompt = openingFluxContextActive
    ? buildOpeningFluxContextPrompt({
        scenePlanEntry: requestedDurationScenePlan[0] || {},
        sourceCues,
        openingVisionText,
        openingPromptSource: CONFIG.story.openingPromptSource,
        promptFlavor: SINGLE_VIDEO_PROMPT_FLAVOR_RESOLVED,
        lockActorCount: !CONFIG.story.allowPeople,
        cameraSourceLabel: CONFIG.camera.sourceLabel,
      })
    : '';

  config.sceneLoop = config.sceneLoop || {};
  config.sceneLoop.imageOnly = {
    ...(config.sceneLoop.imageOnly || {}),
    enabled: CONFIG.story.imageOnlyTestEnabled,
    runIndex: currentStoryRunIndex,
  };
  config.sceneLoop.scenePlan = requestedDurationScenePlan;
  config.sceneLoop.openingImage = {
    ...(config.sceneLoop.openingImage || {}),
    imagePath: resolvedOpeningPersonaReferencePath,
    referenceImagePath: resolvedOpeningPersonaReferencePath,
    personaReferencePath: resolvedOpeningPersonaReferencePath,
    sceneContextReferencePath: sceneContextImages[0]?.path || '',
    sceneContextReferenceUrl: sceneContextImages[0]?.url || '',
    usePersonaReferenceForFreshImages: USE_WEBCAM_PERSONA_REFERENCE,
    personaReferenceModel: USE_WEBCAM_PERSONA_REFERENCE
      ? {
        model: WEBCAM_PERSONA_REFERENCE_MODEL,
        hfProvider: WEBCAM_PERSONA_REFERENCE_PROVIDER,
        width: CONFIG.render.image.width,
        height: CONFIG.render.image.height,
        num_inference_steps: CONFIG.render.image.numInferenceSteps,
        guidance_scale: CONFIG.render.image.guidanceScale,
        negative_prompt: CONFIG.render.image.negativePrompt,
        seed: CONFIG.models.imageSeed,
      }
      : undefined,
    promptSource: (CONFIG.camera.imagePath || CONFIG.camera.imageUrls.length > 0)
      ? ''
      : CONFIG.story.openingPromptSource,
    generatedPrompt: openingFluxContextPrompt,
    sourceType: openingFluxContextActive
      ? 'fluxContext'
      : (CONFIG.camera.imageUrls.length > 0 ? 'cameraImage' : 'cameraShot'),
    active: openingFluxContextActive,
    storyRunIndex: currentStoryRunIndex,
    continuityVisionText: openingVisionText,
    continuityAnchor: visionStoryContext,
  };
  config.sceneLoop.sceneContextImage = {
    enabled: CONFIG.sceneContextImage.enabled && sceneContextImages.length > 0,
    mode: 'fluxContext',
    promptFlavor: SINGLE_VIDEO_PROMPT_FLAVOR_RESOLVED,
    lockActorCount: CONFIG.sceneContextImage.lockActorCount,
    allowPeople: CONFIG.sceneContextImage.allowPeople,
    protagonistAlreadyComposited: CONFIG.sceneContextImage.protagonistAlreadyComposited,
    protagonistReferenceMode: CONFIG.sceneContextImage.protagonistReferenceMode,
    semanticReconstructionPass: CONFIG.sceneContextImage.semanticReconstructionPass,
    images: sceneContextImages,
    promptSource: CONFIG.story.openingPromptSource,
    model: {
      ...(CONFIG.render.openingStart.model || {}),
    },
  };

  await saveCameraSnapshotArtifact({
    outputDir: config.outputDir,
    openingCameraShot: resolvedOpeningPersonaReferencePath,
    openingPersonaReferencePath: resolvedOpeningPersonaReferencePath,
    imageSource,
    sourceCues,
    sourceCueRecords,
    semanticValidation,
    sceneCount: requestedSceneCount,
    sceneLengths: effectiveSceneLengths,
    visionStoryContext,
    rawScenePlan,
    runtimeScenePlan,
    scenePlan: requestedDurationScenePlan,
    openingVision,
    storyRunIndex: currentStoryRunIndex,
    openingFluxContextActive,
    openingFluxContextPrompt,
  });

  logSceneLoopSummary({
    openingCameraShot: resolvedOpeningPersonaReferencePath,
    openingPersonaReferencePath: resolvedOpeningPersonaReferencePath,
    openingFluxContextActive,
    openingFluxContextPrompt,
    storyRunIndex: currentStoryRunIndex,
    sourceCues,
    scenePlan: requestedDurationScenePlan,
    sceneLengths: effectiveSceneLengths,
  });

  return streams;
};

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
    ...(CONFIG.story.imageOnlyTestEnabled
      ? { maxIterations: CONFIG.story.imageOnlyTestRunCount }
      : {}),
  },
  words: CONFIG.story.words,
  video,
  video2,
  mireloAI,
  image,
  driftCorrection: buildDriftCorrectionConfig(),
  sceneLoop: buildSceneLoopConfig(),
  promptFunktion,
};

export default adapterConfig;

import('../../../../semantic-stream.js')
  .then((module) => module.default([adapterConfig]))
  .catch((err) => {
    console.error('Error in shorty-book/LiveContextOrchestrator.js:', err);
    process.exit(1);
  });
