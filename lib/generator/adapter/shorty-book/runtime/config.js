import dotenv from 'dotenv';
import OpenAI from 'openai';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  appendUniqueLast,
  clampNumber,
  isReferenceImageActorMode,
  normalizeStoryMode,
  normalizeUrl,
  parseBoolean,
  parseCommaList,
  parseFiniteNumber,
  parseOptionalPositiveNumber,
  parsePipeList,
  parsePositiveNumber,
  parsePositiveNumberList,
  parseWordPairs,
  pickEnvValue,
} from '../LiveContextOrchestrator-config.js';
import {
  normalizeOpeningStartMode,
} from '../opening-start.js';
import {
  normalizeDriftCorrectionLevel,
} from '../drift-correction.js';
import {
  resolveWebcamScenePlanSystemPrompt,
  resolveWebcamVisionSettings,
} from '../webcam-defaults.js';
import { resolveOpenAiModel } from '../../helpers/vision-model.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '../../../../');

// Wrapper scripts `cd` into lib/generator/adapter before starting this module,
// so load the repository root .env explicitly.
dotenv.config({
  path: path.join(PROJECT_ROOT, '.env'),
  override: false,
});

const resolveOpenAiBaseUrl = () => {
  const value = pickEnvValue('OPENAI_BASE_URL', 'OPENAI_API_BASE', 'OPENAI_BASEPATH');
  return value ? String(value).trim() : '';
};

const OPENAI_BASE_URL = resolveOpenAiBaseUrl();
const OPENAI_API_KEY = pickEnvValue('OPENAI_API_KEY') || 'local-mistral';
const OPENAI_REQUEST_TIMEOUT_MS = parsePositiveNumber(
  pickEnvValue('FRESHWEB_OPENAI_REQUEST_TIMEOUT_MS'),
  30_000
);
const openai = new OpenAI({
  apiKey: OPENAI_API_KEY,
  timeout: OPENAI_REQUEST_TIMEOUT_MS,
  maxRetries: 0,
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
      timeout: OPENAI_REQUEST_TIMEOUT_MS,
      maxRetries: 0,
    })
  : null;
const CHAT_MODEL = pickEnvValue(
  'FRESHWEB_SCENE_PLAN_MODEL',
  'OPENAI_MODEL',
  'FRESHWEB_CHAT_MODEL'
) || 'gpt-4o-mini';
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
const MAX_ITERATIONS = parseOptionalPositiveNumber(
  pickEnvValue('FRESHWEB_MAX_ITERATIONS')
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
const IMAGE_SEED = parseFiniteNumber(pickEnvValue('IMG_SEED', 'FRESHWEB_IMG_SEED'), 0);
const VIDEO_SEED = parseFiniteNumber(pickEnvValue('VID_SEED', 'FRESHWEB_VID_SEED'), 0);
const STORY_MODE = normalizeStoryMode(pickEnvValue('FRESHWEB_MODE') || 'reference-image-actor');
const SELFOMAT_ENABLED = parseBoolean(pickEnvValue('FRESHWEB_SELFOMAT_ENABLED'), false);
const SELFOMAT_IMAGE_ONLY = parseBoolean(
  pickEnvValue('FRESHWEB_SELFOMAT_IMAGE_ONLY'),
  false
);
const SCENE_COUNT_MODE = String(
  pickEnvValue('FRESHWEB_SCENE_COUNT_MODE') || 'taktmuster'
).trim().toLowerCase();
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
const STORY_CAMERA_STYLE = pickEnvValue('FRESHWEB_CAMERA_STYLE');
const REALITY_INTRUSION_MODE = (pickEnvValue('FRESHWEB_REALITY_INTRUSION_MODE') || 'semantic')
  .trim()
  .toLowerCase();
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
const CONCAT_TRIM_LEADING_SECONDS = Math.max(
  0,
  parseFiniteNumber(pickEnvValue('FRESHWEB_CONCAT_TRIM_LEADING_SECONDS'), 0)
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
const VISION_MAX_TOKENS = parsePositiveNumber(
  pickEnvValue('FRESHWEB_VISION_MAX_TOKENS'),
  420
);
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
const CAST_CONTEXT_ENABLED = parseBoolean(
  pickEnvValue('FRESHWEB_CAST_CONTEXT_ENABLED'),
  isReferenceImageActorMode(STORY_MODE)
);
const CAST_CONTEXT_MODEL = pickEnvValue('FRESHWEB_CAST_CONTEXT_MODEL')
  || 'bfl:6@1';
const CAST_CONTEXT_PROVIDER = pickEnvValue('FRESHWEB_CAST_CONTEXT_PROVIDER')
  || 'runware';
const CAST_CONTEXT_TIMEOUT_MS = parsePositiveNumber(
  pickEnvValue('FRESHWEB_CAST_CONTEXT_TIMEOUT_MS'),
  120000
);
const CAST_CONTEXT_STEPS = parsePositiveNumber(
  pickEnvValue('FRESHWEB_CAST_CONTEXT_STEPS'),
  28
);
const CAST_CONTEXT_GUIDANCE = parseFiniteNumber(
  pickEnvValue('FRESHWEB_CAST_CONTEXT_GUIDANCE'),
  2.5
);
const CAST_CONTEXT_NEGATIVE_PROMPT = pickEnvValue('FRESHWEB_CAST_CONTEXT_NEGATIVE_PROMPT')
  || 'collage, split screen, picture-in-picture, thumbnails, duplicate face, broken anatomy, identity drift, face swap, altered facial proportions, beautified face, soft lead face, hand over face, fingers near face';
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
const ASYNC_WEBCAM_PERSONA_REFERENCE_UPDATES = USE_WEBCAM_PERSONA_REFERENCE && !SELFOMAT_ENABLED
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
  || 'bfl:3@1';
const DRIFT_CORRECTION_PROVIDER = pickEnvValue('FRESHWEB_DRIFT_CORRECTION_PROVIDER')
  || 'runware';
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
  10
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
const DRIFT_CONTEXT_MAX_REFERENCE_IMAGES = parsePositiveNumber(
  pickEnvValue('FRESHWEB_DRIFT_CONTEXT_MAX_REFERENCE_IMAGES'),
  11
);
const CAMERA_IMAGE_PATH = pickEnvValue(
  'FRESHWEB_CAMERA_IMAGE_PATH',
  'FRESHWEB_OPENING_IMAGE_PATH'
);
const TEST_INPUT_IMAGE_PATH = pickEnvValue(
  'FRESHWEB_TEST_INPUT_IMAGE_PATH',
  'FRESHWEB_PLACEHOLDER_IMAGE_PATH'
);
const TEST_INPUT_IMAGE_MODE = parseBoolean(
  pickEnvValue('FRESHWEB_TEST_INPUT_IMAGE_MODE'),
  Boolean(TEST_INPUT_IMAGE_PATH)
);
const CAMERA_PERSON_QUEUE_PATH = pickEnvValue('FRESHWEB_CAMERA_PERSON_QUEUE_PATH');
const CAMERA_PERSON_QUEUE_CONSUMED_PATH = pickEnvValue('FRESHWEB_CAMERA_PERSON_QUEUE_CONSUMED_PATH');
const CAMERA_IMAGE_PATHS = parsePipeList(
  pickEnvValue('FRESHWEB_CAMERA_IMAGE_PATHS'),
  []
).map((entry) => path.resolve(entry)).filter(Boolean);
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
    words: STORY_WORDS,
    openingPromptSource: OPENING_PROMPT_SOURCE,
    visualDirection: STORY_VISUAL_DIRECTION,
    cameraStyle: STORY_CAMERA_STYLE,
    singleVideoPromptFlavor: SINGLE_VIDEO_PROMPT_FLAVOR,
    realityIntrusionMode: REALITY_INTRUSION_MODE,
    staticTestMode: STATIC_TEST_MODE,
    staticSourceCues: STATIC_TEST_SOURCE_CUES,
    count: EXPLICIT_SCENE_COUNT,
    sceneCountMode: SCENE_COUNT_MODE,
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
    firstClipVideoMode: FIRST_CLIP_VIDEO_MODE,
    laterSingleImageDefault: LATER_SINGLE_IMAGE_DEFAULT,
    dynamicLaterSingleImage: DYNAMIC_LATER_SINGLE_IMAGE,
    lockPromptContinuityToOpeningFrame: LOCK_PROMPT_CONTINUITY_TO_OPENING_FRAME,
    chainFromPreviousLoopLastFrame: CHAIN_FROM_PREVIOUS_LOOP_LAST_FRAME,
    restartFromPreviousMovieLastFrame: RESTART_FROM_PREVIOUS_MOVIE_LAST_FRAME,
    mireloMode: MIRELO_MODE,
    concatTrimLeadingSeconds: CONCAT_TRIM_LEADING_SECONDS,
    scenePlanSystemPrompt: SCENE_PLAN_SYSTEM_PROMPT_OVERRIDE,
    cameraScenePlanSystemPrompt: CAMERA_SCENE_PLAN_SYSTEM_PROMPT_OVERRIDE,
    visionPrompt: VISION_PROMPT_OVERRIDE,
    visionProviders: VISION_PROVIDERS_OVERRIDE ? VISION_PROVIDERS_OVERRIDE.split(',').map((entry) => entry.trim()).filter(Boolean) : [],
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
    runwareFirstLastModel: process.env.RUNWARE_FIRST_LAST_MODEL || 'alibaba:wan@2.7',
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
    urls: SCENE_CONTEXT_IMAGE_URLS,
    folderUrl: SCENE_CONTEXT_IMAGE_FOLDER_URL,
    apiUrl: SCENE_CONTEXT_IMAGE_API_URL,
    startAfterProtagonist: SCENE_CONTEXT_IMAGE_START_AFTER_PROTAGONIST,
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
    castContext: {
      enabled: CAST_CONTEXT_ENABLED,
      timeoutMs: CAST_CONTEXT_TIMEOUT_MS,
      model: {
        model: CAST_CONTEXT_MODEL,
        hfProvider: CAST_CONTEXT_PROVIDER,
        num_inference_steps: CAST_CONTEXT_STEPS,
        guidance_scale: CAST_CONTEXT_GUIDANCE,
        negative_prompt: CAST_CONTEXT_NEGATIVE_PROMPT,
        width: parsePositiveNumber(pickEnvValue('FRESHWEB_CAST_CONTEXT_WIDTH'), 1184),
        height: parsePositiveNumber(pickEnvValue('FRESHWEB_CAST_CONTEXT_HEIGHT'), 880),
      },
    },
    driftCorrection: {
      enabled: ENABLE_DRIFT_CORRECTION,
      level: DRIFT_CORRECTION_LEVEL,
      useCameraReference: DRIFT_CORRECTION_USE_CAMERA_REFERENCE,
      contextBuffer: {
        enabled: DRIFT_CONTEXT_BUFFER_ENABLED,
        size: DRIFT_CONTEXT_BUFFER_SIZE,
        maxReferenceImages: DRIFT_CONTEXT_MAX_REFERENCE_IMAGES,
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
const FIRST_LAST_RUNWARE_FALLBACKS = RUNWARE_KEY
  ? [{ type: 'runwareFirstLast', model: CONFIG.models.runwareFirstLastModel }]
  : [];
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



export default {
  __filename,
  __dirname,
  PROJECT_ROOT,
  resolveOpenAiBaseUrl,
  OPENAI_BASE_URL,
  OPENAI_API_KEY,
  OPENAI_REQUEST_TIMEOUT_MS,
  openai,
  LOCAL_MISTRAL_AS_CHAT,
  LOCAL_MISTRAL_AS_VISION,
  LOCAL_MISTRAL_BASE_URL,
  LOCAL_MISTRAL_MODEL,
  LOCAL_MISTRAL_API_KEY,
  localMistralChatFallback,
  CHAT_MODEL,
  MULTIMODALART_FIRST_LAST_SPACE,
  WAN22_FIRST_LAST_SPACE,
  WAN22_SINGLE_SPACE,
  LTX_SINGLE_SPACE,
  WAN22_FIRST_LAST_SELF_HOSTED_SPACE,
  WAN22_SINGLE_SELF_HOSTED_SPACE,
  FIRST_LAST_VIDEO_MODEL_TYPE,
  FIRST_LAST_VIDEO_MODEL,
  SINGLE_VIDEO_MODEL_TYPE,
  SINGLE_VIDEO_MODEL,
  SINGLE_VIDEO_PROMPT_FLAVOR,
  LTX_SINGLE_FALLBACK_SPACES,
  WAN_FIRST_LAST_FALLBACK_SPACES,
  WAN_SINGLE_FALLBACK_SPACES,
  USE_MULTIMODALART_FIRST_LAST,
  USE_SELF_HOSTED_FIRST_LAST,
  USE_SELF_HOSTED_SINGLE,
  ENABLE_RUNWARE_FALLBACKS,
  ENABLE_PAID_FAL_FALLBACKS,
  ALLOW_PAID_FAL_POLLING,
  ALLOW_PAID_FAL_MULTI_SCENE,
  RETRY_ON_FAILURE,
  MAX_ITERATIONS,
  VIDEO_MAX_RETRIES_ON_FAILURE,
  VIDEO_RETRY_DELAY_MS,
  RESOLVED_WAN22_FIRST_LAST_SPACE,
  RESOLVED_USE_SELF_HOSTED_FIRST_LAST,
  EXPLICIT_SCENE_LENGTHS,
  EXPLICIT_SCENE_COUNT,
  SCENE_COUNT_BIAS,
  SCENE_COUNT_TAKTMUSTER_COUNT,
  SCENE_COUNT_TAKTMUSTER_ZAEHLER,
  SCENE_COUNT_TAKTMUSTER_NENNER,
  SCENE_COUNT_INITIAL_PATTERN,
  TRIPPY_REANCHOR_INTERVAL,
  CAMERA_REANCHOR_INTERVAL,
  USE_TAKTMUSTER_LENGTHS,
  FORCE_IMAGE_TO_VIDEO_ONLY,
  DEFAULT_SCENE_LENGTH_MULTIPLIER,
  SCENE_COUNT_TAKTMUSTER_TAKT,
  SCENE_COUNT_TAKTMUSTER_TYPE,
  SCENE_LENGTH_TAKTMUSTER_TAKT,
  SCENE_LENGTH_TAKTMUSTER_TYPE,
  SCENE_LENGTH_BIAS,
  SCENE_PLAN_TEMPERATURE,
  SCENE_PLAN_TOP_P,
  IMAGE_SEED,
  VIDEO_SEED,
  STORY_MODE,
  SELFOMAT_ENABLED,
  SELFOMAT_IMAGE_ONLY,
  SCENE_COUNT_MODE,
  STORY_WORDS,
  OPENING_PROMPT_SOURCE,
  STORY_VISUAL_DIRECTION,
  STORY_CAMERA_STYLE,
  REALITY_INTRUSION_MODE,
  STATIC_TEST_MODE,
  STATIC_TEST_SOURCE_CUES,
  SCENE_LENGTH_MULTIPLIER,
  MIN_SCENE_DURATION_SECONDS,
  SINGLE_IMAGE_MAX_DURATION,
  CAMERA_SINGLE_IMAGE_STABILITY_MAX_DURATION,
  CAMERA_FIRST_LAST_MAX_DURATION,
  FIRST_LAST_STEPS,
  FIRST_LAST_GUIDANCE,
  SCENE_PLAN_CONTROLS_VIDEO_MODE,
  FIRST_CLIP_VIDEO_MODE,
  LATER_SINGLE_IMAGE_DEFAULT,
  DYNAMIC_LATER_SINGLE_IMAGE,
  LOCK_PROMPT_CONTINUITY_TO_OPENING_FRAME,
  RESTART_FROM_PREVIOUS_MOVIE_LAST_FRAME,
  CHAIN_FROM_PREVIOUS_LOOP_LAST_FRAME,
  MIRELO_MODE,
  CONCAT_TRIM_LEADING_SECONDS,
  SCENE_PLAN_SYSTEM_PROMPT_OVERRIDE,
  CAMERA_SCENE_PLAN_SYSTEM_PROMPT_OVERRIDE,
  VISION_PROMPT_OVERRIDE,
  VISION_PROVIDERS_OVERRIDE,
  VISION_ENABLED,
  VISION_MAX_TOKENS,
  FOLDER_NAME,
  FLUX_VARIANT,
  OPENING_START_ENABLED,
  OPENING_START_MODE,
  OPENING_START_INTERVAL,
  OPENING_START_MODEL,
  OPENING_START_PROVIDER,
  OPENING_START_STEPS,
  OPENING_START_GUIDANCE,
  OPENING_START_NEGATIVE_PROMPT,
  OPENING_START_SEED,
  OPENING_START_WIDTH,
  OPENING_START_HEIGHT,
  CAST_CONTEXT_ENABLED,
  CAST_CONTEXT_MODEL,
  CAST_CONTEXT_PROVIDER,
  CAST_CONTEXT_TIMEOUT_MS,
  CAST_CONTEXT_STEPS,
  CAST_CONTEXT_GUIDANCE,
  CAST_CONTEXT_NEGATIVE_PROMPT,
  USE_WEBCAM_PERSONA_REFERENCE,
  WEBCAM_PERSONA_REFERENCE_MODEL,
  WEBCAM_PERSONA_REFERENCE_PROVIDER,
  ASYNC_WEBCAM_PERSONA_REFERENCE_UPDATES,
  ASYNC_WEBCAM_PERSONA_REFERENCE_INTERVAL,
  ASYNC_WEBCAM_PERSONA_REFERENCE_BURST_COUNT,
  ASYNC_WEBCAM_PERSONA_REFERENCE_MIN_BEAT_SECONDS,
  DRIFT_CORRECTION_LEVEL,
  ENABLE_DRIFT_CORRECTION,
  DRIFT_CORRECTION_MODEL,
  DRIFT_CORRECTION_PROVIDER,
  DRIFT_CORRECTION_STEPS_INPUT,
  DRIFT_CORRECTION_STEPS,
  DRIFT_CORRECTION_GUIDANCE_INPUT,
  DRIFT_CORRECTION_GUIDANCE,
  DRIFT_CORRECTION_NEGATIVE_PROMPT,
  DRIFT_CORRECTION_SEED,
  DRIFT_CORRECTION_WIDTH,
  DRIFT_CORRECTION_HEIGHT,
  DRIFT_CORRECTION_USE_CAMERA_REFERENCE,
  DRIFT_CONTEXT_BUFFER_ENABLED,
  DRIFT_CONTEXT_BUFFER_SIZE,
  DRIFT_CONTEXT_BUFFER_COLUMNS,
  DRIFT_CONTEXT_BUFFER_ROWS,
  DRIFT_CONTEXT_BUFFER_CAPTURE_BEFORE_EACH_CALL,
  DRIFT_CONTEXT_MAX_REFERENCE_IMAGES,
  CAMERA_IMAGE_PATH,
  TEST_INPUT_IMAGE_PATH,
  TEST_INPUT_IMAGE_MODE,
  CAMERA_PERSON_QUEUE_PATH,
  CAMERA_PERSON_QUEUE_CONSUMED_PATH,
  CAMERA_IMAGE_PATHS,
  CAMERA_IMAGE_URL,
  PROTAGONIST_IMAGE_URL,
  CAMERA_IMAGE_URLS,
  SCENE_CONTEXT_IMAGE_URLS,
  SCENE_CONTEXT_IMAGE_FOLDER_URL,
  SCENE_CONTEXT_IMAGE_API_URL,
  SCENE_CONTEXT_IMAGE_MAPPING_ENABLED,
  SCENE_CONTEXT_IMAGE_START_AFTER_PROTAGONIST,
  CAMERA_FALLBACK_IMAGE_PATH,
  CAMERA_OUTPUT_DIR,
  CAMERA_SOURCE_LABEL,
  CONFIG,
  DIRECT_EXPLICIT_FAL_SINGLE_MODEL,
  DIRECT_EXPLICIT_RUNWARE_SINGLE_MODEL,
  EFFECTIVE_POLLING_TIME_MS,
  FAL_KEY,
  RUNWARE_KEY,
  FIRST_LAST_RUNWARE_FALLBACKS,
  SINGLE_RUNWARE_FALLBACKS,
  FIRST_LAST_FAL_FALLBACKS,
  SINGLE_FAL_FALLBACKS,
  VISION_PROVIDERS,
  SCENE_PLAN_SYSTEM_PROMPT,
  OPENAI_VISION_MODEL,
  VISION_PROMPT,
  BASE_VISION_PROVIDERS,
};

