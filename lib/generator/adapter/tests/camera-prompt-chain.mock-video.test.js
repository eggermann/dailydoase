import { afterAll, describe, expect, jest, test } from '@jest/globals';
import dotenv from 'dotenv';
import fs from 'fs-extra';
import OpenAI from 'openai';
import path from 'node:path';
import { Taktmuster } from 'taktmuster';
import { fileURLToPath } from 'node:url';
import promptCreator from '../../../prompt-creator.js';
import { clearWordStreamCache, getWordStreams } from '../../../../semantic-stream.js';
import { extractVisionStoryContext, summarizeVisionStoryContext } from '../helpers/frame-vision.js';

import {
  captureWebcamImage,
  createWebcamFirstLastPrompt,
  createWebcamFrameVision,
  createWebcamSceneGenerator,
  createWebcamSingleImagePrompt,
  describeWebcamCameraScenePlanIssues,
  resolveWebcamScenePlanSystemPrompt,
  resolveWebcamVisionSettings,
  saveWebcamScenePlanArtifact,
  sanitizeWebcamCameraScenePlan,
} from '../shorty-book/webcam-defaults.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '../../../../');

dotenv.config({
  path: path.join(PROJECT_ROOT, '.env'),
  override: false,
});

const TRUTHY_VALUES = new Set(['1', 'true', 'yes', 'on']);
const FALSY_VALUES = new Set(['0', 'false', 'no', 'off']);
const parseBooleanFlag = (value, fallback = false) => {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }
  const normalized = String(value).trim().toLowerCase();
  if (TRUTHY_VALUES.has(normalized)) {
    return true;
  }
  if (FALSY_VALUES.has(normalized)) {
    return false;
  }
  return fallback;
};
const parsePositiveNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};
const parseList = (value) => String(value || '')
  .split(',')
  .map((entry) => entry.trim())
  .filter(Boolean);
const normalizeInlineText = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();

const OUTPUT_DIR = path.resolve(
  __dirname,
  '../../../tests/GENERATIONS/camera-prompt-chain-mock-video-test'
);
const PARTS_DIR = path.join(OUTPUT_DIR, 'parts');
const DEFAULT_SNAPSHOT_IMAGE_PATH = path.resolve(
  __dirname,
  '../../../../tests/GENERATIONS/camera-shot/1773182572552-camera.jpg'
);
const RUN_LIVE_PROMPT_CHAIN_TESTS = ['1', 'true', 'yes', 'on'].includes(
  String(process.env.RUN_LIVE_CAMERA_PROMPT_CHAIN_TESTS || '').trim().toLowerCase()
);
const LOG_PROMPT_CHAIN = parseBooleanFlag(process.env.CAMERA_PROMPT_CHAIN_LOG);
const LOG_VERBOSE_PROMPT_CHAIN = parseBooleanFlag(process.env.CAMERA_PROMPT_CHAIN_LOG_VERBOSE);
const STRICT_PROMPT_CHAIN_MODE = parseBooleanFlag(process.env.CAMERA_PROMPT_CHAIN_STRICT_MODE);
const CAPTURE_LIVE_CAMERA = parseBooleanFlag(process.env.CAMERA_PROMPT_CHAIN_CAPTURE);
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const OPENAI_VISION_MODEL = process.env.OPENAI_VISION_MODEL || OPENAI_MODEL;
const LIVE_TIMEOUT_MS = Number(process.env.CAMERA_PROMPT_CHAIN_TIMEOUT_MS) || 180000;
const DEFAULT_SCENE_LENGTH_SECONDS = parsePositiveNumber(process.env.CAMERA_PROMPT_CHAIN_SCENE_LENGTH, 4);
const SCENE_LENGTH_MULTIPLIER = parsePositiveNumber(
  process.env.CAMERA_PROMPT_CHAIN_SCENE_LENGTH_MULTIPLIER ?? process.env.FRESHWEB_MIDDLE_SCENE_LENGTH_MULTIPLIER,
  1.6
);
const EXPLICIT_SCENE_COUNT = parsePositiveNumber(process.env.CAMERA_PROMPT_CHAIN_SCENE_COUNT, 0);
const EXPLICIT_SCENE_LENGTHS = parseList(process.env.CAMERA_PROMPT_CHAIN_SCENE_LENGTHS)
  .map((entry) => Number(entry))
  .filter((value) => Number.isFinite(value) && value > 0);
const USE_TAKTMUSTER_SCENE_DEFAULTS = parseBooleanFlag(
  process.env.CAMERA_PROMPT_CHAIN_USE_TAKTMUSTER,
  EXPLICIT_SCENE_LENGTHS.length === 0
);
const TAKTMUSTER_TAKT = parsePositiveNumber(
  process.env.CAMERA_PROMPT_CHAIN_TAKT,
  4
);
const TAKTMUSTER_TYPE = String(
  process.env.CAMERA_PROMPT_CHAIN_TAKT_TYPE
  ?? 'balanced'
).trim() || 'balanced';
const FAL_KEY = process.env.FAL_KEY || process.env.FAL_API_KEY || process.env.FAL_AI_API_KEY || '';
const RUNWARE_KEY = process.env.RUNWARE_API_KEY || process.env.RUNWARE_KEY || '';
const WAN22_FIRST_LAST_SPACE = process.env.WAN22_FIRST_LAST_SPACE || 'cakegreen/Wan-2-2-first-last-frame';
const WAN22_SINGLE_SPACE = process.env.WAN22_SINGLE_SPACE || 'Wan-AI/Wan-2.2-5B';
const WAN22_FIRST_LAST_SELF_HOSTED_SPACE = process.env.WAN22_FIRST_LAST_SELF_HOSTED_SPACE || 'eggman-poff/wan-flf2v';
const WAN22_SINGLE_SELF_HOSTED_SPACE = process.env.WAN22_SINGLE_SELF_HOSTED_SPACE || 'eggman-poff/wan-s';
const WAN22_FIRST_LAST_FALLBACK_SPACES = parseList(process.env.WAN22_FIRST_LAST_FALLBACK_SPACES);
const WAN22_SINGLE_FALLBACK_SPACES = parseList(process.env.WAN22_SINGLE_FALLBACK_SPACES);
const USE_SELF_HOSTED_FIRST_LAST = parseBooleanFlag(
  process.env.FRESHWEB_MIDDLE_SELF_HOSTED_FIRST_LAST ?? process.env.FRESHWEB_TEST_SELF_HOSTED_FIRST_LAST,
  true
);
const USE_SELF_HOSTED_SINGLE = parseBooleanFlag(
  process.env.FRESHWEB_MIDDLE_SELF_HOSTED_SINGLE ?? process.env.FRESHWEB_TEST_SELF_HOSTED_SINGLE,
  true
);
const FIRST_LAST_RUNWARE_FALLBACKS = RUNWARE_KEY
  ? [process.env.RUNWARE_FIRST_LAST_MODEL || 'alibaba:wan@2.7']
  : [];
const SINGLE_RUNWARE_FALLBACKS = RUNWARE_KEY
  ? [process.env.RUNWARE_SINGLE_MODEL || 'alibaba:wan@2.6-flash']
  : [];
const FIRST_LAST_FAL_FALLBACKS = FAL_KEY
  ? ['fal-ai/wan-flf2v']
  : [];
const SINGLE_FAL_FALLBACKS = FAL_KEY
  ? ['fal-ai/wan/v2.2-5b/image-to-video', 'fal-ai/wan/turbo/image-to-video']
  : [];

const { prompt: VISION_PROMPT, providers: DEFAULT_VISION_PROVIDERS } = resolveWebcamVisionSettings({
  middlePrompt: process.env.CAMERA_PROMPT_CHAIN_VISION_PROMPT || process.env.FRESHWEB_MIDDLE_VISION_PROMPT,
  testPrompt: process.env.FRESHWEB_TEST_VISION_PROMPT,
  middleProviders: process.env.CAMERA_PROMPT_CHAIN_VISION_PROVIDERS || process.env.FRESHWEB_MIDDLE_VISION_PROVIDERS,
  testProviders: process.env.FRESHWEB_TEST_VISION_PROVIDERS,
});

const VISION_PROVIDERS = DEFAULT_VISION_PROVIDERS.length > 0
  ? DEFAULT_VISION_PROVIDERS
  : ['openai'];

const maybeDescribe = RUN_LIVE_PROMPT_CHAIN_TESTS ? describe : describe.skip;
const ANSI = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  magenta: '\x1b[35m',
};
const LOG_LABEL_WIDTH = 19;
const SCENE_FIELD_ORDER = [
  ['title', 'title'],
  ['beat', 'beat'],
  ['stillPrompt', 'still'],
  ['imageDescription', 'image'],
  ['storyBeat', 'storyBeat'],
  ['motionCue', 'motion'],
  ['cameraCue', 'camera'],
  ['frameSource', 'frameSource'],
  ['videoMode', 'videoMode'],
  ['durationSeconds', 'duration'],
  ['videoPrompt', 'videoPrompt'],
  ['singleImagePrompt', 'singleImage'],
  ['freshImage', 'freshImage'],
  ['useCameraShot', 'useCameraShot'],
];

// Mirror the current middle-cost-4-3 adapter semantics so this inspection test
// uses the same takt-backed default rhythm.
const createPromptChainTaktmusterRuntime = () => {
  const taktmuster = new Taktmuster();
  taktmuster.setTakt(TAKTMUSTER_TAKT);
  taktmuster.setType(TAKTMUSTER_TYPE);

  const nextValue = () => {
    const step = taktmuster.getNext();
    const value = Number(step?.patternValue ?? step);
    return Number.isFinite(value) && value > 0 ? Math.round(value) : 1;
  };

  return {
    takt: TAKTMUSTER_TAKT,
    type: TAKTMUSTER_TYPE,
    nextSceneCount: () => nextValue(),
    nextSceneLength: () => nextValue(),
  };
};

const applySceneLengthMultiplier = (sceneLengths = []) => sceneLengths.map((value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return value;
  }
  return Number((parsed * SCENE_LENGTH_MULTIPLIER).toFixed(2));
});

const resolvePromptChainSceneRequest = () => {
  if (EXPLICIT_SCENE_LENGTHS.length > 0) {
    const sceneCount = EXPLICIT_SCENE_COUNT || EXPLICIT_SCENE_LENGTHS.length;
    const sceneLengths = EXPLICIT_SCENE_LENGTHS.slice(0, sceneCount);
    while (sceneLengths.length < sceneCount) {
      sceneLengths.push(DEFAULT_SCENE_LENGTH_SECONDS);
    }
    return {
      requestedSceneCount: sceneCount,
      requestedSceneLengths: applySceneLengthMultiplier(sceneLengths),
      strategy: 'explicit-scene-lengths',
      sceneLengthMultiplier: SCENE_LENGTH_MULTIPLIER,
      taktmuster: null,
    };
  }

  if (USE_TAKTMUSTER_SCENE_DEFAULTS) {
    const countRuntime = createPromptChainTaktmusterRuntime();
    const lengthRuntime = createPromptChainTaktmusterRuntime();
    const requestedSceneCount = EXPLICIT_SCENE_COUNT || countRuntime.nextSceneCount();
    const requestedSceneLengths = Array.from(
      { length: requestedSceneCount },
      () => lengthRuntime.nextSceneLength()
    );
    return {
      requestedSceneCount,
      requestedSceneLengths: applySceneLengthMultiplier(requestedSceneLengths),
      strategy: 'middle-cost-4-3-taktmuster',
      sceneLengthMultiplier: SCENE_LENGTH_MULTIPLIER,
      taktmuster: {
        takt: countRuntime.takt,
        type: countRuntime.type,
        reference: 'lib/generator/adapter/MIX-again-freshweb.middle-cost-4-3.sh',
      },
    };
  }

  const requestedSceneCount = EXPLICIT_SCENE_COUNT || 2;
  return {
    requestedSceneCount,
    requestedSceneLengths: applySceneLengthMultiplier(Array.from(
      { length: requestedSceneCount },
      () => DEFAULT_SCENE_LENGTH_SECONDS
    )),
    strategy: 'fixed-length',
    sceneLengthMultiplier: SCENE_LENGTH_MULTIPLIER,
    taktmuster: null,
  };
};

const PROMPT_CHAIN_SCENE_REQUEST = resolvePromptChainSceneRequest();

const buildVideoModelInfo = () => ({
  scenePlan: {
    provider: 'openai',
    model: OPENAI_MODEL,
  },
  vision: {
    providers: VISION_PROVIDERS,
    model: OPENAI_VISION_MODEL,
  },
  firstLast: {
    primary: WAN22_FIRST_LAST_SPACE,
    selfHostedEnabled: USE_SELF_HOSTED_FIRST_LAST,
    selfHostedSpace: USE_SELF_HOSTED_FIRST_LAST ? WAN22_FIRST_LAST_SELF_HOSTED_SPACE : '',
    fallbacks: [
      ...WAN22_FIRST_LAST_FALLBACK_SPACES,
      ...FIRST_LAST_RUNWARE_FALLBACKS,
      ...FIRST_LAST_FAL_FALLBACKS,
    ],
  },
  singleImage: {
    primary: WAN22_SINGLE_SPACE,
    selfHostedEnabled: USE_SELF_HOSTED_SINGLE,
    selfHostedSpace: USE_SELF_HOSTED_SINGLE ? WAN22_SINGLE_SELF_HOSTED_SPACE : '',
    fallbacks: [
      ...WAN22_SINGLE_FALLBACK_SPACES,
      ...SINGLE_RUNWARE_FALLBACKS,
      ...SINGLE_FAL_FALLBACKS,
    ],
  },
});

const PROMPT_CHAIN_VIDEO_MODEL_INFO = buildVideoModelInfo();

const orderScenePlanEntry = (scene = {}) => {
  const ordered = {};
  for (const [key] of SCENE_FIELD_ORDER) {
    if (key in scene) {
      ordered[key] = scene[key];
    }
  }
  if ('index' in scene) {
    ordered.index = scene.index;
  }
  for (const [key, value] of Object.entries(scene)) {
    if (!(key in ordered)) {
      ordered[key] = value;
    }
  }
  if ('index' in ordered) {
    const { index, ...rest } = ordered;
    return { index, ...rest };
  }
  return ordered;
};

const orderScenePlan = (scenePlan = []) => (
  Array.isArray(scenePlan) ? scenePlan.map((scene) => orderScenePlanEntry(scene)) : []
);

afterAll(() => {
  clearWordStreamCache();
  try {
    process.stdin.pause();
  } catch {
    // semantic-stream resumes stdin in live mode; pausing it here releases Jest.
  }
});

const logSection = (label, value, color = 'cyan') => {
  if (!LOG_PROMPT_CHAIN) {
    return;
  }

  const tone = ANSI[color] || ANSI.cyan;
  process.stdout.write(`${tone}[camera-prompt-chain] ${label}${ANSI.reset}\n`);
  if (value !== undefined && value !== null && value !== '') {
    process.stdout.write(`${value}\n`);
  }
  process.stdout.write('\n');
};

const compactLogText = (value, maxLength = 320) => {
  const text = normalizeInlineText(value);
  if (LOG_VERBOSE_PROMPT_CHAIN || text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength - 3).trim()}...`;
};

const summarizeScenePlan = (scenePlan = []) => scenePlan
  .map((scene) => `${scene.index}. ${scene.title} | ${scene.videoMode} | ${scene.frameSource} | ${scene.durationSeconds}s`)
  .join('\n');

const colorText = (value, color = 'cyan') => {
  const tone = ANSI[color] || '';
  return tone ? `${tone}${value}${ANSI.reset}` : String(value);
};

const formatBooleanFlag = (value) => (
  value === true ? colorText('yes', 'green') : `${ANSI.dim}no${ANSI.reset}`
);

const formatLogField = (label, value, color = 'green', maxLength = 640) => {
  const text = compactLogText(value, maxLength);
  if (!text && text !== '0') {
    return '';
  }
  return `  ${colorText(String(label).padEnd(LOG_LABEL_WIDTH), 'dim')}${colorText(text, color)}`;
};

const formatPromptLogField = (prompt, maxLength = 1000) => {
  const text = compactLogText(prompt, maxLength);
  if (!text) {
    return '';
  }

  return `  ${colorText(String('prompt').padEnd(LOG_LABEL_WIDTH), 'dim')}${colorText(text, 'magenta')}`;
};

const formatSceneMeta = (scene = {}) => [
  colorText(scene.videoMode || 'unknown', scene.videoMode === 'firstLast' ? 'magenta' : 'yellow'),
  colorText(scene.frameSource || 'unknown', 'cyan'),
  colorText(`${scene.durationSeconds || '?'}s`, 'green'),
  `${colorText('fresh', 'dim')} ${formatBooleanFlag(scene.freshImage === true)}`,
  `${colorText('camera', 'dim')} ${formatBooleanFlag(scene.useCameraShot === true)}`,
].join(`${ANSI.dim} | ${ANSI.reset}`);

const formatSceneCard = (scene = {}, accentColor = 'cyan') => {
  const fields = [
    formatLogField('meta', formatSceneMeta(scene), 'cyan', 1000),
    formatLogField('beat', scene.beat, 'green'),
    formatLogField('still', scene.stillPrompt, 'green'),
    formatLogField('image', scene.imageDescription, 'green'),
    formatLogField('storyBeat', scene.storyBeat, 'green'),
    formatLogField('motion', scene.motionCue, 'yellow'),
    formatLogField('cameraCue', scene.cameraCue, 'yellow'),
    formatLogField('videoPrompt', scene.videoPrompt, 'magenta'),
    formatLogField('singleImage', scene.singleImagePrompt, 'magenta'),
  ].filter(Boolean);

  return [
    `${colorText(`${scene.index}. ${scene.title}`, accentColor)}`,
    ...fields,
  ].join('\n');
};

const formatScenePlanDetails = (scenePlan = [], accentColor = 'cyan') => {
  if (!Array.isArray(scenePlan) || scenePlan.length === 0) {
    return `${ANSI.dim}(empty)${ANSI.reset}`;
  }
  const divider = `${ANSI.dim}${'-'.repeat(72)}${ANSI.reset}`;
  return orderScenePlan(scenePlan)
    .map((scene) => formatSceneCard(scene, accentColor))
    .join(`\n${divider}\n`);
};

const formatVisionStoryContextDetails = (vision) => {
  const context = extractVisionStoryContext(vision);
  const actorLines = Array.isArray(context.actors) && context.actors.length > 0
    ? context.actors
      .map((actor) => `${actor.reference}: ${actor.description}`)
      .join(' | ')
    : context.locationAndActors;

  return [
    formatLogField('location', context.locationSummary || context.location, 'green', 1000),
    formatLogField('actors', actorLines, 'green', 1000),
    formatLogField('setup', context.setupSummary, 'yellow', 1000),
    formatLogField('continuity', context.continuity, 'cyan', 1000),
  ].filter(Boolean).join('\n');
};

const areScenePlansEquivalent = (leftScenePlan = [], rightScenePlan = []) => (
  JSON.stringify(orderScenePlan(leftScenePlan)) === JSON.stringify(orderScenePlan(rightScenePlan))
);

const formatSceneRequestDetails = ({
  requestedSceneCount,
  requestedSceneLengths,
  strategy,
  sceneLengthMultiplier,
  taktmuster,
} = {}) => {
  const lines = [
    formatLogField('strategy', strategy, 'cyan'),
    formatLogField('sceneCount', requestedSceneCount, 'green'),
    formatLogField('sceneLengthMultiplier', sceneLengthMultiplier, 'green'),
    formatLogField('sceneLengths', (requestedSceneLengths || []).join(', '), 'green'),
  ];

  if (taktmuster) {
    lines.push(formatLogField('taktmuster', `${taktmuster.type} | takt ${taktmuster.takt}`, 'yellow'));
    lines.push(formatLogField('reference', taktmuster.reference, 'yellow'));
  }

  return lines.filter(Boolean).join('\n');
};

const formatFallbackList = (values = []) => (
  values.length > 0 ? values.join(' | ') : 'none'
);

const formatVideoModelInfo = (videoModelInfo = {}) => [
  formatLogField('scenePlan', `${videoModelInfo.scenePlan?.provider || 'n/a'} | ${videoModelInfo.scenePlan?.model || 'n/a'}`, 'cyan'),
  formatLogField('vision', `${(videoModelInfo.vision?.providers || []).join(', ') || 'n/a'} | ${videoModelInfo.vision?.model || 'n/a'}`, 'cyan'),
  formatLogField(
    'firstLast',
    [
      `primary ${videoModelInfo.firstLast?.primary || 'n/a'}`,
      videoModelInfo.firstLast?.selfHostedEnabled
        ? `selfHosted ${videoModelInfo.firstLast.selfHostedSpace || 'n/a'}`
        : 'selfHosted off',
    ].join(' | '),
    'yellow'
  ),
  formatLogField('firstLastFb', formatFallbackList(videoModelInfo.firstLast?.fallbacks || []), 'yellow'),
  formatLogField(
    'singleImage',
    [
      `primary ${videoModelInfo.singleImage?.primary || 'n/a'}`,
      videoModelInfo.singleImage?.selfHostedEnabled
        ? `selfHosted ${videoModelInfo.singleImage.selfHostedSpace || 'n/a'}`
        : 'selfHosted off',
    ].join(' | '),
    'yellow'
  ),
  formatLogField('singleImageFb', formatFallbackList(videoModelInfo.singleImage?.fallbacks || []), 'yellow'),
].filter(Boolean).join('\n');

const createModelCallTracker = () => {
  const calls = new Map();

  return {
    record({
      provider = 'unknown',
      model = 'unknown',
      purpose = 'unknown',
    } = {}) {
      const normalizedProvider = normalizeInlineText(provider) || 'unknown';
      const normalizedModel = normalizeInlineText(model) || 'unknown';
      const normalizedPurpose = normalizeInlineText(purpose) || 'unknown';
      const key = `${normalizedProvider}::${normalizedModel}::${normalizedPurpose}`;
      const entry = calls.get(key) || {
        provider: normalizedProvider,
        model: normalizedModel,
        purpose: normalizedPurpose,
        count: 0,
      };
      entry.count += 1;
      calls.set(key, entry);
    },
    getSummary({ note = '' } = {}) {
      const list = Array.from(calls.values()).sort((left, right) => (
        `${left.purpose}:${left.provider}:${left.model}`
          .localeCompare(`${right.purpose}:${right.provider}:${right.model}`)
      ));

      return {
        total: list.reduce((sum, entry) => sum + entry.count, 0),
        list,
        note,
      };
    },
  };
};

const buildEstimatedModelCallSummary = ({
  live,
  requestEstimate,
  sceneModel,
  visionModel,
  visionProviders = [],
} = {}) => {
  if (!live) {
    return {
      total: 0,
      list: [],
      note: 'mocked mode',
    };
  }

  const visionProviderLabel = visionProviders.length > 0
    ? visionProviders.join(', ')
    : 'openai';

  return {
    total: requestEstimate?.total ?? 0,
    list: [
      {
        provider: 'openai',
        model: sceneModel || 'unknown',
        purpose: 'scene-plan',
        count: requestEstimate?.scenePlanRequests ?? 0,
      },
      {
        provider: visionProviderLabel,
        model: visionModel || 'unknown',
        purpose: 'vision',
        count: requestEstimate?.visionRequests ?? 0,
      },
    ],
    note: requestEstimate?.note || '',
  };
};

const formatModelCallSummary = (summary = {}) => {
  const list = Array.isArray(summary?.list) ? summary.list : [];
  const lines = [
    formatLogField('total', summary?.total ?? 0, 'green'),
    ...list.map((entry) => formatLogField(
      entry.purpose === 'scene-plan' ? 'scenePlan' : entry.purpose,
      `${entry.provider} | ${entry.model} | ${entry.count}`,
      entry.purpose === 'scene-plan' ? 'cyan' : 'yellow',
      1000
    )),
  ];

  if (summary?.note) {
    lines.push(formatLogField('note', summary.note, 'cyan', 1000));
  }

  return lines.filter(Boolean).join('\n');
};

const formatBuiltPromptDetails = ({
  scene,
  prompt,
  startFramePath,
  endFramePath = '',
} = {}) => [
  formatLogField('meta', formatSceneMeta(scene), 'cyan', 1000),
  formatLogField('start', startFramePath, 'green', 1000),
  endFramePath ? formatLogField('end', endFramePath, 'green', 1000) : '',
  formatPromptLogField(prompt, 1000),
].filter(Boolean).join('\n');

const estimateOpenAiRequestCount = ({
  sceneCount,
  live,
  strictMode,
} = {}) => {
  if (!live) {
    return {
      total: 0,
      visionRequests: 0,
      scenePlanRequests: 0,
      note: 'mocked mode',
    };
  }

  const resolvedSceneCount = Math.max(1, Number(sceneCount) || 1);
  const visionRequests = resolvedSceneCount > 1 ? `1..${resolvedSceneCount}` : 1;
  const scenePlanRequests = strictMode ? `1..${resolvedSceneCount}` : 1;
  const total = strictMode
    ? `2..${resolvedSceneCount * 2}`
    : (resolvedSceneCount > 1 ? `2..${resolvedSceneCount + 1}` : 2);

  return {
    total,
    visionRequests,
    scenePlanRequests,
    note: strictMode
      ? 'continuity lock keeps start-frame vision fixed; retries only add scene-plan calls'
      : 'continuity lock keeps start-frame vision fixed; one extra vision call only when a scene needs a firstLast destination',
  };
};

const parseSemanticWords = () => {
  const raw = String(
    process.env.CAMERA_PROMPT_CHAIN_SEMANTIC_WORDS
    || 'horror|photo album|grief'
  ).trim();

  return raw
    .split('|')
    .map((entry) => entry.trim())
    .filter(Boolean);
};

const toSemanticStreamWords = (semanticWords = []) => semanticWords.map((entry) => {
  const [rawWord, rawLang] = String(entry).split(',').map((part) => part.trim());
  return [rawWord, rawLang || 'en'];
});

const createSemanticTestStreams = (semanticWords = []) => semanticWords.map((word) => {
  let turn = 0;
  const variants = [
    word,
    `${word} rising tension`,
    `${word} aftershock`,
    `${word} quiet aftermath`,
  ];

  return {
    startWord: word,
    word,
    async getNext() {
      const nextText = variants[turn] || variants[variants.length - 1];
      turn += 1;
      return {
        title: '',
        sentences: {
          prev: [],
          next: [nextText],
        },
      };
    },
  };
});

const resolveSemanticStreams = async (semanticWords = []) => {
  if (RUN_LIVE_PROMPT_CHAIN_TESTS) {
    return getWordStreams(toSemanticStreamWords(semanticWords));
  }

  return createSemanticTestStreams(semanticWords);
};

const buildSourceCuesFromStreams = async ({
  streams,
  sceneCount,
  sourceCueOverride,
} = {}) => {
  if (typeof sourceCueOverride === 'string' && sourceCueOverride.trim()) {
    return sourceCueOverride
      .split('|')
      .map((entry) => entry.trim())
      .filter(Boolean)
      .slice(0, sceneCount);
  }

  const sourceCues = [];
  for (let index = 0; index < sceneCount; index += 1) {
    sourceCues.push(await promptCreator.default(streams, { streamMixType: 'random' }));
  }
  return sourceCues;
};

const parseScenePlanLengthMismatch = (error) => {
  const message = String(error?.message || error || '');
  const match = message.match(/Scene plan length mismatch: expected (\d+), received (\d+)/i);
  if (!match) {
    return null;
  }

  return {
    expected: Number(match[1]),
    received: Number(match[2]),
  };
};

const generateScenePlanWithFallback = async ({
  generateScenes,
  sceneCount,
  sceneLengths,
  configMode,
  visualDirection,
  visionStoryContext,
  sourceCues,
} = {}) => {
  let targetSceneCount = sceneCount;

  while (targetSceneCount >= 1) {
    try {
      const activeSceneLengths = sceneLengths.slice(0, targetSceneCount);
      const scenePlan = await generateScenes({
        sceneCount: targetSceneCount,
        sceneLengths: activeSceneLengths,
        configMode,
        visualDirection,
        visionStoryContext,
        sourceCues,
      });

      return {
        rawScenePlan: scenePlan,
        effectiveSceneCount: targetSceneCount,
        effectiveSceneLengths: activeSceneLengths,
      };
    } catch (error) {
      const mismatch = parseScenePlanLengthMismatch(error);
      if (!mismatch) {
        throw error;
      }

      if (!STRICT_PROMPT_CHAIN_MODE) {
        logSection(
          'scene-plan strict mode',
          `disabled | requested ${targetSceneCount}, received ${mismatch.received}, continue with partial plan`,
          'magenta'
        );
        return {
          rawScenePlan: Array.isArray(error?.scenePlan) ? error.scenePlan : null,
          effectiveSceneCount: mismatch.received,
          effectiveSceneLengths: Array.isArray(error?.resolvedSceneLengths)
            ? error.resolvedSceneLengths
            : sceneLengths.slice(0, mismatch.received),
          mismatch,
          status: mismatch.received > 0 ? 'scene-plan-partial' : 'scene-plan-mismatch',
        };
      }

      const nextSceneCount = Math.max(1, Math.min(targetSceneCount - 1, mismatch.received));
      if (nextSceneCount >= targetSceneCount) {
        throw error;
      }

      logSection(
        'scene-plan fallback',
        `requested ${targetSceneCount}, received ${mismatch.received}, retrying with ${nextSceneCount}`,
        'magenta'
      );
      targetSceneCount = nextSceneCount;
    }
  }

  throw new Error('Unable to generate a valid scene plan.');
};

const cloneFixture = async (sourcePath, targetName) => {
  const targetPath = path.join(PARTS_DIR, targetName);
  await fs.copy(sourcePath, targetPath);
  return targetPath;
};

const createMockVideo = async ({
  scene,
  prompt,
  startFramePath,
  endFramePath,
} = {}) => {
  const stem = `${String(scene.index).padStart(2, '0')}-${scene.videoMode}`;
  const videoPath = path.join(PARTS_DIR, `${stem}.mock.mp4`);
  const jsonPath = path.join(PARTS_DIR, `${stem}.mock.json`);
  const lastFramePath = path.join(PARTS_DIR, `${stem}.last-frame.jpg`);

  await fs.writeFile(videoPath, 'mock video output\n');
  await fs.copy(endFramePath || startFramePath, lastFramePath);
  await fs.writeJson(jsonPath, {
    sceneIndex: scene.index,
    title: scene.title,
    videoMode: scene.videoMode,
    frameSource: scene.frameSource,
    useCameraShot: scene.useCameraShot,
    durationSeconds: scene.durationSeconds,
    scene: orderScenePlanEntry(scene),
    startFramePath,
    endFramePath: endFramePath || '',
    prompt,
  }, { spaces: 2 });

  return {
    file: videoPath,
    lastFramePath,
    jsonPath,
  };
};

const resolveCameraInputPath = async () => {
  const configuredPath = process.env.CAMERA_PROMPT_CHAIN_IMAGE_PATH
    ? path.resolve(process.env.CAMERA_PROMPT_CHAIN_IMAGE_PATH)
    : DEFAULT_SNAPSHOT_IMAGE_PATH;

  if (!CAPTURE_LIVE_CAMERA) {
    return configuredPath;
  }

  const fallbackImagePath = await fs.pathExists(configuredPath) ? configuredPath : '';
  return captureWebcamImage({
    cameraOutputDir: path.resolve(PROJECT_ROOT, 'tests/GENERATIONS/camera-shot'),
    cameraFallbackImagePath: fallbackImagePath,
    captureOptions: {
      width: Number(process.env.CAMERA_WIDTH) || 1024,
      height: Number(process.env.CAMERA_HEIGHT) || 768,
      quality: Number(process.env.CAMERA_QUALITY) || 100,
      warmupSeconds: Number(process.env.CAMERA_WARMUP_SECONDS) || 1,
      output: 'jpeg',
      extension: 'jpg',
      device: process.env.CAMERA_DEVICE || false,
    },
  });
};

const buildMockSceneResponse = () => ({
  choices: [
    {
      message: {
        content: JSON.stringify({
          scenes: [
            {
              title: 'Opening Tension',
              beat: 'the subject notices something off screen',
              stillPrompt: 'the person sits rigid at the desk and watches the dark window',
              imageDescription: 'real camera shot of one person at the desk, shoulders tense, eyes fixed toward the window',
              storyBeat: 'the room feels wrong for the first time',
              motionCue: 'small inhale, eyes shift, shoulders tighten',
              cameraCue: 'subtle handheld drift inward',
              frameSource: 'newImage',
              videoMode: 'singleImage',
              durationSeconds: 4,
              videoPrompt: 'The subject senses movement outside and the room grows tense.',
              singleImagePrompt: 'Hold the same desk shot, then let the subject tense up and glance toward the window.',
              freshImage: true,
              useCameraShot: true,
            },
            {
              title: 'Window Reveal',
              beat: 'the subject leans toward the glass',
              stillPrompt: 'the same person stands partway from the chair, drawn toward the window',
              imageDescription: 'same real room and subject, but the posture is more forward and alarmed',
              storyBeat: 'fear turns into investigation',
              motionCue: 'rise from the chair and lean forward',
              cameraCue: 'slow push closer to the window side of the room',
              frameSource: 'lastFrame',
              videoMode: 'firstLast',
              durationSeconds: 4,
              videoPrompt: 'Move from the seated frame into a forward lean toward the window, building dread.',
              singleImagePrompt: 'Animate the existing desk frame with restrained movement toward the window.',
              freshImage: false,
              useCameraShot: true,
            },
          ],
        }),
      },
    },
  ],
});

const createSceneGeneratorRuntime = async ({
  modelCallTracker,
} = {}) => {
  if (!RUN_LIVE_PROMPT_CHAIN_TESTS) {
    const create = jest.fn(async () => buildMockSceneResponse());
    return {
      generateScenes: createWebcamSceneGenerator({
        openai: {
          chat: {
            completions: {
              create,
            },
          },
        },
        model: 'gpt-test',
        systemPrompt: resolveWebcamScenePlanSystemPrompt({ configMode: 'camera' }),
      }),
      create,
    };
  }

  if (!OPENAI_API_KEY) {
    throw new Error('RUN_LIVE_CAMERA_PROMPT_CHAIN_TESTS requires OPENAI_API_KEY');
  }

  const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
  const liveCreate = openai.chat.completions.create.bind(openai.chat.completions);
  return {
    generateScenes: createWebcamSceneGenerator({
      openai: {
        chat: {
          completions: {
            create: async (payload) => {
              modelCallTracker?.record({
                provider: 'openai',
                model: payload?.model || OPENAI_MODEL,
                purpose: 'scene-plan',
              });
              return liveCreate(payload);
            },
          },
        },
      },
      model: OPENAI_MODEL,
      systemPrompt: resolveWebcamScenePlanSystemPrompt({ configMode: 'camera' }),
    }),
    create: null,
  };
};

const createFrameVisionRuntime = ({
  openingCameraShot,
  endingCameraShot,
  modelCallTracker,
} = {}) => {
  if (!RUN_LIVE_PROMPT_CHAIN_TESTS) {
    const visionByPath = new Map([
      [
        openingCameraShot,
        'Subject: one person seated at a desk, tense and watchful. Setting: a real room with a desk, framed artwork, and window light. Framing: medium webcam shot from desk height. Lighting: soft window light from the side. Location: a real room with a desk, framed artwork, and window light. Actors: Male Actor: bald person with glasses and a dark sweater. Description: the seated desk shot holds on tense shoulders and a fixed look toward the window. Consistency for Next Shot: keep the same person, desk, artwork, and window side of the room.',
      ],
      [
        endingCameraShot,
        'Subject: the same person turned toward the window with raised shoulders. Setting: the same room, but the framing feels tighter and more ominous. Framing: a tighter medium shot toward the window side. Lighting: the same side light with a darker edge. Location: the same room, framed tighter toward the window side. Actors: Male Actor: the same bald person with glasses turned toward the window. Description: the shot tightens as the shoulders rise and the room feels more ominous. Consistency for Next Shot: keep the same actor identity, room, desk area, and window orientation.',
      ],
    ]);

    return jest.fn(async (frame) => (
      visionByPath.get(frame?.image?.path) || visionByPath.get(openingCameraShot) || ''
    ));
  }

  return createWebcamFrameVision({
    enabled: true,
    prompt: VISION_PROMPT,
    providers: VISION_PROVIDERS,
    logPrefix: 'camera-prompt-chain',
    onResult: ({ result }) => {
      modelCallTracker?.record({
        provider: result?.provider || 'unknown',
        model: result?.model || 'unknown',
        purpose: 'vision',
      });
    },
  });
};

const writePromptChain = async ({
  openingCameraShot,
  semanticWords,
  sourceCues,
  requestedSceneCount,
  requestedSceneLengths,
  effectiveSceneCount,
  effectiveSceneLengths,
  visionStoryContext,
  scenePlan,
  promptChain,
  rawScenePlan,
  cameraPlanIssues,
  sceneRequest,
  videoModelInfo,
  estimatedModelCalls,
  actualModelCalls,
  live,
  status = 'ok',
  mismatch = null,
} = {}) => {
  const promptChainPath = path.join(OUTPUT_DIR, 'prompt-chain.json');
  await fs.writeJson(promptChainPath, {
    live,
    status,
    mismatch,
    openAiModel: OPENAI_MODEL,
    openAiSceneModel: OPENAI_MODEL,
    openAiVisionModel: OPENAI_VISION_MODEL,
    visionProviders: VISION_PROVIDERS,
    visionPrompt: VISION_PROMPT,
    requestedSceneCount,
    requestedSceneLengths,
    semanticWords,
    sourceCues,
    effectiveSceneCount,
    effectiveSceneLengths,
    visionStoryContext,
    sceneRequest,
    videoModelInfo,
    estimatedModelCalls,
    actualModelCalls,
    openingCameraShot,
    rawScenePlan: orderScenePlan(rawScenePlan),
    scenePlan: orderScenePlan(scenePlan),
    cameraPlanIssues,
    promptChain,
  }, { spaces: 2 });
  return promptChainPath;
};

test('camera prompt chain writes inspectable mock video prompts', async () => {
  await fs.remove(OUTPUT_DIR);
  await fs.ensureDir(PARTS_DIR);

  const openingSourcePath = await resolveCameraInputPath();
  expect(await fs.pathExists(openingSourcePath)).toBe(true);

  const semanticWords = parseSemanticWords();
  const semanticStreams = await resolveSemanticStreams(semanticWords);
  const sourceCues = await buildSourceCuesFromStreams({
    streams: semanticStreams,
    sceneCount: PROMPT_CHAIN_SCENE_REQUEST.requestedSceneCount,
    sourceCueOverride: process.env.CAMERA_PROMPT_CHAIN_SOURCE_CUES || '',
  });

  const openingCameraShot = await cloneFixture(openingSourcePath, 'scene-1-start.jpg');
  const endingCameraShot = await cloneFixture(openingSourcePath, 'scene-2-end.jpg');
  const modelCallTracker = createModelCallTracker();
  const getFrameVision = createFrameVisionRuntime({
    openingCameraShot,
    endingCameraShot,
    modelCallTracker,
  });
  const { generateScenes, create } = await createSceneGeneratorRuntime({
    modelCallTracker,
  });

  logSection('semantic words', semanticWords.join(' | '), 'yellow');
  logSection('scene request', formatSceneRequestDetails(PROMPT_CHAIN_SCENE_REQUEST), 'cyan');
  if (PROMPT_CHAIN_SCENE_REQUEST.strategy === 'middle-cost-4-3-taktmuster') {
    expect(PROMPT_CHAIN_SCENE_REQUEST.requestedSceneLengths.slice(0, 4)).toEqual(
      [4, 1, 2, 1].map((value) => Number((value * SCENE_LENGTH_MULTIPLIER).toFixed(2)))
    );
  }
  logSection(
    'scene-plan strict mode',
    STRICT_PROMPT_CHAIN_MODE ? 'enabled | retry on scene-count mismatch' : 'disabled | no retry on scene-count mismatch',
    'cyan'
  );
  const requestEstimate = estimateOpenAiRequestCount({
    sceneCount: PROMPT_CHAIN_SCENE_REQUEST.requestedSceneCount,
    live: RUN_LIVE_PROMPT_CHAIN_TESTS,
    strictMode: STRICT_PROMPT_CHAIN_MODE,
  });
  const estimatedModelCalls = buildEstimatedModelCallSummary({
    live: RUN_LIVE_PROMPT_CHAIN_TESTS,
    requestEstimate,
    sceneModel: OPENAI_MODEL,
    visionModel: OPENAI_VISION_MODEL,
    visionProviders: VISION_PROVIDERS,
  });
  logSection(
    'model request estimate',
    formatModelCallSummary(estimatedModelCalls),
    'cyan'
  );
  logSection('video model plan', formatVideoModelInfo(PROMPT_CHAIN_VIDEO_MODEL_INFO), 'yellow');
  logSection('source cues', compactLogText(sourceCues.join(' | '), 220), 'green');
  const openingVision = await getFrameVision({ image: { path: openingCameraShot } }, { prompt: VISION_PROMPT });
  const visionStoryContext = summarizeVisionStoryContext(openingVision);
  const getPromptContinuityVision = async () => openingVision;
  logSection('opening image', openingCameraShot, 'yellow');
  logSection('opening vision', normalizeInlineText(openingVision), 'green');
  logSection('vision story context', formatVisionStoryContextDetails(openingVision), 'green');

  const {
    rawScenePlan,
    effectiveSceneCount,
    effectiveSceneLengths,
    mismatch = null,
    status = 'ok',
  } = await generateScenePlanWithFallback({
    generateScenes,
    sceneCount: PROMPT_CHAIN_SCENE_REQUEST.requestedSceneCount,
    sceneLengths: PROMPT_CHAIN_SCENE_REQUEST.requestedSceneLengths,
    configMode: 'camera',
    visualDirection: process.env.CAMERA_PROMPT_CHAIN_VISUAL_DIRECTION || 'webcam horror realism',
    visionStoryContext,
    sourceCues,
  });
  const resolveActualModelCalls = () => (
    RUN_LIVE_PROMPT_CHAIN_TESTS
      ? modelCallTracker.getSummary({
        note: 'actual successful live model requests after frame-vision cache',
      })
      : {
        total: 0,
        list: [],
        note: 'mocked mode',
      }
  );
  if (status === 'scene-plan-mismatch') {
    const actualModelCalls = resolveActualModelCalls();
    logSection('model calls used', formatModelCallSummary(actualModelCalls), 'cyan');
    const promptChainPath = await writePromptChain({
      openingCameraShot,
      semanticWords,
      sourceCues,
      requestedSceneCount: PROMPT_CHAIN_SCENE_REQUEST.requestedSceneCount,
      requestedSceneLengths: PROMPT_CHAIN_SCENE_REQUEST.requestedSceneLengths,
      effectiveSceneCount,
      effectiveSceneLengths,
      visionStoryContext,
      scenePlan: [],
      promptChain: [],
      rawScenePlan,
      cameraPlanIssues: [],
      sceneRequest: PROMPT_CHAIN_SCENE_REQUEST,
      videoModelInfo: PROMPT_CHAIN_VIDEO_MODEL_INFO,
      estimatedModelCalls,
      actualModelCalls,
      live: RUN_LIVE_PROMPT_CHAIN_TESTS,
      status,
      mismatch,
    });
    logSection('prompt-chain artifact', promptChainPath, 'green');
    expect(await fs.pathExists(promptChainPath)).toBe(true);
    return;
  }
  logSection('raw scene summary', summarizeScenePlan(rawScenePlan), 'magenta');
  logSection('raw scene plan', formatScenePlanDetails(rawScenePlan, 'magenta'), 'magenta');

  const scenePlan = sanitizeWebcamCameraScenePlan(rawScenePlan);
  const cameraPlanIssues = describeWebcamCameraScenePlanIssues(scenePlan);
  if (cameraPlanIssues.length > 0) {
    logSection('camera scene-plan issues', cameraPlanIssues.join('\n'), 'magenta');
  }
  if (!RUN_LIVE_PROMPT_CHAIN_TESTS) {
    expect(cameraPlanIssues).toEqual([]);
  }
  if (areScenePlansEquivalent(rawScenePlan, scenePlan)) {
    logSection('applied scene plan', 'unchanged from raw | no sanitization changes', 'cyan');
  } else {
    logSection('applied scene summary', summarizeScenePlan(scenePlan), 'cyan');
    logSection('applied scene plan', formatScenePlanDetails(scenePlan, 'cyan'), 'cyan');
  }

  await saveWebcamScenePlanArtifact({
    outputDir: OUTPUT_DIR,
    payload: {
      live: RUN_LIVE_PROMPT_CHAIN_TESTS,
      openAiSceneModel: OPENAI_MODEL,
      openAiVisionModel: OPENAI_VISION_MODEL,
      semanticWords,
      sourceCues,
      requestedSceneCount: PROMPT_CHAIN_SCENE_REQUEST.requestedSceneCount,
      requestedSceneLengths: PROMPT_CHAIN_SCENE_REQUEST.requestedSceneLengths,
      effectiveSceneCount,
      effectiveSceneLengths,
      visionStoryContext,
      sceneRequest: PROMPT_CHAIN_SCENE_REQUEST,
      videoModelInfo: PROMPT_CHAIN_VIDEO_MODEL_INFO,
      imagePath: openingCameraShot,
      vision: openingVision,
      rawScenePlan: orderScenePlan(rawScenePlan),
      appliedScenePlan: orderScenePlan(scenePlan),
      cameraPlanIssues,
    },
  });

  const buildSingleImagePrompt = createWebcamSingleImagePrompt({
    configMode: 'camera',
    getFrameVision,
    getContinuityFrameVision: getPromptContinuityVision,
  });
  const buildFirstLastPrompt = createWebcamFirstLastPrompt({
    configMode: 'camera',
    getFrameVision,
    getContinuityFrameVision: getPromptContinuityVision,
  });
  const resolvePromptStartVision = async (startFrame, scene) => (
    await getPromptContinuityVision(startFrame, {
      sceneContext: { index: scene?.index },
      frameContext: { scenePlan, startFrame },
      role: 'continuity',
    })
    || await getFrameVision(startFrame, { prompt: VISION_PROMPT })
  );
  const resolvePromptEndVision = async (endFrame) => (
    await getFrameVision(endFrame, { prompt: VISION_PROMPT })
  );

  const promptChain = [];
  let currentFramePath = openingCameraShot;

  for (const scene of scenePlan) {
    const startFrame = { image: { path: currentFramePath } };

    if (scene.videoMode === 'firstLast') {
      const endFramePath = scene.useCameraShot ? endingCameraShot : currentFramePath;
      const endFrame = { image: { path: endFramePath } };
      const prompt = await buildFirstLastPrompt(
        scene.imageDescription,
        scene.stillPrompt,
        { index: scene.index },
        { scenePlan, startFrame, endFrame }
      );
      const mockVideo = await createMockVideo({
        scene,
        prompt,
        startFramePath: currentFramePath,
        endFramePath,
      });
      logSection(
        `scene ${scene.index} firstLast prompt`,
        formatBuiltPromptDetails({
          scene,
          prompt,
          startFramePath: currentFramePath,
          endFramePath,
        }),
        'yellow'
      );

      currentFramePath = mockVideo.lastFramePath;
      promptChain.push({
        sceneIndex: scene.index,
        title: scene.title,
        videoMode: scene.videoMode,
        scene: orderScenePlanEntry(scene),
        prompt,
        startVision: await resolvePromptStartVision(startFrame, scene),
        endVision: await resolvePromptEndVision(endFrame),
        mockVideo,
      });
      continue;
    }

    const prompt = await buildSingleImagePrompt(
      scene.imageDescription,
      { index: scene.index },
      { scenePlan, startFrame }
    );
    const mockVideo = await createMockVideo({
      scene,
      prompt,
      startFramePath: currentFramePath,
    });
    logSection(
      `scene ${scene.index} singleImage prompt`,
      formatBuiltPromptDetails({
        scene,
        prompt,
        startFramePath: currentFramePath,
      }),
      'yellow'
    );

    currentFramePath = mockVideo.lastFramePath;
    promptChain.push({
      sceneIndex: scene.index,
      title: scene.title,
      videoMode: scene.videoMode,
      scene: orderScenePlanEntry(scene),
      prompt,
      startVision: await resolvePromptStartVision(startFrame, scene),
      mockVideo,
    });
  }

  const promptChainPath = await writePromptChain({
    openingCameraShot,
    semanticWords,
    sourceCues,
    requestedSceneCount: PROMPT_CHAIN_SCENE_REQUEST.requestedSceneCount,
    requestedSceneLengths: PROMPT_CHAIN_SCENE_REQUEST.requestedSceneLengths,
    effectiveSceneCount,
    effectiveSceneLengths,
    visionStoryContext,
    scenePlan,
    promptChain,
    rawScenePlan,
    cameraPlanIssues,
    sceneRequest: PROMPT_CHAIN_SCENE_REQUEST,
    videoModelInfo: PROMPT_CHAIN_VIDEO_MODEL_INFO,
    estimatedModelCalls,
    actualModelCalls: resolveActualModelCalls(),
    live: RUN_LIVE_PROMPT_CHAIN_TESTS,
  });
  logSection('model calls used', formatModelCallSummary(resolveActualModelCalls()), 'cyan');
  logSection('prompt-chain artifact', promptChainPath, 'green');

  if (create) {
    expect(create).toHaveBeenCalledTimes(1);
  }
  expect(promptChain.length).toBeGreaterThan(0);
  const secondScene = promptChain[1];
  expect(promptChain[0].prompt).toMatch(/same real person/i);
  expect(promptChain[0].prompt).toMatch(/tense|glance|shoulders/i);
  expect(promptChain[0].prompt).toContain('Keep the source camera orientation unmirrored');
  expect(promptChain[0].prompt).not.toMatch(/\b(?:Timing|Beat|Motion|Camera):/);
  if (secondScene) {
    expect(secondScene.prompt.length).toBeGreaterThan(80);
    expect(secondScene.prompt).not.toMatch(/\b(?:Timing|Beat|Motion|Camera):/);
  }
  expect(await fs.pathExists(promptChainPath)).toBe(true);
  expect(await fs.pathExists(promptChain[0].mockVideo.file)).toBe(true);
}, RUN_LIVE_PROMPT_CHAIN_TESTS ? LIVE_TIMEOUT_MS : undefined);

maybeDescribe('camera prompt chain live mode', () => {
  test('keeps expensive video generation mocked while running the prompt chain live', async () => {
    const promptChainPath = path.join(OUTPUT_DIR, 'prompt-chain.json');
    expect(await fs.pathExists(promptChainPath)).toBe(true);

    const saved = await fs.readJson(promptChainPath);
    expect(saved.live).toBe(true);
    expect(Array.isArray(saved.promptChain)).toBe(true);
    if (saved.status === 'scene-plan-mismatch') {
      expect(saved.mismatch).toBeTruthy();
      return;
    }
    expect(saved.promptChain.length).toBeGreaterThan(0);
  }, LIVE_TIMEOUT_MS);
});
