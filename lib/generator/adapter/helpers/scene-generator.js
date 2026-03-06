const stripCodeFences = (value) => String(value ?? '')
  .replace(/^```(?:json)?\s*/i, '')
  .replace(/\s*```$/i, '')
  .trim();

const clampSceneCount = (value) => {
  const count = Number(value);
  if (!Number.isFinite(count) || count < 1) {
    return 1;
  }
  return Math.floor(count);
};

const normalizeString = (value, fallback = '') => {
  const text = String(value ?? '').trim();
  return text || fallback;
};

export const parseScenePlan = (value, sceneCount = 3) => {
  const count = clampSceneCount(sceneCount);
  const parsed = JSON.parse(stripCodeFences(value));
  if (!Array.isArray(parsed)) {
    throw new Error('Scene plan response is not an array');
  }

  return parsed.slice(0, count).map((item, index) => ({
    index: index + 1,
    title: normalizeString(item?.title, `Scene ${index + 1}`),
    beat: normalizeString(item?.beat, ''),
    stillPrompt: normalizeString(item?.stillPrompt, ''),
    storyBeat: normalizeString(item?.storyBeat, ''),
    motionCue: normalizeString(item?.motionCue, ''),
    cameraCue: normalizeString(item?.cameraCue, ''),
    freshImage: item?.freshImage === true,
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

  const resolvedSystemPrompt = normalizeString(
    systemPrompt,
    'You create short visual scene plans for image-to-video generation. Return only valid JSON: an array of scene objects. Each object must contain title, beat, stillPrompt, storyBeat, motionCue, cameraCue, and freshImage. Build one simple story arc, but make every scene visibly different from the previous scene. For scenes after the first, stillPrompt must describe the next destination image the shot should arrive at, not a paraphrase of the previous frame. Change at least the setting, primary action, or framing emphasis in every next scene. stillPrompt must describe one still image. storyBeat must explain what new moment this scene adds. motionCue and cameraCue must be short and concrete. freshImage must be a boolean. Default it to false, and set it true only when that scene should break away from the previous scene instead of reusing the previous last frame.',
  );

  return async ({
    sourceCues = [],
    sceneLengths = [],
    sceneCount = 3,
    visualDirection = '',
  } = {}) => {
    const count = clampSceneCount(sceneCount);
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
            `Scene lengths (seconds): ${sceneLengths.join(', ') || '3'}`,
            `Visual direction: ${normalizeString(visualDirection, 'documentary, realistic, concise')}`,
            `Source cues: ${JSON.stringify(trimmedCues)}`,
          ].join('\n'),
        },
      ],
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
