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
  shouldIncludeMonsterReference,
  validateSceneFocus,
} from '../shorty-book/scene-focus.js';

export const COMPACT_SCENE_PLAN_SYSTEM_PROMPT = [
  'Create a coherent sequence of short cinematic scenes inside the supplied Kaufhaus.',
  'Each scene receives an inherited Semantic Anchor and a fresh Semantic Collision.',
  'Interpret their friction as one specific, surprising, filmable rule of the scene world.',
  'Choose sceneFocus: location, objects, people, trace, monster, or mixed.',
  'Choose the strongest carrier: architecture, circulation, objects, light, reflections, people, an unexplained trace, the monster, or a combination.',
  'The monster recurs across the sequence but is not visible in every scene.',
  'For location, objects, people, and trace scenes, do not mention or show the monster in stillPrompt or videoPrompt.',
  'The monster may enter only in a fresh FLUX still generated with its canonical reference image. Never write a videoPrompt where it appears, emerges, enters, materializes, grows from an object, forms from a shadow, replaces a person, or is revealed during WAN motion.',
  'When a monster or mixed scene follows a monster-free scene, write stillPrompt with the monster already visible at the beginning and choose locationReanchor. WAN only animates what is already visible in its start frame.',
  'Each scene leaves one visible consequence that the next scene can inherit.',
  'Keep the supplied Kaufhaus recognizable while allowing local function, arrangement, illumination, reflection, circulation, geometry, or behaviour to change.',
  'Write concrete physical events, not explanations of symbolism.',
  'Choose camera after event so it reveals or conceals that event.',
  'Choose startFrameStrategy from locationReanchor, driftCorrectedLastFrame, or rawLastFrame.',
  'Return JSON only using requested compact schema.',
].join(' ');

const sceneProperties = {
  title: { type: 'string' },
  semanticAnchor: { type: 'string' },
  semanticCollision: { type: 'string' },
  sceneFocus: {
    type: 'string',
    enum: ['location', 'objects', 'people', 'trace', 'monster', 'mixed'],
  },
  event: { type: 'string' },
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
};

const requiredSceneFields = [
  'title',
  'semanticAnchor',
  'semanticCollision',
  'sceneFocus',
  'event',
  'monsterPresence',
  'consequence',
  'nextHook',
  'stillPrompt',
  'videoPrompt',
  'cameraCue',
  'startFrameStrategy',
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
  semanticCollision: compactText(scene.semanticCollision),
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
  durationSeconds: normalizeSceneLengthValue(scene.durationSeconds, durationSeconds),
  tension: Number.isFinite(Number(scene.tension))
    ? Number(scene.tension)
    : (Number.isFinite(Number(scene.tensionLevel)) ? Number(scene.tensionLevel) : undefined),
});

export const parseCompactScenePlan = (value, sceneCount, sceneLengths = []) => {
  const parsed = JSON.parse(stripCodeFences(value));
  if (!Array.isArray(parsed?.scenes)) {
    throw new Error('Scene plan response must be an object with a scenes array');
  }

  return parsed.scenes.map((scene, index) => normalizeLegacyScene(
    scene,
    index,
    normalizeSceneLengthValue(sceneLengths[index], 3)
  ));
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
    for (const field of ['semanticAnchor', 'semanticCollision', 'sceneFocus', 'event', 'consequence', 'stillPrompt', 'videoPrompt']) {
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

  const visibleMonsterSceneCount = scenePlan.filter(shouldIncludeMonsterReference).length;
  if (scenePlan.length >= 4 && visibleMonsterSceneCount === scenePlan.length) {
    errors.push('Every scene includes the monster. Revise at least one scene to use location, objects, people or trace as the sceneFocus.');
  }
  if (scenePlan.length >= 6 && visibleMonsterSceneCount > scenePlan.length - 2) {
    errors.push('Use at least two monster-free scenes in a sequence of six or more scenes.');
  }

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
  previousMovieEndFrame ? `PREVIOUS STATE\n${compactText(previousMovieEndFrame)}` : '',
  'TASK\nCreate complete sequence. Preserve each supplied semanticAnchor and semanticCollision exactly.',
].filter(Boolean).join('\n\n');
