import {
  MONSTER_FREE_FOCUSES,
  MONSTER_VISIBLE_FOCUSES,
  enforceMonsterEntryStartFrame,
  VALID_SCENE_FOCUSES,
  isMonsterExplicitlyAbsent,
  needsMonsterIdentitySeed,
  mustGenerateFreshCanonicalMonsterFrame,
  normalizeSceneFocus,
  shouldIncludeMonsterReference,
  sceneRequiresFreshMonsterFrame,
  validateSceneFocus,
} from './scene-focus.js';
import { compactSceneField } from '../helpers/compact-scene-plan.js';

const cleanPromptText = (value) => String(value || '').trim();

export {
  MONSTER_FREE_FOCUSES,
  MONSTER_VISIBLE_FOCUSES,
  VALID_SCENE_FOCUSES,
  isMonsterExplicitlyAbsent,
  needsMonsterIdentitySeed,
  mustGenerateFreshCanonicalMonsterFrame,
  normalizeSceneFocus,
  shouldIncludeMonsterReference,
  sceneRequiresFreshMonsterFrame,
  enforceMonsterEntryStartFrame,
  validateSceneFocus,
};

export const LOCATION_RULE = [
  'Treat the supplied Kaufhaus image as local physical truth: keep its original viewpoint,',
  'major geometry, dusty matte concrete floor, exposed ducts, cable trays, loose wiring, old fluorescent fixtures,',
  'plain partitions, mirrored steel columns, windows, walls and elevators.',
  'Match its mixed cold daylight and uneven practical light, modest dynamic range, wide-angle perspective,',
  'construction wear, ordinary clutter, imperfect exposure and unpolished material texture.',
  'Keep practical fluorescent pulses, trembling reflections and moving shadows subtle, local and physically tied to the scene action.',
  'The semantic event may alter the local function, arrangement, illumination,',
  'reflection, circulation or spatial behavior of the interior.',
  'Never beautify it into a luxury mall, clean studio set, glossy CGI hall or concept-art environment.',
].join(' ');

const escapeRegularExpression = (value) => String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Planner records keep source-language cue identity for validation. Provider
// prompts must instead use the paired English rendering, even if the model
// repeats the original token inside otherwise English prose.
export const translateSemanticTermsForProductionPrompt = (value, scenePlanEntry = {}) => {
  // Semantic Stream tokens are names, not prose to translate. Keep their exact
  // wording while requiring the surrounding generated sentence to be English.
  return cleanPromptText(value);
};

export const buildEnvironmentFluxPrompt = ({
  scene = {},
  locationRule = LOCATION_RULE,
} = {}) => {
  const prompt = [
  rewriteViewpointVocabulary(cleanPromptText(locationRule)),
  rewriteViewpointVocabulary(cleanPromptText(scene.stillPrompt)),
  scene.consequence ? `Visible result: ${cleanPromptText(scene.consequence)}` : '',
  'Create one unretouched documentary image matching the supplied source in exposure, perspective, wear, grain and material texture. No readable text or logos.',
  ].filter(Boolean).join(' ');
  assertNoAcquisitionDeviceConcepts(prompt, { label: 'environment FLUX prompt' });
  return prompt;
};

export const buildMonsterFluxPrompt = ({
  scene = {},
  locationRule = LOCATION_RULE,
  creatureRule = '',
} = {}) => {
  const prompt = [
  rewriteViewpointVocabulary(cleanPromptText(locationRule)),
  rewriteViewpointVocabulary(cleanPromptText(creatureRule)),
  rewriteViewpointVocabulary(cleanPromptText(scene.stillPrompt)),
  scene.monsterPresence ? `Monster presence: ${cleanPromptText(scene.monsterPresence)}` : '',
  scene.consequence ? `Visible result: ${cleanPromptText(scene.consequence)}` : '',
  'Use the separate protagonist image as the canonical identity of this exact Green Monster.',
  'Preserve its face, proportions, amber eye placement, leaf ears, mouth tendril, rooted botanical structure and weathered physical materials while the planned action determines pose, scale and interaction.',
  'Render the protagonist as a practical sculpture physically present in the Kaufhaus.',
  'Create one unretouched documentary image of the exact canonical protagonist physically present in the real Kaufhaus. No readable text or logos.',
  ].filter(Boolean).join(' ');
  assertNoAcquisitionDeviceConcepts(prompt, { label: 'monster FLUX prompt' });
  return prompt;
};

export const buildFluxPrompt = ({
  scene = {},
  locationRule = LOCATION_RULE,
  creatureRule = '',
} = {}) => (
  shouldIncludeMonsterReference(scene)
    ? buildMonsterFluxPrompt({ scene, locationRule, creatureRule })
    : buildEnvironmentFluxPrompt({ scene, locationRule })
);

export const VIEWPOINT_MOTION_RULE = [
  'Use one physically coherent, continuous viewpoint movement chosen to reveal the event, with subtle organic micro-sway and an imperfect settle.',
].join(' ');

const FORBIDDEN_VIEWPOINT_MOTION = [
  /\borbit\b/i,
  /\bdrone\b/i,
  /\bcrane\b/i,
  /\bgimbal\b/i,
  /\bdolly\b/i,
  /\bfloating\b/i,
  /\bflies through\b/i,
  /\bpasses through\b/i,
  /\b360\b/i,
];

const DEVICE_OR_OPERATOR_LANGUAGE = [
  /\bphone\b/i, /\bmobile device\b/i, /\bcamera operator\b/i,
  /\boperator\b/i, /\bhandheld\b/i, /\bholding (?:a |the )?(?:phone|camera|device)\b/i,
  /\brecording\b/i, /\bfilming\b/i, /\bviewfinder\b/i, /\brecording ui\b/i, /\bscreen\b/i,
];

export const rewriteViewpointVocabulary = (value) => String(value || '')
  .replace(/\bhandheld camera\b/gi, 'viewpoint')
  .replace(/\bhandheld\b/gi, 'lightly imperfect')
  .replace(/\bcamera movement\b/gi, 'viewpoint movement')
  .replace(/\bcamera moves\b/gi, 'viewpoint moves')
  .replace(/\bcamera pans\b/gi, 'viewpoint pans')
  .replace(/\bcamera\b/gi, 'viewpoint')
  .replace(/\bphone\b/gi, '')
  .replace(/\bmobile device\b/gi, '')
  .replace(/\boperator\b/gi, '')
  .replace(/\brecording\b/gi, '')
  .replace(/\bfilming\b/gi, '')
  .replace(/\s+/g, ' ')
  .trim();

export const sanitizeViewpointCue = (value, { durationSeconds = null } = {}) => {
  const cue = String(value || '').replace(/\s+/g, ' ').trim();
  const invalid = !cue
    || FORBIDDEN_VIEWPOINT_MOTION.some((pattern) => pattern.test(cue))
    || DEVICE_OR_OPERATOR_LANGUAGE.some((pattern) => pattern.test(cue));
  if (invalid) {
    return Number(durationSeconds) <= 2
      ? 'The viewpoint remains nearly fixed with one slight imperfect reframe.'
      : 'The viewpoint makes one small restrained adjustment.';
  }
  return compactSceneField(rewriteViewpointVocabulary(cue), 120);
};

export const sanitizeCameraCue = sanitizeViewpointCue;

export const assertNoAcquisitionDeviceConcepts = (prompt, { label = 'visual provider prompt' } = {}) => {
  const match = DEVICE_OR_OPERATOR_LANGUAGE.find((pattern) => pattern.test(String(prompt || '')));
  if (match) throw new Error(`${label} contains acquisition-device language: ${match}`);
};

const MONSTER_IDENTITY_PHRASES = [
  /same real person/gi,
  /saved webcam anchor image/gi,
  /detected person/gi,
  /green monster identity/gi,
  /protagonist reference/gi,
  /creature identity/gi,
  /canonical monster/gi,
  /monster protagonist/gi,
];

export const stripMonsterIdentityFromMonsterFreePrompt = (prompt, scene = {}) => {
  if (shouldIncludeMonsterReference(scene)) return cleanPromptText(prompt);
  return MONSTER_IDENTITY_PHRASES.reduce(
    (cleaned, pattern) => cleaned.replace(pattern, ''),
    String(prompt || '')
  ).replace(/\s+/g, ' ').trim();
};

export const assertMonsterFreePromptSafety = ({ scene = {}, prompt = '', referenceImages = [] } = {}) => {
  if (shouldIncludeMonsterReference(scene)) return;
  if (referenceImages.length > 0) {
    throw new Error('Monster-free scene unexpectedly contains a protagonist reference image.');
  }
  const forbidden = [
    /same real person/i, /webcam anchor/i, /green monster identity/i,
    /canonical monster/i, /monster enters/i, /monster appears/i,
    /monster emerges/i, /green figure appears/i,
  ];
  const match = forbidden.find((pattern) => pattern.test(String(prompt || '')));
  if (match) {
    throw new Error(`Monster-free scene contains forbidden identity or reveal language: ${match}`);
  }
};

export const buildWanPrompt = ({ scene = {}, allowPeople = true } = {}) => {
  const durationSeconds = Number(
    scene.providerDurationSeconds
    || scene.requestedDurationSeconds
    || scene.durationSeconds
  ) || null;
  const viewpointCue = sanitizeViewpointCue(scene.cameraCue, { durationSeconds });
  const durationRule = Number(durationSeconds) <= 2
    ? 'Use one quick organic reframe or micro-sway while keeping the event readable.'
    : 'Use one motivated observational move with gentle organic sway.';
  const monsterVisible = shouldIncludeMonsterReference(scene);

  const prompt = [
    compactSceneField(scene.videoPrompt, 300),
    viewpointCue ? `Viewpoint: ${viewpointCue}` : '',
    VIEWPOINT_MOTION_RULE,
    durationRule,
    'Let practical fluorescent light fluctuate gently, reflections tremble and shadows move across existing surfaces with the action.',
    scene.consequence
      ? `End state: ${compactSceneField(scene.consequence, 160)}`
      : '',
    monsterVisible
      ? 'Animate the exact canonical protagonist already visible in the start frame and preserve its identity through the motion.'
      : 'Animate the planned event using only subjects already established by the start frame.',
    allowPeople === false
      ? 'Do not introduce new living figures.'
      : '',
  ].filter(Boolean).join(' ');
  assertNoAcquisitionDeviceConcepts(prompt, { label: 'WAN prompt' });
  return prompt;
};

// FLUX needs a still-image description. Motion prompts remain fallbacks only
// for older scene plans that do not yet provide stillPrompt.
export const selectFluxStillDirection = ({
  scenePlanEntry = {},
  sceneContext = {},
  primarySourceCue = '',
  openingPromptSource = '',
  fallbackPrompt = '',
} = {}) => {
  const stillPrompt = cleanPromptText(scenePlanEntry?.stillPrompt);
  if (stillPrompt) {
    return translateSemanticTermsForProductionPrompt(stillPrompt, scenePlanEntry);
  }

  const imageDescription = cleanPromptText(scenePlanEntry?.imageDescription);
  if (imageDescription) {
    return translateSemanticTermsForProductionPrompt(imageDescription, scenePlanEntry);
  }

  const legacySingleImagePrompt = cleanPromptText(scenePlanEntry?.singleImagePrompt);
  if (legacySingleImagePrompt) {
    return translateSemanticTermsForProductionPrompt(legacySingleImagePrompt, scenePlanEntry);
  }

  const legacyVideoPrompt = cleanPromptText(scenePlanEntry?.videoPrompt);
  if (legacyVideoPrompt) {
    return translateSemanticTermsForProductionPrompt(legacyVideoPrompt, scenePlanEntry);
  }

  const semanticCue = cleanPromptText(primarySourceCue);
  if (semanticCue) {
    return translateSemanticTermsForProductionPrompt(semanticCue, scenePlanEntry);
  }

  const authoredOpening = cleanPromptText(openingPromptSource);
  if (authoredOpening) {
    return translateSemanticTermsForProductionPrompt(authoredOpening, scenePlanEntry);
  }

  const sceneContextBeat = cleanPromptText(sceneContext?.storyBeat);
  if (sceneContextBeat) {
    return translateSemanticTermsForProductionPrompt(sceneContextBeat, scenePlanEntry);
  }

  const sceneTitle = cleanPromptText(scenePlanEntry?.title);
  if (sceneTitle) {
    return translateSemanticTermsForProductionPrompt(sceneTitle, scenePlanEntry);
  }

  return translateSemanticTermsForProductionPrompt(fallbackPrompt, scenePlanEntry);
};

export const selectSceneStoryBeat = ({
  scenePlanEntry = {},
  sceneContext = {},
  primarySourceCue = '',
  openingPromptSource = '',
  selectedPrompt = '',
} = {}) => {
  const plannedStoryBeat = cleanPromptText(scenePlanEntry?.event || scenePlanEntry?.storyBeat);
  if (plannedStoryBeat) {
    return plannedStoryBeat;
  }

  const plannedBeat = cleanPromptText(scenePlanEntry?.beat);
  if (plannedBeat) {
    return plannedBeat;
  }

  const sceneContextBeat = cleanPromptText(sceneContext?.storyBeat);
  if (sceneContextBeat) {
    return sceneContextBeat;
  }

  const semanticCue = cleanPromptText(primarySourceCue);
  if (semanticCue) {
    return semanticCue;
  }

  const authoredOpening = cleanPromptText(openingPromptSource);
  if (authoredOpening) {
    return authoredOpening;
  }

  return cleanPromptText(selectedPrompt);
};

// A converted first/last-frame scene keeps its transition prompt. A native
// single-image scene uses its WAN prompt directly.
export const selectWanMotionDirection = ({
  scenePlanEntry = {},
  wasTransitionBeat = false,
  fallbackPrompt = '',
} = {}) => {
  const videoPrompt = cleanPromptText(scenePlanEntry?.videoPrompt);
  const singleImagePrompt = cleanPromptText(scenePlanEntry?.singleImagePrompt);

  const selectedVideoPrompt = wasTransitionBeat || scenePlanEntry?.event || !singleImagePrompt
    ? videoPrompt
    : singleImagePrompt;

  if (selectedVideoPrompt) {
    return translateSemanticTermsForProductionPrompt(buildWanPrompt({
      scene: { ...scenePlanEntry, videoPrompt: selectedVideoPrompt },
    }), scenePlanEntry);
  }

  return translateSemanticTermsForProductionPrompt(buildWanPrompt({
    scene: { ...scenePlanEntry, videoPrompt: fallbackPrompt },
  }), scenePlanEntry);
};

export default {
  selectFluxStillDirection,
  selectSceneStoryBeat,
  selectWanMotionDirection,
  buildFluxPrompt,
  buildEnvironmentFluxPrompt,
  buildMonsterFluxPrompt,
  buildWanPrompt,
};
