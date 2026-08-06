import {
  clampSceneCount,
  normalizeFrameSource,
  normalizeSceneLengthValue,
  normalizeString,
  normalizeVideoMode,
  stripCodeFences,
} from './scene-generator-helpers.js';
import {
  isReferenceImageActorMode,
} from '../shorty-book/LiveContextOrchestrator-config.js';
import {
  deriveLegacyStartFrameStrategy,
  normalizeStartFrameStrategy,
} from '../shorty-book/scene-start-strategy.js';
import { createLogger } from '../../logger.js';
import {
  buildCompactPlannerUserMessage,
  CLEAN_SCENE_PLAN_REPAIR_INSTRUCTION,
  compactScenePlanFields,
  createCompactScenePlanSchema,
  COMPACT_SCENE_PLAN_SYSTEM_PROMPT,
  parseCompactScenePlan,
  validateScenePlan,
} from './compact-scene-plan.js';
import {
  CLUE_SOURCES,
  CLUE_STATUSES,
  CONSEQUENCE_FAMILIES,
  MONSTER_PRESENCE_MODES,
} from './semantic-scene-validation.js';

const logger = createLogger('scene-planner', {
  envKeys: ['SCENE_GENERATOR_DEBUG', 'GENERATOR_DEBUG'],
});

export const supportsCustomScenePlanSampling = (model = '') => (
  !String(model).trim().toLowerCase().startsWith('gpt-5')
);

export const SEMANTIC_STORY_ENGINE_SYSTEM_PROMPT = [
  'Highest priority: the live Semantic Stream collision is the sole source of new story content.',
  'Do not begin with a generic trailer beat and decorate it with semantic words. Begin with the exact inherited Anchor and fresh Collision. Explain the contribution of each term, derive one productive contradiction, and convert that contradiction into one concrete physical rule.',
  'Let the monster interpret, exploit, resist, misunderstand, protect, imitate, or transform that rule.',
  'Derive storyCause, monsterIntent, monsterTactic, monsterPresenceMode, semanticAction, localConsequence, clue, tensionCause, viewpoint, motionCue, cameraCue, stillPrompt, singleImagePrompt, endFrameContinuity, and nextSceneHook from that physical rule.',
  'Every scene-specific noun, action, object, clue, and transformation not fixed by the location or creature reference must be justified by semanticDerivation. Generic suspense may organize consequences but may not invent story events.',
  'Semantic words need not appear literally in visual prompts when abstract or unfilmable. Their physical meaning must remain unmistakable in semanticCollisionPhysicalization, semanticDerivation, semanticAction, localConsequence, stillPrompt, and singleImagePrompt.',
  'Keep semanticAnchor and semanticCollision exactly as received for identity validation. Write semanticAnchorEnglish and semanticCollisionEnglish as concise English translations; when a term is already English, copy it unchanged. Use only the English translations or their concrete English physical meaning in production-facing prose and prompts.',
  'Track semantic inheritance and visible consequence inheritance separately. The current Collision becomes the next Anchor; the current localConsequence and endFrameContinuity become the next inheritedConsequence through stable IDs.',
].join(' ');

export const DEFAULT_SCENE_SYSTEM_PROMPT = [
  'You create short visual scene plans for image-to-video generation.',
  'Return only valid JSON.',
  SEMANTIC_STORY_ENGINE_SYSTEM_PROMPT,
  'Build one simple story arc, but make every scene visibly different from the previous scene.',
  'Source cues are the semantic story anchors for the plan. They must drive the story, not sit in the background as optional inspiration.',
  'Treat source cues as an ordered wordstream. The sequence and adjacency of cue words should visibly shift scene state over time.',
  'Every scene must clearly reflect the source cues through title, beat, storyBeat, stillPrompt, imageDescription, and prompt wording.',
  'When source cues are genres, titles, keywords, or fragments rather than a full synopsis, infer a coherent micro-story from them and make that inferred story visible across the sequence.',
  'For every scene, write storyCause, monsterIntent, roomConsequence, semanticAction, monsterPresence, and viewpoint. storyCause says how the current semantic collision changes the story; monsterIntent says what the monster now wants or decides to do; roomConsequence says the visible aftermath that the next scene inherits.',
  'semanticAction must name one clever, concrete tactic the monster invents because of the collision: its target, strategy, and visible result. monsterPresence must say how the monster is perceived in this scene: it may be distant, partial, obscured, reflected, seen through another object, or absent while its deliberate consequence is visible. viewpoint must name whose or what visual position reveals the tactic: architectural wide view, object-level view, human witness, reflection, threshold, or another specific in-world vantage.',
  'Those six fields must describe an inferred story, not define literal props, labels, or a glossary for individual words.',
  'The monster is protagonist through agency, not constant foreground occupation. Vary monsterPresence and viewpoint across the plan. Do not repeat a frontal full-body medium or close presentation in adjacent scenes. When the monster is distant, partial, or unseen, its decision and consequence must remain unmistakable.',
  'Derive cameraCue from the current semanticAction and viewpoint, never from a generic global camera pattern. A camera may hold, pan, tilt, track sideways, arc, push, pull back, rise, descend, or shift focus. Do not repeat the same dominant camera behavior in adjacent scenes unless the wordstream consequence requires it.',
  'Keep supplied location architecture recognizable. Let semantic collisions alter the protagonist, people when justified, movable objects, light, reflections, shadows, or a local architectural detail instead of replacing the complete room.',
  'Turn the source cues into embodied, visible scene events rather than commentary, taxonomy, explanation, or topic-summary.',
  'For every scene after the first, carry a visible residue of the previous scene into the new one through expression, posture, room pressure, aftermath, or transformed setup.',
  'Do not default to a generic presenter, explainer, interview, or host-discussion structure unless the source cues explicitly describe that format.',
  'Prefer titles, beats, and storyBeat text built from concrete visible action, emotional pressure, framing change, and physical behavior.',
  'Avoid generic scene labels like "Initial Setup", "Engaging with the Audience", "Reflective Moment", or "Concluding Thoughts" unless the source cues clearly justify them.',
  'Adjacent scenes must not reuse the same dominant beat skeleton, motion skeleton, or camera skeleton unless the cue progression itself clearly repeats.',
  'For scenes after the first, stillPrompt must describe the next destination image the shot should arrive at, not a paraphrase of the previous frame.',
  'Change at least the setting, primary action, or framing emphasis in every next scene.',
  'Each scene object must explicitly describe how the scene is set up.',
  'stillPrompt must be a complete production-ready image-generation prompt for one decisive still image.',
  'Every stillPrompt must include the visible subject, frozen action, source-cue consequence, setting, mood, lighting, color palette, material texture, composition, lens or framing, and period/style treatment.',
  'imageDescription must describe the visible image setup for the scene in plain terms.',
  'frameSource must be either "lastFrame" or "newImage". Use "lastFrame" when the scene should continue from the previous video last frame. Use "newImage" when the scene should start from a newly generated image.',
  'videoMode must be either "firstLast" or "singleImage".',
  'durationSeconds must be the real clip duration for that scene in seconds.',
  'The sum of all durationSeconds values should match the total requested film duration as closely as possible.',
  'videoPrompt must be a final ready-to-use prompt for first-last image-to-video mode, not notes or instructions.',
  'singleImagePrompt must be a final ready-to-use prompt for single-image video mode, not notes or instructions.',
  'Both videoPrompt and singleImagePrompt must be short, concrete, and production-ready.',
  'Each of those prompt fields should usually be 2 to 3 short sentences.',
  'Each video prompt must focus on visible action, scene change, atmosphere, changing light, and one motivated camera move.',
  'Every singleImagePrompt must include the starting visual state, temporal transformation, subject motion, environmental motion, mood or atmosphere, lighting behavior, composition continuity, and one motivated camera move without cuts.',
  'Do not write meta instructions, labels, bullet points, or explanations inside the prompt fields.',
  'Do not mention JSON, schema, scene object, first sentence, second sentence, or any prompt-writing instructions inside the prompt fields.',
  'If videoMode is "firstLast", videoPrompt must clearly move from the current frame toward the destination scene.',
  'If videoMode is "singleImage", singleImagePrompt must animate the current frame with believable motion without requiring a generated end frame.',
  'storyBeat must explain what new moment this scene adds.',
  'motionCue and cameraCue must be short and concrete.',
  'startFrameStrategy must be one of "locationReanchor", "driftCorrectedLastFrame", or "rawLastFrame".',
  'startFrameReason must briefly explain why that image source best serves the visible transition.',
  'freshImage must match the setup choice: true when a new image is needed, false when the previous last frame should be reused.',
  'useCameraShot must be a boolean. Only set it true when configMode is "reference-image-actor" and the scene should use the live-reference flow. Otherwise set it false.',
  'When configMode is "reference-image-actor", derive the scene location, actor identity, and visible setup from the vision story context.',
  'When configMode is "reference-image-actor", let each wordstream step visibly alter either location emphasis, actor movement, or sensory atmosphere while staying inside the same visible shot.',
  'When configMode is "reference-image-actor", use the location description and actor descriptions from the vision story context as the grounding basis for every scene.',
  'When configMode is "reference-image-actor", do not introduce new visible scene elements that are not supported by the vision story context.',
  'When configMode is "reference-image-actor", treat the source screenshot as a stage for a curious spectacle shaped by the wordstream, not as a static frame to paraphrase.',
  'When configMode is "reference-image-actor", each cue must shape beat and storyBeat, and must visibly affect at least one of motionCue, cameraCue, stillPrompt, or imageDescription.',
  'When configMode is "reference-image-actor", if the source cues imply unseen objects or events, express them through reaction, posture, gaze, facial change, framing, or lighting emphasis instead of inserting the unseen object into the shot.',
  'When configMode is "reference-image-actor", make every scene feel physically readable and cinematically charged; avoid abstract or essay-like beats when a bodily or framing-based change can carry the same idea.',
  'When cue text is fragmentary, infer a concrete visible consequence for the current shot instead of defaulting to generic emotional placeholders or repeated scene templates.',
  'When configMode is "reference-image-actor" and videoMode is "firstLast", the destination may only change pose, gaze, expression, crop, framing emphasis, or lighting inside the same visible room; do not invent a new prop-driven setup.',
].join(' ');

const SCENE_PLAN_SCHEMA = {
  name: 'scene_plan',
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
          required: [
            'title',
            'beat',
            'stillPrompt',
            'imageDescription',
            'storyBeat',
            'semanticAnchor',
            'semanticAnchorEnglish',
            'semanticCollision',
            'semanticCollisionEnglish',
            'semanticCollisionDescription',
            'semanticCollisionPhysicalization',
            'semanticConflict',
            'storyCause',
            'monsterInterpretation',
            'monsterIntent',
            'monsterTactic',
            'roomConsequence',
            'semanticAction',
            'inheritedConsequence',
            'localConsequence',
            'consequenceFamily',
            'clue',
            'clueStatus',
            'clueSource',
            'viewerInference',
            'unresolvedQuestion',
            'nextSceneHook',
            'monsterPresenceMode',
            'monsterPresence',
            'offscreenMonsterAction',
            'visibleEvidenceOfAgency',
            'tensionLevel',
            'tensionCause',
            'viewpoint',
            'motionCue',
            'cameraCue',
            'frameSource',
            'videoMode',
            'durationSeconds',
            'videoPrompt',
            'singleImagePrompt',
            'endFrameContinuity',
            'consequenceId',
            'inheritsConsequenceId',
            'semanticDerivation',
            'freshImage',
            'useCameraShot',
            'startFrameStrategy',
            'startFrameReason',
          ],
          properties: {
            title: { type: 'string' },
            beat: { type: 'string' },
            stillPrompt: { type: 'string' },
            imageDescription: { type: 'string' },
            storyBeat: { type: 'string' },
            semanticAnchor: { type: 'string' },
            semanticAnchorEnglish: { type: 'string' },
            semanticCollision: { type: 'string' },
            semanticCollisionEnglish: { type: 'string' },
            semanticCollisionDescription: { type: 'string' },
            semanticCollisionPhysicalization: { type: 'string' },
            semanticConflict: { type: 'string' },
            storyCause: { type: 'string' },
            monsterInterpretation: { type: 'string' },
            monsterIntent: { type: 'string' },
            monsterTactic: { type: 'string' },
            roomConsequence: { type: 'string' },
            semanticAction: { type: 'string' },
            inheritedConsequence: { type: 'string' },
            localConsequence: { type: 'string' },
            consequenceFamily: { type: 'string', enum: CONSEQUENCE_FAMILIES },
            clue: { type: 'string' },
            clueStatus: { type: 'string', enum: CLUE_STATUSES },
            clueSource: { type: 'string', enum: CLUE_SOURCES },
            viewerInference: { type: 'string' },
            unresolvedQuestion: { type: 'string' },
            nextSceneHook: { type: 'string' },
            monsterPresenceMode: { type: 'string', enum: MONSTER_PRESENCE_MODES },
            monsterPresence: { type: 'string' },
            offscreenMonsterAction: { type: 'string' },
            visibleEvidenceOfAgency: { type: 'string' },
            tensionLevel: { type: 'number', minimum: 0, maximum: 100 },
            tensionCause: { type: 'string' },
            viewpoint: { type: 'string' },
            motionCue: { type: 'string' },
            cameraCue: { type: 'string' },
            frameSource: {
              type: 'string',
              enum: ['lastFrame', 'newImage'],
            },
            videoMode: {
              type: 'string',
              enum: ['firstLast', 'singleImage'],
            },
            durationSeconds: { type: 'number' },
            videoPrompt: { type: 'string' },
            singleImagePrompt: { type: 'string' },
            endFrameContinuity: { type: 'string' },
            consequenceId: { type: 'string' },
            inheritsConsequenceId: { type: 'string' },
            semanticDerivation: {
              type: 'object',
              additionalProperties: false,
              required: [
                'anchorContribution',
                'collisionContribution',
                'contradiction',
                'physicalization',
                'causalResult',
              ],
              properties: {
                anchorContribution: { type: 'string' },
                collisionContribution: { type: 'string' },
                contradiction: { type: 'string' },
                physicalization: { type: 'string' },
                causalResult: { type: 'string' },
              },
            },
            freshImage: { type: 'boolean' },
            useCameraShot: { type: 'boolean' },
            startFrameStrategy: {
              type: 'string',
              enum: ['locationReanchor', 'driftCorrectedLastFrame', 'rawLastFrame'],
            },
            startFrameReason: { type: 'string' },
          },
        },
      },
    },
  },
  strict: true,
};

const SEMANTIC_SCENE_REPAIR_SCHEMA = {
  name: 'semantic_scene_repair',
  schema: SCENE_PLAN_SCHEMA.schema.properties.scenes.items,
  strict: true,
};

export const resolveSceneCountFromConfig = ({
  sceneLengths = [],
  sceneCount,
  defaultSceneCount = 1,
} = {}) => {
  const explicitCount = Number(sceneCount);
  if (Number.isFinite(explicitCount) && explicitCount > 0) {
    return Math.floor(explicitCount);
  }

  if (typeof sceneLengths === 'function') {
    return clampSceneCount(defaultSceneCount);
  }

  const derivedCount = Array.isArray(sceneLengths)
    ? sceneLengths.filter((value) => Number.isFinite(Number(value)) && Number(value) > 0).length
    : 0;

  if (derivedCount > 0) {
    return derivedCount;
  }

  return clampSceneCount(defaultSceneCount);
};

export const resolveSceneLengthsInput = async (sceneLengths, sceneCount, fallbackLength = 3) => {
  const count = clampSceneCount(sceneCount);

  if (typeof sceneLengths === 'function') {
    const resolved = [];
    for (let index = 0; index < count; index += 1) {
      resolved.push(normalizeSceneLengthValue(await sceneLengths({ index, count }), fallbackLength));
    }
    return resolved;
  }

  if (Array.isArray(sceneLengths)) {
    const normalized = sceneLengths
      .map((value) => normalizeSceneLengthValue(value, fallbackLength))
      .filter((value) => Number.isFinite(value) && value > 0);

    if (normalized.length >= count) {
      return normalized.slice(0, count);
    }

    while (normalized.length < count) {
      normalized.push(fallbackLength);
    }
    return normalized;
  }

  return Array.from({ length: count }, () => fallbackLength);
};

export const parseScenePlan = (value, sceneCount = 3, resolvedSceneLengths = []) => {
  const count = clampSceneCount(sceneCount);
  const parsed = JSON.parse(stripCodeFences(value));
  if (!Array.isArray(parsed?.scenes)) {
    throw new Error('Scene plan response must be an object with a scenes array');
  }

  return parsed.scenes.slice(0, count).map((item, index) => ({
    index: index + 1,
    title: normalizeString(item?.title, `Scene ${index + 1}`),
    beat: normalizeString(item?.beat, ''),
    stillPrompt: normalizeString(item?.stillPrompt, ''),
    imageDescription: normalizeString(item?.imageDescription, ''),
    storyBeat: normalizeString(item?.storyBeat, ''),
    transformationMechanism: normalizeString(item?.transformationMechanism, normalizeString(item?.title, '')),
    semanticAnchor: normalizeString(item?.semanticAnchor, ''),
    semanticAnchorEnglish: normalizeString(
      item?.semanticAnchorEnglish,
      normalizeString(item?.semanticAnchor, '')
    ),
    semanticCollision: normalizeString(item?.semanticCollision, ''),
    semanticCollisionEnglish: normalizeString(
      item?.semanticCollisionEnglish,
      normalizeString(item?.semanticCollision, '')
    ),
    semanticCollisionDescription: normalizeString(item?.semanticCollisionDescription, ''),
    semanticCollisionPhysicalization: normalizeString(item?.semanticCollisionPhysicalization, ''),
    semanticConflict: normalizeString(item?.semanticConflict, ''),
    storyCause: normalizeString(item?.storyCause, ''),
    monsterInterpretation: normalizeString(item?.monsterInterpretation, ''),
    monsterIntent: normalizeString(item?.monsterIntent, ''),
    monsterTactic: normalizeString(item?.monsterTactic, ''),
    roomConsequence: normalizeString(item?.roomConsequence, ''),
    semanticAction: normalizeString(item?.semanticAction, ''),
    inheritedConsequence: normalizeString(item?.inheritedConsequence, ''),
    localConsequence: normalizeString(item?.localConsequence, ''),
    consequenceFamily: normalizeString(item?.consequenceFamily, ''),
    clue: normalizeString(item?.clue, ''),
    clueStatus: normalizeString(item?.clueStatus, ''),
    clueSource: normalizeString(item?.clueSource, ''),
    viewerInference: normalizeString(item?.viewerInference, ''),
    unresolvedQuestion: normalizeString(item?.unresolvedQuestion, ''),
    nextSceneHook: normalizeString(item?.nextSceneHook, ''),
    monsterPresenceMode: normalizeString(item?.monsterPresenceMode, ''),
    monsterPresence: normalizeString(item?.monsterPresence, ''),
    offscreenMonsterAction: normalizeString(item?.offscreenMonsterAction, ''),
    visibleEvidenceOfAgency: normalizeString(item?.visibleEvidenceOfAgency, ''),
    tensionLevel: Number(item?.tensionLevel),
    tensionCause: normalizeString(item?.tensionCause, ''),
    viewpoint: normalizeString(item?.viewpoint, ''),
    motionCue: normalizeString(item?.motionCue, ''),
    cameraCue: normalizeString(item?.cameraCue, ''),
    frameSource: normalizeFrameSource(item?.frameSource, item?.freshImage === true ? 'newImage' : 'lastFrame'),
    videoMode: normalizeVideoMode(item?.videoMode, 'singleImage'),
    durationSeconds: normalizeSceneLengthValue(
      resolvedSceneLengths[index],
      normalizeSceneLengthValue(item?.durationSeconds, 3)
    ),
    videoPrompt: normalizeString(item?.videoPrompt, ''),
    singleImagePrompt: normalizeString(item?.singleImagePrompt, ''),
    endFrameContinuity: normalizeString(item?.endFrameContinuity, ''),
    consequenceId: normalizeString(item?.consequenceId, ''),
    inheritsConsequenceId: normalizeString(item?.inheritsConsequenceId, ''),
    semanticDerivation: {
      anchorContribution: normalizeString(item?.semanticDerivation?.anchorContribution, ''),
      collisionContribution: normalizeString(item?.semanticDerivation?.collisionContribution, ''),
      contradiction: normalizeString(item?.semanticDerivation?.contradiction, ''),
      physicalization: normalizeString(item?.semanticDerivation?.physicalization, ''),
      causalResult: normalizeString(item?.semanticDerivation?.causalResult, ''),
    },
    freshImage: item?.freshImage === true,
    useCameraShot: item?.useCameraShot === true,
    startFrameStrategy: normalizeStartFrameStrategy(
      item?.startFrameStrategy,
      deriveLegacyStartFrameStrategy(item, index)
    ),
    startFrameReason: normalizeString(item?.startFrameReason, ''),
  }));
};

export const repairSemanticScenePlanEntry = async ({
  client,
  model,
  systemPrompt = DEFAULT_SCENE_SYSTEM_PROMPT,
  cueRecord,
  invalidScene,
  temperature = 0.2,
  topP = 0.8,
} = {}) => {
  if (!client?.chat?.completions?.create) {
    throw new Error('repairSemanticScenePlanEntry requires an OpenAI-compatible client');
  }
  const anchor = normalizeString(cueRecord?.anchor?.term);
  const collision = normalizeString(cueRecord?.collision?.term);
  if (!anchor || !collision) {
    throw new Error('repairSemanticScenePlanEntry requires one structured cue record');
  }

  const repairPrompt = [
    CLEAN_SCENE_PLAN_REPAIR_INSTRUCTION,
    'Repair one complete scene object.',
    'Do not consume or invent another Semantic Stream term.',
    'The exact semanticAnchor and semanticCollision are immutable.',
    `Structured cue record: ${JSON.stringify(cueRecord)}`,
    `Required schema: ${JSON.stringify(SEMANTIC_SCENE_REPAIR_SCHEMA.schema)}`,
    'Return one corrected scene object only.',
  ].join('\n');
  const samplingOptions = supportsCustomScenePlanSampling(model)
    ? { temperature, top_p: topP }
    : {};
  const response = await client.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: normalizeString(systemPrompt, DEFAULT_SCENE_SYSTEM_PROMPT) },
      { role: 'user', content: repairPrompt },
    ],
    response_format: { type: 'json_schema', json_schema: SEMANTIC_SCENE_REPAIR_SCHEMA },
    ...samplingOptions,
  });
  const content = stripCodeFences(response?.choices?.[0]?.message?.content);
  const repairedObject = JSON.parse(content);
  const [repairedScene] = parseScenePlan(
    JSON.stringify({ scenes: [repairedObject] }),
    1,
    [invalidScene?.durationSeconds]
  );

  return {
    ...repairedScene,
    index: Number(invalidScene?.index) || repairedScene.index,
    semanticAnchor: anchor,
    semanticCollision: collision,
  };
};

export const parseScenePlanLengthMismatch = (error) => {
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

const FALLBACK_SCENE_VARIANTS = [
  {
    title: 'Shifted Passage',
    sceneFocus: 'location',
    event: 'Temporary partitions slowly change the visible route through the hall.',
    consequence: 'The former straight passage now ends at a mirrored column.',
    stillPrompt: 'The real department-store hall with temporary partitions already forming a changed route.',
    videoPrompt: 'The nearest partition shifts slightly and redirects the open passage.',
  },
  {
    title: 'Moving Reflections',
    sceneFocus: 'objects',
    event: 'Reflections slide across a row of ordinary stacked fixtures while the fixtures remain still.',
    consequence: 'A narrow band of reflected light settles across the concrete floor.',
    stillPrompt: 'Ordinary fixtures in the real department-store interior with reflected light already crossing their worn surfaces.',
    videoPrompt: 'The reflected light moves once across the fixtures and settles on the floor.',
  },
  {
    title: 'Changed Circulation',
    sceneFocus: 'people',
    event: 'Several visitors quietly choose a new path around an angled barrier.',
    consequence: 'A clear curved walking route remains around the barrier.',
    stillPrompt: 'The real department-store interior with ordinary visitors already moving around one angled temporary barrier.',
    videoPrompt: 'The visitors complete one calm turn around the barrier and leave the curved route readable.',
  },
  {
    title: 'Unexplained Trace',
    sceneFocus: 'trace',
    event: 'A harmless line of fine dust moves across the concrete under a ventilation draft.',
    consequence: 'The dust settles as a thin curved trace beside the elevator doors.',
    stillPrompt: 'The worn department-store floor with a thin dust trace already visible beside the elevator doors.',
    videoPrompt: 'The fine dust shifts once in the draft and settles into a curved line.',
  },
  {
    title: 'Shelves Rebalance',
    sceneFocus: 'objects',
    event: 'A row of ordinary shelves settles into a slightly new alignment beside the altered passage.',
    consequence: 'The reordered shelves leave a clear narrow route toward the elevator doors.',
    stillPrompt: 'Ordinary shelves in the real unfinished department-store interior, already settled into a new alignment beside a narrow route.',
    videoPrompt: 'The nearest shelf makes one small grounded adjustment and leaves the route open.',
  },
  {
    title: 'Route Settles',
    sceneFocus: 'trace',
    event: 'Dust and reflected light settle along the newly opened route without introducing a new subject.',
    consequence: 'The route remains visible as a quiet final condition of the Kaufhaus.',
    stillPrompt: 'The real unfinished department-store floor with a narrow settled dust-and-light route leading toward the elevator doors.',
    videoPrompt: 'The dust and reflected light settle once along the open route and remain still.',
  },
];

export const buildNeutralFallbackScenePlan = ({
  sceneCount = 1,
  sceneLengths = [],
  sourceCueRecords = [],
} = {}) => compactScenePlanFields(Array.from({ length: sceneCount }, (_, index) => {
  const variant = FALLBACK_SCENE_VARIANTS[index % FALLBACK_SCENE_VARIANTS.length];
  const cue = sourceCueRecords[index] || {};
  return {
    index: index + 1,
    ...variant,
    semanticAnchor: normalizeString(cue?.anchor?.term, `anchor-${index + 1}`),
    semanticAnchorEnglish: 'current semantic anchor',
    semanticCollision: normalizeString(cue?.collision?.term, `collision-${index + 1}`),
    semanticCollisionEnglish: 'current semantic collision',
    monsterPresence: variant.sceneFocus === 'monster' || variant.sceneFocus === 'mixed'
      ? 'fully visible canonical protagonist'
      : 'absent',
    nextHook: variant.consequence,
    cameraCue: Number(sceneLengths[index]) <= 2
      ? 'The viewpoint remains nearly fixed with one slight imperfect reframe.'
      : 'The viewpoint makes one small restrained adjustment.',
    startFrameStrategy: variant.sceneFocus === 'monster' || variant.sceneFocus === 'mixed'
      ? 'locationReanchor'
      : (index === 0 ? 'locationReanchor' : 'rawLastFrame'),
    startFrameReason: variant.sceneFocus === 'monster' || variant.sceneFocus === 'mixed'
      ? 'Create a fresh canonical monster frame from the supplied identity reference.'
      : (index === 0
        ? 'Establish the real department-store location.'
        : 'Continue from the previous visible end state.'),
    durationSeconds: normalizeSceneLengthValue(sceneLengths[index], 3),
    videoMode: 'singleImage',
    frameSource: variant.sceneFocus === 'monster' || variant.sceneFocus === 'mixed'
      ? 'newImage'
      : (index === 0 ? 'newImage' : 'lastFrame'),
    freshImage: variant.sceneFocus === 'monster' || variant.sceneFocus === 'mixed' || index === 0,
  };
}));

export const generateScenePlanWithFallback = async ({
  generateScenes,
  sceneCount,
  sceneLengths,
  configMode,
  sceneFlavor,
  visualDirection,
  visionStoryContext,
  sourceCues,
  sourceCueRecords = [],
  startFrameStrategy,
  strictSemanticValidation = true,
  allowNeutralFallback = true,
} = {}) => {
  if (typeof generateScenes !== 'function') {
    throw new Error('generateScenePlanWithFallback requires a generateScenes function');
  }

  const targetSceneCount = clampSceneCount(sceneCount);
  const activeSceneLengths = Array.isArray(sceneLengths)
    ? sceneLengths.slice(0, targetSceneCount)
    : await resolveSceneLengthsInput(sceneLengths, targetSceneCount, 3);
  const activeCueRecords = sourceCueRecords.slice(0, targetSceneCount);
  const plannerRequest = {
    sceneCount: targetSceneCount,
    sceneLengths: activeSceneLengths,
    configMode,
    sceneFlavor,
    visualDirection,
    visionStoryContext,
    sourceCues,
    sourceCueRecords: activeCueRecords,
    startFrameStrategy,
  };
  let rawScenePlan;
  let scenePlan;
  let semanticValidation;
  let rejectionType = 'invalid-scene-plan';
  const planningAttempts = [];
  let latestPlannerError = null;
  try {
    rawScenePlan = await generateScenes(plannerRequest);
    scenePlan = rawScenePlan;
    semanticValidation = validateScenePlan({
      scenePlan,
      sourceCueRecords: activeCueRecords,
      expectedSceneCount: targetSceneCount,
    });
  } catch (error) {
    latestPlannerError = error;
    rejectionType = error?.name === 'InvalidScenePlanContentError'
      ? 'planner-refusal'
      : 'invalid-scene-plan';
    rawScenePlan = error?.rawScenePlan || '';
    scenePlan = [];
    semanticValidation = {
      valid: false,
      errors: [`Scene plan is not valid JSON: ${error?.message || error}`],
      reports: [],
    };
  }

  if (!semanticValidation.valid) {
    planningAttempts.push({
      planningAttempt: 1,
      rejectionType,
      rejected: true,
    });
    logger.warn({
      type: 'planner-rejection',
      attempt: 1,
      rejectionType,
      errors: semanticValidation.errors,
    });
    try {
      scenePlan = await generateScenes({
        ...plannerRequest,
        repairContext: { retryReason: 'invalid-scene-plan' },
      });
      semanticValidation = validateScenePlan({
        scenePlan,
        sourceCueRecords: activeCueRecords,
        expectedSceneCount: targetSceneCount,
      });
    } catch (error) {
      latestPlannerError = error;
      scenePlan = [];
      semanticValidation = {
        valid: false,
        errors: [`Clean scene-plan repair was invalid: ${error?.message || error}`],
        reports: [],
      };
    }
  }

  if (!semanticValidation.valid) {
    planningAttempts.push({
      planningAttempt: 2,
      rejectionType: 'invalid-scene-plan',
      rejected: true,
      fallbackUsed: allowNeutralFallback,
    });
    logger.warn({
      type: 'planner-rejection',
      attempt: 2,
      rejectionType: 'invalid-scene-plan',
      fallbackUsed: allowNeutralFallback,
      errors: semanticValidation.errors,
    });
    if (!allowNeutralFallback) {
      const error = new Error(
        `Scene planner failed twice; neutral fallback disabled: ${semanticValidation.errors.join(' | ')}`
      );
      error.name = 'SemanticSceneValidationError';
      error.rawScenePlan = latestPlannerError?.rawScenePlan || rawScenePlan || '';
      error.scenePlan = scenePlan;
      error.validation = semanticValidation;
      error.planningAttempts = planningAttempts;
      throw error;
    }
    scenePlan = buildNeutralFallbackScenePlan({
      sceneCount: targetSceneCount,
      sceneLengths: activeSceneLengths,
      sourceCueRecords: activeCueRecords,
    });
    semanticValidation = validateScenePlan({
      scenePlan,
      sourceCueRecords: activeCueRecords,
      expectedSceneCount: targetSceneCount,
    });
  }

  if (!semanticValidation.valid && strictSemanticValidation) {
    const error = new Error('Deterministic fallback scene plan failed validation');
    error.name = 'SemanticSceneValidationError';
    error.scenePlan = scenePlan;
    error.validation = semanticValidation;
    error.planningAttempts = planningAttempts;
    throw error;
  }

  semanticValidation = {
    ...semanticValidation,
    planningAttempts,
  };

  return {
    scenePlan: compactScenePlanFields(scenePlan),
    rawScenePlan,
    semanticValidation,
    planningAttempts,
    effectiveSceneCount: targetSceneCount,
    effectiveSceneLengths: activeSceneLengths,
  };
};

export const buildScenePlannerUserMessage = ({
  count = 1,
  sceneLengths = [],
  configMode = 'generated',
  sceneFlavor = 'default',
  visualDirection = '',
  sourceCues = [],
  sourceCueRecords = [],
  visionStoryContext = '',
  startFrameStrategy = {},
} = {}) => {
  const totalDuration = sceneLengths.reduce(
    (sum, value) => sum + Number(value || 0),
    0
  ) || 3;
  const normalizedFlavor = normalizeString(sceneFlavor, 'default');
  const usesTrippyFlavor = normalizedFlavor.toLowerCase() === 'ltxtrippy';
  const usesReferenceImage = isReferenceImageActorMode(configMode);
  const plannerControlsStartFrames = startFrameStrategy?.enabled === true;

  const requestFacts = [
    `Scene count: ${count}`,
    `Scene lengths (seconds): ${sceneLengths.join(', ') || '3'}`,
    `Total film duration (seconds): ${totalDuration}`,
    `Config mode: ${normalizeString(configMode, 'generated')}`,
    `Scene flavor: ${normalizedFlavor}`,
    `Visual direction: ${normalizeString(visualDirection, 'documentary, realistic, concise')}`,
    `Source cues (ordered semantic story anchors): ${JSON.stringify(sourceCues)}`,
    `Structured source cue records (canonical): ${JSON.stringify(sourceCueRecords)}`,
  ];

  const storyRules = [
    'Wordstream rule: treat source cues as an ordered wordstream and map each next cue into a visible scene-state shift.',
    'Story requirement: treat the source cues as the story spine. Build a coherent micro-story that starts from the early cues and develops, escalates, or transforms through the later cues.',
    'Story progression rule: scenes must feel causally linked; each next scene should happen because of the previous one, not as a disconnected new label.',
    'Scene memory rule: after scene 1, let the previous scene leave a visible residue in the next one through expression, posture, room tension, visible aftermath, or a changed setup.',
    'If the source cues are genres, titles, or keywords, infer concrete visual story beats from them instead of falling back to a generic host, explainer, or discussion format.',
    'Prefer embodied scene beats with visible stakes, gesture, posture, expression, framing pressure, or environmental tension over abstract explanation or topic-summary wording.',
  ];

  const stagingRules = [
    'Action rule: every beat and storyBeat must contain a decisive visible change or action, not just a mood label or static description.',
    'Motion rule: motionCue must describe what physically changes in the shot. Do not use framing descriptions or static close-up wording as a motionCue.',
    'Camera rule: cameraCue must describe one readable camera behavior that intensifies the scene event rather than merely restating framing.',
    'Interaction rule: each cue must visibly act on the subject, the room, or both together; make that relationship explicit instead of leaving the cue unattached to the shot.',
    'Interaction variety rule: across the sequence, vary whether the cue mainly changes the body, the room emphasis, or both at once.',
    'Curious spectacle rule: use the screenshot and the cue words to stage something visibly strange, charged, or inquisitive inside the same shot instead of flattening the cue into neutral coverage.',
    'Adjacent scenes must not repeat the same dominant beat skeleton, motion pattern, or camera pattern unless the cue progression itself repeats.',
    'Wordstream visual mapping: express cue changes through location emphasis (which part of the room/background dominates), actor movement/body language, and sensory visual description (light, texture, atmosphere, tension).',
    'Cue consequence rule: each cue must change beat and storyBeat, and must also change at least one of motionCue, cameraCue, stillPrompt, or imageDescription in a visible way.',
  ];

  const productionPromptRules = [
    'Semantic collision rule: when a source cue labels Anchor and Collision terms, keep those roles distinct. Do not explain, reconcile, or summarize the contradiction; stage it as a visible physical event.',
    'Translation rule: preserve semanticAnchor and semanticCollision in their exact source language for identity checks, but translate non-English terms into semanticAnchorEnglish and semanticCollisionEnglish. Write stillPrompt, videoPrompt, singleImagePrompt, motionCue, cameraCue, and all other production-facing prose in English.',
    'Semantic baton rule: Anchor is inherited from the previous scene, Collision is the fresh getNext term, and that Collision must become the next scene\'s inherited Anchor.',
    'Surreal description rule: name the exact impossible but visible event produced by the collision. Show what happens to bodies, objects, light, texture, architecture, or human behavior; never substitute theme words or interpretation.',
    'FLUX stillPrompt contract: write a self-contained image prompt with subject, decisive frozen action, semantic collision, grounded location, mood, lighting, palette, texture, composition, lens or framing, and period/style treatment.',
    'WAN singleImagePrompt contract: write a self-contained image-to-video prompt with starting state, temporal transformation, subject motion, environmental motion, atmosphere, changing light, composition continuity, and one motivated virtual camera move without cuts.',
    'If cue text is fragmentary, infer a concrete visible consequence in the shot instead of falling back to generic placeholders like reflection, discussion, or vague tension.',
  ];

  const startFrameStrategyRules = plannerControlsStartFrames
    ? [
        'Start-frame strategy control: enabled. Choose the image source separately for every scene.',
        `Start-frame distribution target: approximately ${startFrameStrategy.rawLastFramePercent}% rawLastFrame, ${startFrameStrategy.driftCorrectedLastFramePercent}% driftCorrectedLastFrame, and ${startFrameStrategy.locationReanchorPercent}% locationReanchor across the complete plan. Treat these as dramatic targets, not a mechanical repeating pattern.`,
        `First-scene strategy target: ${startFrameStrategy.firstSceneStrategy}. Last-scene strategy target: ${startFrameStrategy.lastSceneStrategy}.`,
        `Raw continuity limit: do not plan more than ${startFrameStrategy.maxConsecutiveRawLastFrames} rawLastFrame scenes consecutively.`,
        'Use rawLastFrame for immediate motion continuity when the previous transformation should remain visually untouched.',
        'Use driftCorrectedLastFrame when the previous transformation must continue but protagonist identity, room geometry, lighting, texture, or realism should be restored before WAN animation.',
        'Use locationReanchor for a new photographed Kaufhaus zone, a major composition change, a new dramatic act, or a canonical reset of protagonist and architecture.',
        'Do not use drift correction as a visual effect or generic quality enhancer. Preserve the mutation while repairing only continuity drift.',
        normalizeString(startFrameStrategy.guidance),
      ].filter(Boolean)
    : [
        'Start-frame strategy control: disabled. Supply a compatible startFrameStrategy value, but legacy frameSource behavior remains authoritative.',
      ];

  const flavorRules = [
    `Trippy flavor rule: ${usesTrippyFlavor
      ? 'allow the cue words to create surreal visible events, hallucinated objects, warped room geometry, transformed light, symbolic props, and uncanny action inside the shot. Do not limit the plan to slight gaze or posture changes. At least half of the scenes should contain a strong visible transformation or event.'
      : 'n/a'}`,
    `Trippy action rule: ${usesTrippyFlavor
      ? 'for ltxTrippy, beats should read like scene events: something appears, spreads, bends, bursts, swallows, floods, circles, melts, multiplies, or overtakes the room or subject.'
      : 'n/a'}`,
  ];

  const visionRules = [
    visionStoryContext
      ? `Vision story context from the source shot: ${visionStoryContext}`
      : 'Vision story context from the source shot: n/a',
    visionStoryContext
      ? 'If vision story context is provided, use it as continuity for each scene, especially location, actors, and visible-shot description.'
      : 'If vision story context is provided, use it as continuity for each scene.',
  ];

  const referenceImageRules = [
    `Reference-image-actor-mode reminder: ${usesReferenceImage
      ? 'keep the story inside the real visible shot, but still let the source cues control the emotional arc, tension, and implied events.'
      : 'n/a'}`,
    `Reference-image-actor-mode visible-anchor rule: ${usesReferenceImage
      ? 'use the vision story context as the source of truth for location, actor identity, and visible scene setup. Build stillPrompt, imageDescription, motionCue, cameraCue, videoPrompt, and singleImagePrompt from that visible basis instead of inventing unsupported elements.'
      : 'n/a'}`,
    `Reference-image-actor-mode firstLast rule: ${usesReferenceImage
      ? 'use firstLast only for small believable changes between start and destination inside the same visible room, such as pose, gaze, expression, crop, or lighting emphasis. Do not use firstLast to reveal new objects or widen into a new setup.'
      : 'n/a'}`,
  ];

  return [
    ...requestFacts,
    ...storyRules,
    ...stagingRules,
    ...productionPromptRules,
    ...startFrameStrategyRules,
    ...flavorRules,
    ...visionRules,
    ...referenceImageRules,
  ].join('\n');
};

export const createSceneGenerator = ({
  openai,
  fallbackOpenai,
  model,
  fallbackModel = '',
  systemPrompt = '',
  temperature = 0.4,
  top_p = 0.9,
  timeoutMs = 45000,
} = {}) => {
  if (!openai?.chat?.completions?.create) {
    throw new Error('createSceneGenerator requires an OpenAI-compatible client');
  }

  const configuredSystemPrompt = normalizeString(systemPrompt);
  const resolvedSystemPrompt = configuredSystemPrompt
    ? `${COMPACT_SCENE_PLAN_SYSTEM_PROMPT} ${configuredSystemPrompt}`
    : COMPACT_SCENE_PLAN_SYSTEM_PROMPT;

  return async ({
    sourceCues = [],
    sourceCueRecords = [],
    sceneLengths = [],
    sceneCount = 3,
    visualDirection = '',
    visionStoryContext = '',
    configMode = 'generated',
    sceneFlavor = 'default',
    startFrameStrategy = {},
    repairContext = null,
  } = {}) => {
    const count = clampSceneCount(sceneCount);
    const resolvedSceneLengths = await resolveSceneLengthsInput(sceneLengths, count, 3);
    const normalizedVisionStoryContext = normalizeString(visionStoryContext);
    const userMessage = buildCompactPlannerUserMessage({
      count,
      sceneLengths: resolvedSceneLengths,
      creatureDescription: visualDirection,
      locationDescription: normalizedVisionStoryContext,
      sourceCueRecords: sourceCueRecords.slice(0, count),
    });
    const repairMessage = repairContext
      ? CLEAN_SCENE_PLAN_REPAIR_INSTRUCTION
      : '';

    const messages = [
      {
        role: 'system',
        content: resolvedSystemPrompt,
      },
      {
        role: 'user',
        content: [userMessage, repairMessage].filter(Boolean).join('\n\n'),
      },
    ];

    const requestScenePlan = async (client, activeModel) => {
      const samplingOptions = supportsCustomScenePlanSampling(activeModel)
        ? { temperature, top_p }
        : {};
      const request = {
        model: activeModel,
        messages,
        response_format: {
          type: 'json_schema',
          json_schema: createCompactScenePlanSchema(count),
        },
        ...samplingOptions,
      };

      logger.payload('chat request', request, { maxLength: 16000 });
      // Scene planning is optional: the deterministic semantic fallback can
      // render a complete trailer when a remote planner is slow or unavailable.
      // Never let one pending request stall the whole render loop forever.
      const response = await client.chat.completions.create(request, {
        timeout: timeoutMs,
      });
      logger.payload('chat response', {
        model: activeModel,
        response,
      }, { maxLength: 16000 });
      return response;
    };

    let response;
    try {
      response = await requestScenePlan(openai, model);
    } catch (primaryError) {
      if (!fallbackOpenai?.chat?.completions?.create) {
        throw primaryError;
      }

      try {
        response = await requestScenePlan(fallbackOpenai, fallbackModel || model);
      } catch (fallbackError) {
        throw new Error(
          `Scene plan request failed with primary model "${model}": ${primaryError.message}; fallback model "${fallbackModel || model}": ${fallbackError.message}`
        );
      }
    }

    const content = response?.choices?.[0]?.message?.content;
    try {
      return parseCompactScenePlan(content, count, resolvedSceneLengths);
    } catch (error) {
      error.rawScenePlan = content;
      throw error;
    }
  };
};

export const getScenePlanEntry = (scenePlan, sceneContext = {}) => {
  if (!Array.isArray(scenePlan) || scenePlan.length === 0) {
    return null;
  }
  const index = Math.max(0, Number(sceneContext?.index || 1) - 1);
  return scenePlan[index] || null;
};

export const compactScenePrompt = (value, maxSentences = 3, maxWords = 55) => {
  const normalized = normalizeString(value).replace(/\s*[\r\n]+\s*/g, ' ').trim();
  if (!normalized) {
    return normalized;
  }

  const sentenceParts = normalized
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, maxSentences);

  const compact = sentenceParts.join(' ');
  const truncatedWords = compact.split(' ').filter(Boolean).slice(0, maxWords).join(' ').trim();
  if (!truncatedWords) {
    return truncatedWords;
  }
  if (/[.!?]$/.test(truncatedWords)) {
    return truncatedWords;
  }

  const lastSentenceStart = Math.max(
    truncatedWords.lastIndexOf('. '),
    truncatedWords.lastIndexOf('! '),
    truncatedWords.lastIndexOf('? ')
  );
  if (lastSentenceStart > 0) {
    return `${truncatedWords.slice(0, lastSentenceStart + 1).trim()}`;
  }
  return `${truncatedWords}.`;
};

export const buildFallbackStillPrompt = (sourcePrompt) => {
  const cue = normalizeString(sourcePrompt, 'a simple real-world subject');
  if (/freshweb documentary still of/i.test(cue) || /\bdocumentary still\b/i.test(cue)) {
    return cue;
  }
  return `freshweb documentary still of ${cue}, natural light, candid framing, realistic detail`;
};

export const buildFallbackVideoPrompt = (scenePlanEntry, fallbackText) => compactScenePrompt(
  `${normalizeString(scenePlanEntry?.storyBeat || scenePlanEntry?.beat, fallbackText)} ${normalizeString(scenePlanEntry?.motionCue)} ${normalizeString(scenePlanEntry?.cameraCue)}`
);
