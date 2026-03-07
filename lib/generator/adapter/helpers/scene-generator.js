import {
  clampSceneCount,
  normalizeFrameSource,
  normalizeSceneLengthValue,
  normalizeString,
  normalizeVideoMode,
  stripCodeFences,
} from './scene-generator-helpers.js';

export const DEFAULT_SCENE_SYSTEM_PROMPT = [
  'You create short visual scene plans for image-to-video generation.',
  'Return only valid JSON.',
  'Build one simple story arc, but make every scene visibly different from the previous scene.',
  'For scenes after the first, stillPrompt must describe the next destination image the shot should arrive at, not a paraphrase of the previous frame.',
  'Change at least the setting, primary action, or framing emphasis in every next scene.',
  'Each scene object must explicitly describe how the scene is set up.',
  'stillPrompt must describe one still image.',
  'imageDescription must describe the visible image setup for the scene in plain terms.',
  'frameSource must be either "lastFrame" or "newImage". Use "lastFrame" when the scene should continue from the previous video last frame. Use "newImage" when the scene should start from a newly generated image.',
  'videoMode must be either "firstLast" or "singleImage".',
  'videoPrompt must be a final ready-to-use prompt for first-last image-to-video mode, not notes or instructions.',
  'singleImagePrompt must be a final ready-to-use prompt for single-image video mode, not notes or instructions.',
  'Both videoPrompt and singleImagePrompt must be short, concrete, and production-ready.',
  'Each of those prompt fields should usually be 2 to 3 short sentences.',
  'Each video prompt must focus on visible action, scene change, and one camera move.',
  'Do not write meta instructions, labels, bullet points, or explanations inside the prompt fields.',
  'Do not mention JSON, schema, scene object, first sentence, second sentence, or any prompt-writing instructions inside the prompt fields.',
  'If videoMode is "firstLast", videoPrompt must clearly move from the current frame toward the destination scene.',
  'If videoMode is "singleImage", singleImagePrompt must animate the current frame with believable motion without requiring a generated end frame.',
  'storyBeat must explain what new moment this scene adds.',
  'motionCue and cameraCue must be short and concrete.',
  'freshImage must match the setup choice: true when a new image is needed, false when the previous last frame should be reused.',
  'useCameraShot must be a boolean. Only set it true when configMode is "camera" and the scene should use the webcam-shot flow. Otherwise set it false.',
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
            'motionCue',
            'cameraCue',
            'frameSource',
            'videoMode',
            'videoPrompt',
            'singleImagePrompt',
            'freshImage',
            'useCameraShot',
          ],
          properties: {
            title: { type: 'string' },
            beat: { type: 'string' },
            stillPrompt: { type: 'string' },
            imageDescription: { type: 'string' },
            storyBeat: { type: 'string' },
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
            videoPrompt: { type: 'string' },
            singleImagePrompt: { type: 'string' },
            freshImage: { type: 'boolean' },
            useCameraShot: { type: 'boolean' },
          },
        },
      },
    },
  },
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

export const parseScenePlan = (value, sceneCount = 3) => {
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
    motionCue: normalizeString(item?.motionCue, ''),
    cameraCue: normalizeString(item?.cameraCue, ''),
    frameSource: normalizeFrameSource(item?.frameSource, item?.freshImage === true ? 'newImage' : 'lastFrame'),
    videoMode: normalizeVideoMode(item?.videoMode, 'singleImage'),
    videoPrompt: normalizeString(item?.videoPrompt, ''),
    singleImagePrompt: normalizeString(item?.singleImagePrompt, ''),
    freshImage: item?.freshImage === true,
    useCameraShot: item?.useCameraShot === true,
  }));
};

export const createSceneGenerator = ({
  openai,
  model,
  systemPrompt = '',
  temperature = 0.4,
  top_p = 0.9,
} = {}) => {
  if (!openai?.chat?.completions?.create) {
    throw new Error('createSceneGenerator requires an OpenAI-compatible client');
  }

  const resolvedSystemPrompt = normalizeString(systemPrompt, DEFAULT_SCENE_SYSTEM_PROMPT);

  return async ({
    sourceCues = [],
    sceneLengths = [],
    sceneCount = 3,
    visualDirection = '',
    configMode = 'generated',
  } = {}) => {
    const count = clampSceneCount(sceneCount);
    const resolvedSceneLengths = await resolveSceneLengthsInput(sceneLengths, count, 3);
    const trimmedCues = sourceCues
      .map((cue) => normalizeString(cue))
      .filter(Boolean)
      .slice(0, count);

    const response = await openai.chat.completions.create({
      model,
      messages: [
        {
          role: 'system',
          content: resolvedSystemPrompt,
        },
        {
          role: 'user',
          content: [
            `Scene count: ${count}`,
            `Scene lengths (seconds): ${resolvedSceneLengths.join(', ') || '3'}`,
            `Config mode: ${normalizeString(configMode, 'generated')}`,
            `Visual direction: ${normalizeString(visualDirection, 'documentary, realistic, concise')}`,
            `Source cues: ${JSON.stringify(trimmedCues)}`,
          ].join('\n'),
        },
      ],
      response_format: { type: 'json_schema', json_schema: SCENE_PLAN_SCHEMA },
      temperature,
      top_p,
    });

    const content = response?.choices?.[0]?.message?.content;
    const scenePlan = parseScenePlan(content, count);

    if (scenePlan.length !== count) {
      throw new Error(`Scene plan length mismatch: expected ${count}, received ${scenePlan.length}`);
    }

    return scenePlan;
  };
};

export const getScenePlanEntry = (scenePlan, sceneContext = {}) => {
  if (!Array.isArray(scenePlan) || scenePlan.length === 0) {
    return null;
  }
  const index = Math.max(0, Number(sceneContext?.index || 1) - 1);
  return scenePlan[index] || null;
};
