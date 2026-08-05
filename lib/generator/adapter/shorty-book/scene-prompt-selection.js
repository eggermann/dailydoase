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
  'Keep the supplied Kaufhaus recognizable through its camera viewpoint,',
  'major geometry, floor, ceiling, columns, windows, walls and elevators.',
  'The semantic event may alter the local function, arrangement, illumination,',
  'reflection, circulation or spatial behavior of the interior.',
  'Preserve the identity of the Kaufhaus without freezing it as an untouched background plate.',
].join(' ');

const escapeRegularExpression = (value) => String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Planner records keep source-language cue identity for validation. Provider
// prompts must instead use the paired English rendering, even if the model
// repeats the original token inside otherwise English prose.
export const translateSemanticTermsForProductionPrompt = (value, scenePlanEntry = {}) => {
  let translated = cleanPromptText(value);
  const replacements = [
    [scenePlanEntry?.semanticAnchor, scenePlanEntry?.semanticAnchorEnglish],
    [scenePlanEntry?.semanticCollision, scenePlanEntry?.semanticCollisionEnglish],
  ]
    .map(([source, english]) => [cleanPromptText(source), cleanPromptText(english)])
    .filter(([source, english]) => source && english && source.toLocaleLowerCase() !== english.toLocaleLowerCase())
    .sort(([left], [right]) => right.length - left.length);

  for (const [source, english] of replacements) {
    const termPattern = new RegExp(
      `(^|[^\\p{L}\\p{N}])${escapeRegularExpression(source)}(?=$|[^\\p{L}\\p{N}])`,
      'giu'
    );
    translated = translated.replace(termPattern, (_, prefix) => `${prefix}${english}`);
  }

  return translated;
};

export const buildEnvironmentFluxPrompt = ({
  scene = {},
  locationRule = LOCATION_RULE,
} = {}) => [
  cleanPromptText(locationRule),
  cleanPromptText(scene.stillPrompt),
  scene.consequence ? `Visible result: ${cleanPromptText(scene.consequence)}` : '',
  'Do not show the monster, another creature, a humanoid plant, a monster-shaped shadow, a monster reflection, or a substitute creature.',
  'Create one realistic cinematic photograph. No readable text or logos.',
].filter(Boolean).join(' ');

export const buildMonsterFluxPrompt = ({
  scene = {},
  locationRule = LOCATION_RULE,
  creatureRule = '',
} = {}) => [
  cleanPromptText(locationRule),
  cleanPromptText(creatureRule),
  cleanPromptText(scene.stillPrompt),
  scene.monsterPresence ? `Monster presence: ${cleanPromptText(scene.monsterPresence)}` : '',
  scene.consequence ? `Visible result: ${cleanPromptText(scene.consequence)}` : '',
  'The separate protagonist image is mandatory and is the canonical identity. Generate the exact same individual Green Monster shown in that image, not a similar green creature or a new species.',
  'Preserve its exact elongated bark face, facial proportions, amber eye placement, two leaf-shaped ears, trunk-like mouth tendril, rooted botanical structure, material pattern and distinctive attached anatomy.',
  'Change only pose, expression, framing, scale, action and interaction.',
  'Render the monster as a weathered practical sculpture physically filmed in the Kaufhaus, never as an illustration, comic, cartoon, cel-shaded figure, glossy fantasy CGI, or concept art.',
  'Create one realistic cinematic photograph. No readable text or logos.',
].filter(Boolean).join(' ');

export const buildFluxPrompt = ({
  scene = {},
  locationRule = LOCATION_RULE,
  creatureRule = '',
} = {}) => (
  shouldIncludeMonsterReference(scene)
    ? buildMonsterFluxPrompt({ scene, locationRule, creatureRule })
    : buildEnvironmentFluxPrompt({ scene, locationRule })
);

export const buildMonsterFreeWanPrompt = ({ scene = {}, allowPeople = true } = {}) => [
  cleanPromptText(scene.videoPrompt),
  scene.cameraCue ? `Camera: ${cleanPromptText(scene.cameraCue)}.` : '',
  scene.consequence ? `End with this readable result: ${cleanPromptText(scene.consequence)}` : '',
  'No monster is present in the input frame or in this clip.',
  'Do not introduce, reveal, imply visually, construct, morph, transform, or generate any monster, creature, green humanoid, plant person, monster-shaped shadow, monster reflection or substitute protagonist.',
  'Do not turn a person, object, reflection, shadow or architectural form into a green figure.',
  'Animate only subjects and objects already present in the start frame.',
  allowPeople === false
    ? 'No humans, humanoids, people-shaped forms, mannequins, statues, portraits, silhouettes or person-shaped reflections.'
    : '',
].filter(Boolean).join(' ');

export const buildMonsterVisibleWanPrompt = ({ scene = {} } = {}) => [
  cleanPromptText(scene.videoPrompt),
  scene.cameraCue ? `Camera: ${cleanPromptText(scene.cameraCue)}.` : '',
  scene.consequence ? `End with this readable result: ${cleanPromptText(scene.consequence)}` : '',
  'The exact canonical Green Monster is already visible in the input frame.',
  'Animate only that existing individual creature.',
  'Do not create, reveal, add, duplicate, redesign or replace the protagonist.',
  'Do not generate another green creature, human-like green figure, plant person, duplicate body or substitute monster.',
  'Preserve the face, eye placement, leaf ears, mouth tendril, proportions, botanical anatomy and material structure already visible in the start frame.',
  'Keep the monster as a weathered practical sculpture physically filmed in the Kaufhaus: no illustration, comic, cartoon, cel shading, glossy fantasy CGI, or concept art.',
].filter(Boolean).join(' ');

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
  const focus = normalizeSceneFocus(scene.sceneFocus);
  return MONSTER_FREE_FOCUSES.has(focus)
    ? buildMonsterFreeWanPrompt({ scene, allowPeople })
    : buildMonsterVisibleWanPrompt({ scene });
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
