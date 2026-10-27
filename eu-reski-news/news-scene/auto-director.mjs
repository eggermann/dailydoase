export const autoDirectorPromptVersion = 'eu-reski-auto-director-v1';

export function resolveAutoModeSetting(configuredValue = false, explicitArguments = []) {
  const enable = explicitArguments.includes('--auto-mode');
  const disable = explicitArguments.includes('--no-auto-mode');
  if (enable && disable) throw new Error('Choose either --auto-mode or --no-auto-mode');
  if (enable) return true;
  if (disable) return false;
  return configuredValue === true;
}

const flagKeys = [
  'storyClou',
  'legacyGuernicaStyleReferencePrompt',
  'preserveCubistVideoStyle',
  'sceneVisualControls',
  'articleImageReference',
  'landscapePrompt',
  'videoDirection',
  'videoVision',
  'videoAudioDirection',
  'videoMaxZoom',
];

export const autoDirectorSystemPrompt = [
  'You are the artistic film director for the experimental EU-RESKI news-film installation.',
  'For this news article, first form a coherent film concept, then choose a unified combination of the available creative settings.',
  'Consider dramaturgy, cubist image-making, Guernica references, spatial composition, motion, camera, visual continuity, and sound.',
  'Do not activate features just because they exist. A quiet, reduced, fragmentary, cyclical, or open-ended approach can be right.',
  'The existing Story planner remains responsible for the concrete story and scenes. Existing scene-specific visual controls remain responsible for their per-scene choices.',
  'Preserve EU-RESKI’s cubist identity. Disabling the extra cubist video lock never requests photorealism. Spoken content must follow the existing no-dialogue setting.',
  'Choose only schema values. Do not change models, providers, image/video resolution, costs, iteration count, article order, scene count/timing, paths, references, or operational settings.',
  'videoVision=on requires videoDirection=on. Scene video mode is fixed to executable image_to_video.',
  'Return every flag, all four short concept fields, and a concise reason.',
].join(' ');

const flagSchema = {
  type: 'object',
  additionalProperties: false,
  required: flagKeys,
  properties: {
    storyClou: { type: 'string', enum: ['on', 'off'] },
    legacyGuernicaStyleReferencePrompt: { type: 'boolean' },
    preserveCubistVideoStyle: { type: 'boolean' },
    sceneVisualControls: { type: 'string', enum: ['scene-specific', 'fixed'] },
    articleImageReference: { type: 'boolean' },
    landscapePrompt: { type: 'boolean' },
    videoDirection: { type: 'string', enum: ['on', 'off'] },
    videoVision: { type: 'string', enum: ['on', 'off'] },
    videoAudioDirection: { type: 'string', enum: ['on', 'off'] },
    videoMaxZoom: { type: 'number', minimum: 0, maximum: 0.3 },
  },
};

export const autoDirectorSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['dramaturgicalConcept', 'visualConcept', 'motionConcept', 'audioConcept', 'flags', 'reason'],
  properties: {
    dramaturgicalConcept: { type: 'string', minLength: 1, maxLength: 1200 },
    visualConcept: { type: 'string', minLength: 1, maxLength: 1200 },
    motionConcept: { type: 'string', minLength: 1, maxLength: 1200 },
    audioConcept: { type: 'string', minLength: 1, maxLength: 1200 },
    flags: flagSchema,
    reason: { type: 'string', minLength: 1, maxLength: 2000 },
  },
};

export function buildAutoDirectorRequest({ article, model, constraints = {} }) {
  const input = Object.fromEntries(['id', 'title', 'publish_date', 'url', 'source_country', 'language', 'summary', 'text']
    .map((key) => [key, String(article?.[key] ?? '').slice(0, key === 'text' ? 18000 : 4000)]));
  const request = {
    model,
    messages: [
      { role: 'system', content: autoDirectorSystemPrompt },
      { role: 'user', content: JSON.stringify({
        article: input,
        availableFlags: {
          storyClou: 'on | off; on activates the existing Story planner arc fields.',
          legacyGuernicaStyleReferencePrompt: 'true | false; true selects the archived director when style reference is active and Guernica location reference is off.',
          preserveCubistVideoStyle: 'true | false; true appends the existing cubist video style lock unless legacy director is effective.',
          sceneVisualControls: 'scene-specific | fixed; scene-specific reuses existing per-scene symbolic, roomDeepness, and layering decisions.',
          articleImageReference: 'true | false; controls whether the already downloaded article image is sent to image generation.',
          landscapePrompt: 'true | false; adds existing wide-frame composition guidance without changing image dimensions.',
          videoDirection: 'on | off; uses the existing per-iteration video director.',
          videoVision: 'on | off; uses existing iteration image analysis and requires videoDirection=on.',
          videoAudioDirection: 'on | off; uses existing audio planning and must respect the fixed no-dialogue setting.',
          videoMaxZoom: 'number from 0 through 0.3; limits the existing video director zoom/crop change without selecting a different model or mode.',
        },
        fixedConstraints: {
          sceneVideoMode: 'image_to_video',
          noDialogueNarration: constraints.noDialogueNarration === true,
          styleReferenceAvailable: constraints.styleReferenceAvailable === true,
          guernicaLocationReference: constraints.guernicaLocationReference === true,
          articleImageAvailable: constraints.articleImageAvailable === true,
          fixedVisualStyleOptions: constraints.fixedVisualStyleOptions || null,
          sceneCount: constraints.sceneCount ?? null,
          sceneTiming: constraints.sceneTiming || null,
          imageProvider: constraints.imageProvider || null,
          videoModel: constraints.videoModel || null,
          videoResolution: constraints.videoResolution || null,
          videoSettingsMode: constraints.videoSettingsMode || null,
          videosAfterEachIteration: constraints.videosAfterEachIteration === true,
        },
      }) },
    ],
    response_format: { type: 'json_schema', json_schema: { name: 'eu_reski_auto_director', strict: true, schema: autoDirectorSchema } },
    ...( /^gpt-6(?:\.1-sol|-luna)(?:-|$)/.test(model)
      ? { reasoning_effort: model.startsWith('gpt-6-luna') ? 'medium' : 'high' }
      : { temperature: 0.65 }),
    max_completion_tokens: 3000,
  };
  return request;
}

export function validateAutoDirectorResponse(response) {
  const choice = response?.choices?.[0];
  if (choice?.message?.refusal) throw new Error(`Auto director refusal: ${choice.message.refusal}`);
  if (choice?.finish_reason !== 'stop') throw new Error('Auto director did not return a complete decision');
  let result;
  try { result = JSON.parse(choice.message.content); } catch { throw new Error('Auto director returned invalid JSON'); }
  const allowedKeys = ['dramaturgicalConcept', 'visualConcept', 'motionConcept', 'audioConcept', 'flags', 'reason'];
  if (!result || Object.keys(result).length !== allowedKeys.length || allowedKeys.some((key) => !Object.hasOwn(result, key))) {
    throw new Error('Auto director response has missing or unknown fields');
  }
  for (const key of ['dramaturgicalConcept', 'visualConcept', 'motionConcept', 'audioConcept', 'reason']) {
    if (typeof result[key] !== 'string' || !result[key].trim()) throw new Error(`Auto director field ${key} must be non-empty text`);
  }
  const flags = result.flags;
  if (!flags || Object.keys(flags).length !== flagKeys.length || flagKeys.some((key) => !Object.hasOwn(flags, key))) {
    throw new Error('Auto director flags are incomplete or contain unknown settings');
  }
  if (!['on', 'off'].includes(flags.storyClou)
    || typeof flags.legacyGuernicaStyleReferencePrompt !== 'boolean'
    || typeof flags.preserveCubistVideoStyle !== 'boolean'
    || !['scene-specific', 'fixed'].includes(flags.sceneVisualControls)
    || typeof flags.articleImageReference !== 'boolean'
    || typeof flags.landscapePrompt !== 'boolean'
    || !['on', 'off'].includes(flags.videoDirection)
    || !['on', 'off'].includes(flags.videoVision)
    || !['on', 'off'].includes(flags.videoAudioDirection)) {
    throw new Error('Auto director selected an unsupported flag value');
  }
  if (typeof flags.videoMaxZoom !== 'number' || !Number.isFinite(flags.videoMaxZoom) || flags.videoMaxZoom < 0 || flags.videoMaxZoom > 0.3) {
    throw new Error('Auto director selected an unsupported videoMaxZoom value');
  }
  if (flags.videoVision === 'on' && flags.videoDirection !== 'on') {
    throw new Error('Auto director selected videoVision=on without videoDirection=on');
  }
  return structuredClone(result);
}

export function resolveEffectiveAutoFlags(selectedFlags, constraints = {}) {
  const effectiveFlags = { ...selectedFlags };
  const constraintsApplied = [
    'Scene video mode is fixed to image_to_video because first_last_frame is not executable in the current renderer.',
    `noDialogueNarration remains user-controlled (${constraints.noDialogueNarration === true ? 'enabled' : 'disabled'}).`,
  ];
  if (selectedFlags.legacyGuernicaStyleReferencePrompt
    && (!constraints.styleReferenceAvailable || constraints.guernicaLocationReference)) {
    effectiveFlags.legacyGuernicaStyleReferencePrompt = false;
    constraintsApplied.push(constraints.guernicaLocationReference
      ? 'Legacy Guernica director is ineffective while Guernica location reference is enabled.'
      : 'Legacy Guernica director is ineffective because the style reference is disabled.');
  }
  if (effectiveFlags.legacyGuernicaStyleReferencePrompt) {
    if (effectiveFlags.sceneVisualControls === 'scene-specific') {
      effectiveFlags.sceneVisualControls = 'fixed';
      constraintsApplied.push('Legacy Guernica director forces fixed visual controls.');
    }
    if (effectiveFlags.preserveCubistVideoStyle) {
      effectiveFlags.preserveCubistVideoStyle = false;
      constraintsApplied.push('Legacy Guernica director suppresses the additional Cubist Video Lock.');
    }
  }
  effectiveFlags.videoMode = 'image_to_video';
  if (effectiveFlags.videoVision === 'on' && effectiveFlags.videoDirection !== 'on') {
    throw new Error('Effective auto settings require videoVision=on to have videoDirection=on');
  }
  return { effectiveFlags, constraintsApplied };
}

export function resolveSavedAutoDecision(saved, { iteration, articleId, model, promptVersion, hasDependentWork, constraints = {} }) {
  if (!saved) {
    if (hasDependentWork) throw new Error('Auto decision is missing after dependent iteration work began; refusing to choose new settings on resume');
    return null;
  }
  if (saved.autoMode !== true || saved.iteration !== iteration || saved.articleId !== articleId
    || saved.model !== model || saved.promptVersion !== promptVersion) {
    throw new Error('Saved auto decision does not match this iteration, article, model, or prompt version');
  }
  const recordedConstraints = saved.constraints || constraints;
  const constraintKeys = ['noDialogueNarration', 'styleReferenceAvailable', 'guernicaLocationReference', 'articleImageAvailable'];
  if (constraintKeys.some((key) => constraints[key] !== recordedConstraints[key])) {
    throw new Error('Saved auto decision fixed constraints changed; refusing to resume with different effective settings');
  }
  const validated = validateAutoDirectorResponse({
    choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({
      dramaturgicalConcept: saved.dramaturgicalConcept,
      visualConcept: saved.visualConcept,
      motionConcept: saved.motionConcept,
      audioConcept: saved.audioConcept,
      flags: saved.selectedFlags,
      reason: saved.reason,
    }) } }],
  });
  const resolved = resolveEffectiveAutoFlags(validated.flags, recordedConstraints);
  if (JSON.stringify(resolved.effectiveFlags) !== JSON.stringify(saved.effectiveFlags)
    || JSON.stringify(resolved.constraintsApplied) !== JSON.stringify(saved.constraintsApplied)) {
    throw new Error('Saved auto decision effective settings no longer match this iteration constraints');
  }
  return saved;
}
