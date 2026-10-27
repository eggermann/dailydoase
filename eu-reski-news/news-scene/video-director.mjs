import { hash } from './planner.mjs';
import { visualPlanSnapshot } from './scene-timing.mjs';

const stringList = { type: 'array', items: { type: 'string' } };
const object = (properties) => ({
  type: 'object',
  additionalProperties: false,
  required: Object.keys(properties),
  properties,
});

export const videoDirectorPromptVersion = 'eu-reski-video-director-v6';

const nullablePoint = {
  anyOf: [
    { type: 'null' },
    object({ x: { type: 'number', minimum: 0, maximum: 1 }, y: { type: 'number', minimum: 0, maximum: 1 } }),
  ],
};
const motionVector = object({
  subject: { type: 'string', minLength: 1 },
  initialPosition: object({ description: { type: 'string' }, normalizedPoint: nullablePoint, geometryConfidence: { type: 'string', enum: ['high', 'medium', 'low', 'uncertain'] } }),
  coordinatePrecision: { type: 'string', enum: ['reliable', 'approximate', 'unavailable'] },
  direction: { type: 'string', minLength: 1 },
  normalizedDisplacement: { type: 'number', minimum: 0, maximum: 1 },
  startTimeSeconds: { type: 'number', minimum: 0 },
  endTimeSeconds: { type: 'number', minimum: 0 },
  speedProfile: { type: 'string', enum: ['hold', 'constant', 'ease_in', 'ease_out', 'ease_in_out', 'irregular'] },
  intendedFinalPosition: { type: 'string', minLength: 1 },
  geometryConfidence: { type: 'string', enum: ['high', 'medium', 'low', 'uncertain'] },
});
const transition = object({
  fromSceneIndex: { type: 'integer', minimum: 1 },
  toSceneIndex: { type: 'integer', minimum: 2 },
  movementContinues: { type: 'boolean' },
  recurringElements: stringList,
  motionDirectionAcrossCut: { type: 'string' },
  intendedTransition: { type: 'string' },
  potentialDiscontinuities: stringList,
  cameraRelationship: { type: 'string', enum: ['continue', 'contrast', 'reset', 'independent'] },
  previousCameraMotion: { type: 'string' },
  nextCameraMotion: { type: 'string' },
  cameraReason: { type: 'string' },
});

export function videoDirectionInputHash({ record, vision, model, videoMode, audioDirection = 'off', noDialogueNarration = false, maxZoom = 0.08 }) {
  return hash(JSON.stringify({
    promptVersion: videoDirectorPromptVersion,
    visualPlanHash: record.visualPlanHash || hash(JSON.stringify(visualPlanSnapshot(record.plan))),
    sceneTiming: record.plan.scenes.map(({ index, durationSeconds, videoPrompt }) => ({ index, durationSeconds, videoPrompt })),
    imageHashes: record.plan.scenes.map((scene, index) => ({ index: scene.index, sha256: record.results[index]?.sha256 || null })),
    visionStatus: vision?.status || 'disabled',
    visionHash: vision?.inputHash || null,
    model,
    videoMode,
    audioDirection,
    noDialogueNarration,
    maxZoom,
  }));
}

export function buildVideoDirectionRequest({ record, vision, model, videoMode = 'auto', audioDirection = 'off', noDialogueNarration = false, maxZoom = 0.08 }) {
  if (!['on', 'off'].includes(audioDirection)) throw new Error('audioDirection must be on or off');
  if (!Number.isFinite(maxZoom) || maxZoom < 0 || maxZoom > 0.3) throw new Error('maxZoom must be from 0 through 0.3');
  const includeAudio = audioDirection === 'on';
  const modeEnum = videoMode === 'auto' ? ['image_to_video', 'first_last_frame'] : [videoMode];
  const scenes = record.plan.scenes.map((scene, index) => ({
    sceneIndex: scene.index,
    title: scene.title,
    storyBeat: scene.storyBeat,
    protagonistAction: scene.protagonistAction,
    dramaticFunction: scene.dramaticFunction || 'unspecified',
    durationSeconds: scene.durationSeconds,
    legacyVideoPrompt: scene.videoPrompt,
    startImagePath: record.results[index]?.path || null,
    startImageSha256: record.results[index]?.sha256 || null,
    visualControls: scene.visualStyleOptions || record.visualStyleOptions || null,
    videoVision: vision?.scenes?.find((item) => item.sceneIndex === scene.index) || null,
  }));
  const audioDirectionSchema = includeAudio ? {
    audioDirection: object({
      overallConcept: { type: 'string', minLength: 1 },
      recurringMotifs: stringList,
      voicePolicy: { type: 'string', enum: [noDialogueNarration ? 'no_spoken_audio' : 'spoken_audio_allowed'] },
      musicPolicy: { type: 'string' },
      continuityStrategy: { type: 'string' },
    }),
  } : {};
  const sceneAudioSchema = includeAudio ? {
    sceneAudio: object({
      soundEvents: { type: 'array', items: object({
        description: { type: 'string', minLength: 1 },
        startSeconds: { type: 'number', minimum: 0 },
        endSeconds: { type: 'number', minimum: 0 },
      }) },
      ambientTexture: { type: 'string' },
      continuityFromPrevious: { type: 'string' },
      continuityToNext: { type: 'string' },
      intentionalSilence: { type: 'boolean' },
      silenceReason: { type: 'string' },
      spokenKind: { type: 'string', enum: noDialogueNarration ? ['none'] : ['dialogue', 'narration', 'none'] },
      spokenText: { type: 'string' },
    }),
  } : {};
  const request = {
    model,
    temperature: 0.45,
    max_completion_tokens: Math.max(8000, scenes.length * 1600),
    messages: [
      { role: 'system', content: [
        'You are a film director planning movement from each actual generated start image to an intended visual end state for an already locked story.',
        'Read the whole story and inspect the supplied Vision observations for the actual start image before planning motion. Subject and object vectors must refer to elements visibly present in that image. For prompt-only runs with no image observations, mark geometry uncertain and keep positions qualitative.',
        'The locked story, scene order, protagonist, actions, visual plan, start images and durations are immutable. Never rewrite them.',
        'Preserve uncertainty for abstract or ambiguous painted forms. Do not infer exact anatomy or geometry unsupported by the pixels. Use normalized coordinates only when image-relative positions are reliable; otherwise set normalizedPoint to null and state that the direction is approximate.',
        'Create zero or more motionVectors for each scene. Each vector moves one visible subject or object, describes its initial position, direction, normalized displacement from 0 to 1, start and end times within the supplied duration, speed profile, intended final position/relationship and geometry confidence. Multiple vectors are allowed; static elements need no vector.',
        `Plan camera for the complete iteration, not as isolated shots. Inspect the prior and next scene, their duration, framing and visible motion. Use a quiet camera as a full choice; do not repeat push-ins by habit. A camera move must never replace the scene's visible subject action: prioritize a described gesture or object movement, and use a static or subtle camera when that best reveals it. Do not use zoom as the only motion when the scene contains a visible action. Keep object motion vectors separate. For each camera plan give framing, continuity intent and zoomAmount as a fraction of frame width; maximum is ${maxZoom}. Zero means no zoom. If duration is 2–3 seconds, prefer static or one simple subtle move. A zoom may be stronger only up to the configured maximum.`,
        'Describe a coherent endState: final subject positions, spatial relationships, completed actions, unchanged elements, and whether exact composition is necessary. It must follow from the image and vectors, with no unrelated new objects or characters.',
        'Write videoPrompt entirely in natural English for visible subject/object motion only. Do not include camera instructions in videoPrompt; camera is returned separately. Do not add sound, speech, objects or characters. Preserve the monochrome painted cubist surface, protagonist and symbolic motifs.',
        'Choose the video mode independently for each scene only after considering the actual image, vectors, endState, narrative function and existing duration. image_to_video is the normal choice. Use first_last_frame rarely, only when an exact final composition is essential and cannot be reached reliably in one continuous shot. Do not select it merely because a scene is last or dramatic.',
        'For first_last_frame provide the exact final composition requirements, elements to keep consistent and a future end-frame generation brief. This is planning only: lastFrame.imagePath must be null and executionStatus must be requires_last_frame. Do not generate any end image.',
        'Return one sceneTransitions entry for each adjacent pair. Describe whether movement continues or changes, recurring visible elements, direction across the cut, intended transition and potential discontinuities. A deliberate cut is valid; never require artificial continuity.',
        'For each scene transition, explicitly compare previous and next camera motions and state whether the camera continues, contrasts, resets or is independent. Do not force a camera sequence.',
        ...(includeAudio ? [
          `Plan one experimental audio identity for the whole iteration in this same response. Use the story, ordered scenes, actual motion vectors and exact durations. The existing video model produces the sound. ${noDialogueNarration
            ? 'Add no narration or spoken dialogue; use spokenKind=none and empty spokenText in every scene.'
            : 'Spoken dialogue or narration is allowed when useful; use spokenKind and spokenText when present, otherwise use spokenKind=none and empty spokenText.'} Silence is allowed scene by scene.`,
          'Give each scene concrete sound events only when supported by a visible planned movement. Use actual motion vector timing where available; invent no movement for sound. Every sound event must start before it ends and fit inside that exact scene duration. Include continuity to adjacent scenes without requiring music in every scene.',
          'Keep intentionalSilence, silenceReason, ambientTexture, and soundEvents as independent cues; they may coexist or conflict. Do not reject or normalize such combinations. When silence and sound cues coexist, preserve both for the video model to interpret in context.',
        ] : []),
        videoMode === 'auto' ? 'Select either supported mode independently for each scene and explain each choice.' : `Use ${videoMode} for every scene; the requested mode is a planning constraint.`,
        'Do not alter the original legacyVideoPrompt. This new direction is separate metadata. Motion vector timing must fit the exact existing duration; do not plan or modify duration.',
      ].join('\n') },
      { role: 'user', content: JSON.stringify({
        storyPremise: record.plan.storyPremise,
        protagonist: record.plan.protagonist,
        storyArc: record.plan.storyArc || null,
        clouReveal: record.plan.clouReveal || null,
        visualPlan: visualPlanSnapshot(record.plan),
        scenes,
        visionStatus: vision?.status || 'disabled',
      }) },
    ],
    response_format: { type: 'json_schema', json_schema: {
      name: 'eu_news_video_direction', strict: true,
      schema: {
        ...object({
          overallDirection: object({ movementRhythm: { type: 'string' }, tensionCurve: { type: 'string' }, endingStrategy: { type: 'string' }, cameraOverview: { type: 'string' } }),
          ...audioDirectionSchema,
          sceneTransitions: { type: 'array', minItems: Math.max(scenes.length - 1, 0), maxItems: Math.max(scenes.length - 1, 0), items: transition },
          scenes: {
            type: 'array', minItems: scenes.length, maxItems: scenes.length,
            items: object({
              sceneIndex: { type: 'integer', minimum: 1, maximum: scenes.length },
              dramaticFunction: { type: 'string' },
              durationSeconds: { type: 'integer', minimum: 1, maximum: 60 },
              videoMode: { type: 'string', enum: modeEnum },
              modeReason: { type: 'string' },
              motionPlan: object({
                primarySubject: { type: 'string' }, primaryMotion: { type: 'string' }, secondaryMotion: { type: 'string' },
                motionVectors: { type: 'array', items: motionVector },
                cameraMotion: object({
                  type: { type: 'string', enum: ['static', 'pan', 'tilt', 'push_in', 'pull_back', 'lateral', 'rotation'] },
                  direction: { type: 'string' }, normalizedDisplacement: { type: 'number', minimum: 0, maximum: 1 }, description: { type: 'string' },
                  zoomAmount: { type: 'number', minimum: 0, maximum: maxZoom },
                  startFraming: { type: 'string' }, endFraming: { type: 'string' }, continuityIntent: { type: 'string' },
                }),
                motionIntensity: { type: 'integer', minimum: 0, maximum: 4 },
              }),
              endState: object({ description: { type: 'string' }, finalSubjectPositions: stringList, spatialRelationships: stringList, completedActions: stringList, unchangedElements: stringList, exactCompositionRequired: { type: 'boolean' } }),
              videoPrompt: { type: 'string', minLength: 80, maxLength: 5000 },
              lastFrame: object({ required: { type: 'boolean' }, description: { type: 'string' }, compositionRequirements: stringList, consistencyElements: stringList, generationBrief: { type: 'string' }, imagePath: { type: ['string', 'null'] } }),
              executionStatus: { type: 'string', enum: ['planned_single_image', 'requires_last_frame'] },
              ...sceneAudioSchema,
            }),
          },
        }),
      },
    } },
  };
  return request;
}

export function validateVideoDirectionResponse(response, { record, videoMode = 'auto', audioDirection = 'off', noDialogueNarration = false, maxZoom = 0.08 }) {
  const choice = response.choices?.[0];
  if (choice?.message?.refusal) throw new Error(`Video direction refusal: ${choice.message.refusal}`);
  if (choice?.finish_reason !== 'stop') throw new Error('GPT did not return complete video direction');
  const direction = JSON.parse(choice.message.content);
  const expectedScenes = record.plan.scenes;
  if (!direction.overallDirection || ['movementRhythm', 'tensionCurve', 'endingStrategy', 'cameraOverview'].some((field) => !direction.overallDirection[field]?.trim())
    || !Array.isArray(direction.scenes) || direction.scenes.length !== expectedScenes.length
    || !Array.isArray(direction.sceneTransitions) || direction.sceneTransitions.length !== Math.max(expectedScenes.length - 1, 0)) {
    throw new Error('Invalid whole-story video direction');
  }
  for (const [index, scene] of direction.scenes.entries()) {
    const original = expectedScenes[index];
    const resultImagePath = record.results[index]?.path || null;
    if (scene.sceneIndex !== original.index || scene.durationSeconds !== original.durationSeconds) throw new Error('Video direction changed scene order or authoritative duration');
    if (videoMode !== 'auto' && scene.videoMode !== videoMode) throw new Error('Video direction ignored the selected mode');
    if (!scene.modeReason?.trim() || !scene.videoPrompt?.trim() || !scene.motionPlan?.primaryMotion?.trim()
      || !Number.isInteger(scene.motionPlan.motionIntensity) || scene.motionPlan.motionIntensity < 0 || scene.motionPlan.motionIntensity > 4) {
      throw new Error(`Incomplete video direction for scene ${scene.sceneIndex}`);
    }
    if (!Array.isArray(scene.motionPlan.motionVectors) || !scene.motionPlan.cameraMotion || !scene.endState
      || !Array.isArray(scene.endState.finalSubjectPositions) || !Array.isArray(scene.endState.spatialRelationships)
      || !Array.isArray(scene.endState.completedActions) || !Array.isArray(scene.endState.unchangedElements)
      || typeof scene.endState.exactCompositionRequired !== 'boolean') throw new Error(`Incomplete motion/end-state plan for scene ${scene.sceneIndex}`);
    const camera = scene.motionPlan.cameraMotion;
    if (camera.type === 'static' && camera.normalizedDisplacement === 0) camera.zoomAmount = 0;
    if (!['static', 'pan', 'tilt', 'push_in', 'pull_back', 'lateral', 'rotation'].includes(camera.type)
      || !camera.description?.trim() || !camera.startFraming?.trim() || !camera.endFraming?.trim() || !camera.continuityIntent?.trim()
      || !Number.isFinite(camera.zoomAmount) || camera.zoomAmount < 0 || camera.zoomAmount > maxZoom
      || scene.motionPlan.cameraMotion.normalizedDisplacement < 0 || scene.motionPlan.cameraMotion.normalizedDisplacement > 1
      || (camera.type === 'static' && (camera.normalizedDisplacement !== 0 || camera.zoomAmount !== 0))) throw new Error(`Invalid camera motion for scene ${scene.sceneIndex}`);
    for (const vector of scene.motionPlan.motionVectors) {
      let point = vector.initialPosition?.normalizedPoint;
      if (point && vector.coordinatePrecision !== 'reliable') {
        vector.initialPosition.normalizedPoint = null;
        point = null;
      }
      if (!vector.subject?.trim() || !vector.initialPosition?.description?.trim() || !vector.direction?.trim()
        || !vector.intendedFinalPosition?.trim() || !['high', 'medium', 'low', 'uncertain'].includes(vector.geometryConfidence)
        || !['reliable', 'approximate', 'unavailable'].includes(vector.coordinatePrecision)
        || (point && (point.x < 0 || point.x > 1 || point.y < 0 || point.y > 1))
        || (point && vector.coordinatePrecision !== 'reliable') || (!point && vector.coordinatePrecision === 'reliable')
        || !Number.isFinite(vector.normalizedDisplacement) || vector.normalizedDisplacement < 0 || vector.normalizedDisplacement > 1
        || vector.startTimeSeconds < 0 || vector.endTimeSeconds <= vector.startTimeSeconds || vector.endTimeSeconds > original.durationSeconds
        || !['hold', 'constant', 'ease_in', 'ease_out', 'ease_in_out', 'irregular'].includes(vector.speedProfile)) throw new Error(`Invalid motion vector for scene ${scene.sceneIndex}`);
    }
    if (scene.videoMode === 'image_to_video') {
      scene.lastFrame.required = false;
      scene.lastFrame.imagePath = null;
      scene.executionStatus = 'planned_single_image';
      if (scene.lastFrame.required || scene.lastFrame.imagePath !== null || scene.executionStatus !== 'planned_single_image') throw new Error('Image-to-video direction must not require a last-frame asset');
    } else if (scene.videoMode === 'first_last_frame') {
      if (!scene.lastFrame.required || scene.lastFrame.imagePath !== null || !scene.lastFrame.description?.trim()
        || !scene.lastFrame.compositionRequirements?.length || !scene.lastFrame.consistencyElements?.length
        || !scene.lastFrame.generationBrief?.trim() || scene.executionStatus !== 'requires_last_frame') {
        throw new Error('First-last-frame direction must clearly mark its missing final image asset');
      }
    } else throw new Error(`Unsupported planned video mode: ${scene.videoMode}`);
    scene.startImagePath = resultImagePath;
    scene.legacyVideoPrompt = original.videoPrompt;
    if (audioDirection === 'on') {
      const audio = scene.sceneAudio;
      if (!audio || !['dialogue', 'narration', 'none'].includes(audio.spokenKind)
        || typeof audio.spokenText !== 'string'
        || (noDialogueNarration && (audio.spokenKind !== 'none' || audio.spokenText.trim()))
        || typeof audio.intentionalSilence !== 'boolean'
        || !Array.isArray(audio.soundEvents) || !audio.ambientTexture?.trim()
        || !audio.continuityFromPrevious?.trim() || !audio.continuityToNext?.trim()
        || (audio.intentionalSilence && !audio.silenceReason?.trim())) {
        throw new Error(`Invalid audio direction for scene ${scene.sceneIndex}`);
      }
      for (const event of audio.soundEvents) {
        if (!event.description?.trim() || !Number.isFinite(event.startSeconds) || !Number.isFinite(event.endSeconds)
          || event.startSeconds < 0 || event.endSeconds <= event.startSeconds || event.endSeconds > original.durationSeconds) {
          throw new Error(`Audio event outside scene ${scene.sceneIndex} duration`);
        }
      }
    } else if (Object.hasOwn(scene, 'sceneAudio') || Object.hasOwn(direction, 'audioDirection')) {
      throw new Error('Audio fields must be omitted when audio direction is off');
    }
    scene.finalVideoPrompt = buildGrokVideoPrompt({
      visualPrompt: scene.videoPrompt,
      cameraMotion: camera,
      sceneAudio: scene.sceneAudio,
      audioDirection,
      noDialogueNarration,
      maxZoom,
    });
  }
  if (audioDirection === 'on' && (!direction.audioDirection?.overallConcept?.trim()
    || !Array.isArray(direction.audioDirection.recurringMotifs)
    || direction.audioDirection.voicePolicy !== (noDialogueNarration ? 'no_spoken_audio' : 'spoken_audio_allowed')
    || !direction.audioDirection.musicPolicy?.trim() || !direction.audioDirection.continuityStrategy?.trim())) {
    throw new Error('Invalid iteration audio direction');
  }
  for (const [index, item] of direction.sceneTransitions.entries()) {
    if (item.fromSceneIndex !== expectedScenes[index].index || item.toSceneIndex !== expectedScenes[index + 1].index
      || !Array.isArray(item.recurringElements) || !item.motionDirectionAcrossCut?.trim() || !item.intendedTransition?.trim()
      || !Array.isArray(item.potentialDiscontinuities)) throw new Error(`Invalid scene transition ${index + 1}`);
    if (!['continue', 'contrast', 'reset', 'independent'].includes(item.cameraRelationship)
      || !item.previousCameraMotion?.trim() || !item.nextCameraMotion?.trim() || !item.cameraReason?.trim()) {
      throw new Error(`Invalid camera continuity at transition ${index + 1}`);
    }
  }
  return direction;
}

export function buildGrokVideoPrompt({ visualPrompt, cameraMotion, sceneAudio, audioDirection = 'off', noDialogueNarration = false, maxZoom = 0.08 }) {
  if (!visualPrompt?.trim() || !cameraMotion) throw new Error('A visual prompt and camera plan are required');
  const zoomPercent = Math.round(cameraMotion.zoomAmount * 100);
  const camera = cameraMotion.type === 'static'
    ? `CAMERA:\nLocked ${cameraMotion.startFraming} framing; no camera movement or zoom. Preserve the full composition.`
    : `CAMERA:\n${cameraMotion.description} Move ${cameraMotion.type} ${cameraMotion.direction}; framing shifts from ${cameraMotion.startFraming} to ${cameraMotion.endFraming}. Keep the move continuous and restrained. Zoom/crop change is limited to ${zoomPercent}% (configured maximum ${Math.round(maxZoom * 100)}%); preserve principal figures and the overall composition.`;
  const silenceInstruction = sceneAudio?.intentionalSilence
    ? `Intentional silence cue: ${sceneAudio.silenceReason}`
    : '';
  const soundInstruction = sceneAudio
    ? `${sceneAudio.ambientTexture}${sceneAudio.soundEvents.length ? ` Sound events: ${sceneAudio.soundEvents.map((event) => `${event.startSeconds.toFixed(1)}–${event.endSeconds.toFixed(1)}s: ${event.description}`).join('; ')}.` : 'No discrete sound event.'} ${sceneAudio.continuityFromPrevious} ${sceneAudio.continuityToNext}`
    : '';
  const audioInstruction = [silenceInstruction, soundInstruction,
    sceneAudio?.intentionalSilence && sceneAudio.soundEvents.length
      ? 'Both silence and sound cues are intentional; preserve this tension and interpret it in context.'
      : ''].filter(Boolean).join(' ');
  const spokenInstruction = noDialogueNarration
    ? 'No narration or spoken dialogue.'
    : sceneAudio?.spokenKind && (sceneAudio.spokenKind !== 'none' || sceneAudio.spokenText?.trim())
      ? `Spoken audio cue: ${sceneAudio.spokenKind}; exact words: "${sceneAudio.spokenText}".`
      : 'No spoken audio is planned for this scene.';
  const audio = audioDirection === 'on'
    ? `\n\nAUDIO:\nGenerate synchronized sound with this video. ${audioInstruction} ${spokenInstruction}`
    : '';
  return `VISUAL MOTION:\n${visualPrompt.trim()}\n\n${camera}${audio}`;
}
