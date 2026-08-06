import {
  normalizeSceneLengthValue,
  normalizeString,
  stripCodeFences,
} from './scene-generator-helpers.js';
import {
  deriveLegacyStartFrameStrategy,
  normalizeStartFrameStrategy,
} from '../shorty-book/scene-start-strategy.js';
import {
  normalizeSceneFocus,
  validateSceneFocus,
} from '../shorty-book/scene-focus.js';

export const COMPACT_SCENE_PLAN_SYSTEM_PROMPT = [
  'Create a coherent sequence of short English-language monster-trailer scenes inside the supplied real Kaufhaus.',
  'Each scene receives an inherited Semantic Anchor and a fresh Semantic Collision.',
  'Let their friction create one specific, surprising, filmable physical event; do not decorate a generic trailer scene with the words.',
  'Keep the creature protagonist through choices and consequences, not constant visibility. Vary its presence naturally.',
  'Choose sceneFocus from location, objects, people, trace, monster, mixed to name the dominant visual carrier, not to forbid other visible subjects.',
  'A people scene may include the monster. Any scene that describes the visible monster receives its canonical identity reference automatically.',
  'Keep the Kaufhaus recognizable. Let architecture, objects, light, reflections, circulation, people, traces or the monster carry the event.',
  'Every scene uses a transformationMechanism materially different from the preceding scene. Each scene leaves one concrete consequence; the next inherits, redirects, contradicts, transfers, reveals or resolves it.',
  'For cameraCue, describe only viewpoint movement: nearly fixed, slight reframe, small pan, short forward shift or short backward shift. Do not describe a device, operator, person recording, hands, phone, camera body, screen, viewfinder, filming or recording. Do not describe orbiting, flying, floating, crane, drone, gimbal or movement through solid objects.',
  'Write every generated scene field in concise English. Preserve original Semantic Anchor and Semantic Collision separately, but write their English forms for provider use.',
  'Do not answer in German. Do not include explanations, analysis, warnings, refusals, safety commentary or markdown.',
  'Use fictional, non-instructional imagery.',
  'Return JSON only with title, semanticAnchor, semanticAnchorEnglish, semanticCollision, semanticCollisionEnglish, sceneFocus, event, transformationMechanism, monsterPresence, consequence, nextHook, stillPrompt, videoPrompt, cameraCue, startFrameStrategy and startFrameReason.',
].join(' ');

export const SCENE_FIELD_LIMITS = Object.freeze({
  title: 60,
  event: 320,
  transformationMechanism: 100,
  monsterPresence: 100,
  consequence: 240,
  nextHook: 180,
  stillPrompt: 600,
  videoPrompt: 420,
  cameraCue: 120,
  startFrameReason: 180,
});

export const PROVIDER_FACING_SCENE_FIELDS = Object.freeze([
  'title',
  'event',
  'monsterPresence',
  'consequence',
  'nextHook',
  'stillPrompt',
  'videoPrompt',
  'cameraCue',
  'startFrameReason',
]);

export const containsLikelyGermanPlannerText = (value) => {
  const text = String(value || '').toLowerCase();
  const germanSignals = [
    /\bdie ablehnung\b/,
    /\bdie szene\b/,
    /\bpasst zum\b/,
    /\bsicherheitsinhalt\b/,
    /\bgeplanten\b/,
    /\bkinderschuh\b/,
    /\brauchkanister\b/,
    /\bnächste\b/,
    /\berneut\b/,
    /\bverweigert\b/,
  ];
  return germanSignals.some((pattern) => pattern.test(text));
};

export const containsPlannerRefusalOrMetaText = (value) => {
  const text = String(value || '');
  const patterns = [
    /\bI can(?:not|'t)\b/i,
    /\bI am unable\b/i,
    /\bI must refuse\b/i,
    /\bI cannot assist\b/i,
    /\bthe request was rejected\b/i,
    /\bthe scene was rejected\b/i,
    /\bthe refusal\b/i,
    /\bsafety policy\b/i,
    /\bsafety content\b/i,
    /\bpolicy violation\b/i,
    /\bDie Ablehnung\b/i,
    /\bSicherheitsinhalt\b/i,
  ];
  return patterns.some((pattern) => pattern.test(text));
};

export const compactSceneField = (value, maxCharacters) => {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (text.length <= maxCharacters) return text;
  const truncated = text.slice(0, maxCharacters + 1);
  const finalSpace = truncated.lastIndexOf(' ');
  return truncated.slice(0, finalSpace > 0 ? finalSpace : maxCharacters).trim();
};

export const projectSceneForProviders = (scene = {}) => ({
  ...scene,
  providerStillPrompt: compactSceneField(scene.stillPrompt || scene.event, 420),
  providerVideoPrompt: compactSceneField(scene.videoPrompt || scene.event, 300),
  providerConsequence: compactSceneField(scene.consequence, 160),
  providerCameraCue: compactSceneField(scene.cameraCue, 120),
});

const normalizeMechanism = (value) => String(value || '').toLowerCase()
  .replace(/[^a-z0-9\s-]/g, ' ').replace(/\s+/g, ' ').trim();

export const validateTransformationDiversity = (scenes = []) => scenes.reduce((errors, scene, index) => {
  if (index > 0 && normalizeMechanism(scene?.transformationMechanism)
    && normalizeMechanism(scene?.transformationMechanism) === normalizeMechanism(scenes[index - 1]?.transformationMechanism)) {
    errors.push(`Scene ${index + 1} repeats the previous transformation mechanism.`);
  }
  return errors;
}, []);

export const buildSafeSceneRepairInstruction = () => [
  'Replace unsafe or refusal-triggering details with a fictional,',
  'non-instructional physical event of similar dramatic intensity.',
  'Use architecture, objects, light, reflections, circulation, weathered materials',
  'or an unexplained trace instead of explicit violence or operational harm.',
  'Do not mention what was removed.',
].join(' ');

export const CLEAN_SCENE_PLAN_REPAIR_INSTRUCTION = [
  'The previous response was not a valid scene plan.',
  'Return a new complete JSON scene plan in concise English.',
  'Use fictional, non-instructional, visually readable events.',
  'Avoid explicit real-world violence, extremist framing, weapon construction, harm to children, graphic injury and operational wrongdoing.',
  'Do not mention the rejected response.',
  'Do not explain the repair.',
  'Do not preserve rejected objects or wording.',
  buildSafeSceneRepairInstruction(),
  'Return JSON only.',
].join(' ');

const sceneProperties = {
  title: { type: 'string' },
  semanticAnchor: { type: 'string' },
  semanticAnchorEnglish: { type: 'string' },
  semanticCollision: { type: 'string' },
  semanticCollisionEnglish: { type: 'string' },
  sceneFocus: {
    type: 'string',
    enum: ['location', 'objects', 'people', 'trace', 'monster', 'mixed'],
  },
  event: { type: 'string' },
  transformationMechanism: { type: 'string' },
  monsterPresence: { type: 'string' },
  consequence: { type: 'string' },
  nextHook: { type: 'string' },
  stillPrompt: { type: 'string' },
  videoPrompt: { type: 'string' },
  cameraCue: { type: 'string' },
  startFrameStrategy: {
    type: 'string',
    enum: ['locationReanchor', 'driftCorrectedLastFrame', 'rawLastFrame'],
  },
  startFrameReason: { type: 'string' },
};

const requiredSceneFields = [
  'title',
  'semanticAnchor',
  'semanticAnchorEnglish',
  'semanticCollision',
  'semanticCollisionEnglish',
  'sceneFocus',
  'event',
  'transformationMechanism',
  'monsterPresence',
  'consequence',
  'nextHook',
  'stillPrompt',
  'videoPrompt',
  'cameraCue',
  'startFrameStrategy',
  'startFrameReason',
];

export const COMPACT_SCENE_PLAN_SCHEMA = {
  name: 'compact_scene_plan',
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['scenes'],
    properties: {
      scenes: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: requiredSceneFields,
          properties: sceneProperties,
        },
      },
    },
  },
  strict: true,
};

// The beat count comes from the active Taktmuster. Tell the structured-output
// provider that exact count too, so it cannot silently omit the final Semantic
// Stream transition while still returning otherwise valid JSON.
export const createCompactScenePlanSchema = (sceneCount) => {
  const exactSceneCount = Math.max(1, Math.round(Number(sceneCount) || 1));
  const scenes = COMPACT_SCENE_PLAN_SCHEMA.schema.properties.scenes;

  return {
    ...COMPACT_SCENE_PLAN_SCHEMA,
    schema: {
      ...COMPACT_SCENE_PLAN_SCHEMA.schema,
      properties: {
        ...COMPACT_SCENE_PLAN_SCHEMA.schema.properties,
        scenes: {
          ...scenes,
          minItems: exactSceneCount,
          maxItems: exactSceneCount,
        },
      },
    },
  };
};

const compactText = (value) => normalizeString(value, '');
const shortDescription = (value, maxCharacters = 800) => compactText(value)
  .slice(0, maxCharacters)
  .trim();

// Saved runs may contain the former verbose plan. Convert them once when read;
// newly planned scenes only use the compact fields above.
export const normalizeLegacyScene = (scene = {}, index = 0, durationSeconds = 3) => ({
  index: index + 1,
  title: compactText(scene.title, `Scene ${index + 1}`),
  semanticAnchor: compactText(scene.semanticAnchor),
  semanticAnchorEnglish: compactText(scene.semanticAnchorEnglish || scene.semanticAnchor),
  semanticCollision: compactText(scene.semanticCollision),
  semanticCollisionEnglish: compactText(scene.semanticCollisionEnglish || scene.semanticCollision),
  sceneFocus: normalizeSceneFocus(
    scene.sceneFocus,
    /\b(absent|not visible|unseen|off-screen|offscreen)\b/i.test(String(scene.monsterPresence || ''))
      ? 'trace'
      : 'monster'
  ),
  event: compactText(
    scene.event
    || scene.semanticAction
    || scene.storyCause
    || scene.monsterTactic
  ),
  transformationMechanism: compactText(scene.transformationMechanism || scene.semanticCollisionPhysicalization || scene.title),
  monsterPresence: compactText(scene.monsterPresence),
  consequence: compactText(
    scene.consequence
    || scene.localConsequence
    || scene.roomConsequence
    || scene.endFrameContinuity
  ),
  nextHook: compactText(scene.nextHook || scene.nextSceneHook),
  stillPrompt: compactText(scene.stillPrompt || scene.imageDescription || scene.singleImagePrompt),
  videoPrompt: compactText(scene.videoPrompt || scene.singleImagePrompt),
  cameraCue: compactText(scene.cameraCue),
  videoMode: scene.videoMode === 'firstLast' ? 'firstLast' : 'singleImage',
  frameSource: scene.frameSource === 'newImage' ? 'newImage' : 'lastFrame',
  freshImage: scene.freshImage === true,
  startFrameStrategy: normalizeStartFrameStrategy(
    scene.startFrameStrategy,
    deriveLegacyStartFrameStrategy(scene, index)
  ),
  startFrameReason: compactText(scene.startFrameReason),
  durationSeconds: normalizeSceneLengthValue(scene.durationSeconds, durationSeconds),
  tension: Number.isFinite(Number(scene.tension))
    ? Number(scene.tension)
    : (Number.isFinite(Number(scene.tensionLevel)) ? Number(scene.tensionLevel) : undefined),
});

export const validateEnglishScenePlanContent = (scenePlan) => {
  const scenes = Array.isArray(scenePlan) ? scenePlan : [];
  const errors = [];
  scenes.forEach((scene, index) => {
    for (const field of PROVIDER_FACING_SCENE_FIELDS) {
      const value = scene?.[field];
      if (containsPlannerRefusalOrMetaText(value)) {
        errors.push(`Scene ${index + 1}: ${field} contains refusal or meta-commentary.`);
      } else if (containsLikelyGermanPlannerText(value)) {
        errors.push(`Scene ${index + 1}: ${field} contains likely German planner prose.`);
      }
    }
  });
  return { valid: errors.length === 0, errors };
};

export const compactScenePlanFields = (scenePlan = []) => scenePlan.map((scene) => {
  const compacted = { ...scene };
  for (const [field, maxCharacters] of Object.entries(SCENE_FIELD_LIMITS)) {
    compacted[field] = compactSceneField(compacted[field], maxCharacters);
  }
  return compacted;
});

export const parseCompactScenePlan = (value, sceneCount, sceneLengths = []) => {
  if (containsPlannerRefusalOrMetaText(value) || containsLikelyGermanPlannerText(value)) {
    const error = new Error('Planner response contains refusal, meta-commentary, or likely German prose.');
    error.name = 'InvalidScenePlanContentError';
    throw error;
  }
  const parsed = JSON.parse(stripCodeFences(value));
  if (!Array.isArray(parsed?.scenes)) {
    throw new Error('Scene plan response must be an object with a scenes array');
  }

  const normalized = parsed.scenes.map((scene, index) => normalizeLegacyScene(
    scene,
    index,
    normalizeSceneLengthValue(sceneLengths[index], 3)
  ));
  const validation = validateEnglishScenePlanContent(normalized);
  if (!validation.valid) {
    const error = new Error('Planner scene fields contain invalid language or meta-commentary.');
    error.name = 'InvalidScenePlanContentError';
    error.validationErrors = validation.errors;
    throw error;
  }
  return compactScenePlanFields(normalized);
};

const normalizeIdentity = (value) => compactText(value).toLocaleLowerCase();

export const validateScenePlan = ({
  scenePlan,
  sourceCueRecords = [],
  expectedSceneCount = sourceCueRecords.length,
} = {}) => {
  const errors = [];
  if (!Array.isArray(scenePlan)) {
    return { valid: false, errors: ['Scene plan must be an array.'], reports: [] };
  }
  if (scenePlan.length !== expectedSceneCount) {
    errors.push('Scene count does not match requested count.');
  }

  scenePlan.forEach((scene, index) => {
    const cue = sourceCueRecords[index];
    for (const field of [
      'title',
      'semanticAnchor',
      'semanticAnchorEnglish',
      'semanticCollision',
      'semanticCollisionEnglish',
      'sceneFocus',
      'event',
      'monsterPresence',
      'consequence',
      'nextHook',
      'stillPrompt',
      'videoPrompt',
      'cameraCue',
      'startFrameReason',
    ]) {
      if (!compactText(scene?.[field])) {
        errors.push(`Scene ${index + 1}: missing ${field}.`);
      }
    }
    if (cue && normalizeIdentity(scene?.semanticAnchor) !== normalizeIdentity(cue?.anchor?.term)) {
      errors.push(`Scene ${index + 1}: semanticAnchor changed.`);
    }
    if (cue && normalizeIdentity(scene?.semanticCollision) !== normalizeIdentity(cue?.collision?.term)) {
      errors.push(`Scene ${index + 1}: semanticCollision changed.`);
    }
    errors.push(...validateSceneFocus(scene, index));
  });

  errors.push(...validateEnglishScenePlanContent(scenePlan).errors);
  errors.push(...validateTransformationDiversity(scenePlan));

  return { valid: errors.length === 0, errors, reports: [] };
};

export const buildCompactPlannerUserMessage = ({
  count,
  sceneLengths,
  creatureDescription = '',
  locationDescription = '',
  sourceCueRecords = [],
  previousMovieEndFrame = '',
} = {}) => [
  `CREATURE\n${shortDescription(creatureDescription) || 'Use supplied creature reference identity when visible.'}`,
  `LOCATION\n${shortDescription(locationDescription) || 'Preserve supplied location continuity.'}`,
  `SEQUENCE\n${count} scenes; durations in seconds: ${(sceneLengths || []).join(', ')}`,
  `SEMANTIC CUES\n${JSON.stringify(sourceCueRecords)}`,
  previousMovieEndFrame ? `PREVIOUS STATE\n${shortDescription(previousMovieEndFrame, 240)}` : '',
  'TASK\nCreate complete sequence. Preserve each supplied semanticAnchor and semanticCollision exactly.',
].filter(Boolean).join('\n\n');
