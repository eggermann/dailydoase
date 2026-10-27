import { createHash } from 'node:crypto';

const list = { type: 'array', items: { type: 'string' } };
const object = (properties) => ({
  type: 'object',
  additionalProperties: false,
  required: Object.keys(properties),
  properties,
});

export const audioDirectorPromptVersion = 'eu-reski-audio-director-v1';

export function audioDirectionInputHash({ record, model }) {
  return createHash('sha256').update(JSON.stringify({
    promptVersion: audioDirectorPromptVersion,
    model,
    storyPremise: record.plan.storyPremise,
    scenes: record.plan.scenes.map(({ index, title, storyBeat, protagonistAction, durationSeconds, videoPrompt }) => ({
      index, title, storyBeat, protagonistAction, durationSeconds, videoPrompt,
    })),
  })).digest('hex');
}

export function buildAudioDirectionRequest({ record, model }) {
  const scenes = record.plan.scenes.map((scene) => ({
    sceneIndex: scene.index,
    title: scene.title,
    storyBeat: scene.storyBeat,
    visibleAction: scene.protagonistAction,
    durationSeconds: scene.durationSeconds,
    timingPrompt: scene.videoPrompt,
  }));
  const sceneAudio = object({
    soundEvents: {
      type: 'array',
      items: object({
        description: { type: 'string', minLength: 1 },
        startSeconds: { type: 'number', minimum: 0 },
        endSeconds: { type: 'number', minimum: 0 },
      }),
    },
    ambientTexture: { type: 'string' },
    continuityFromPrevious: { type: 'string' },
    continuityToNext: { type: 'string' },
    intentionalSilence: { type: 'boolean' },
    silenceReason: { type: 'string' },
    spokenDialogue: { type: 'boolean', enum: [false] },
  });

  return {
    model,
    temperature: 0.45,
    max_completion_tokens: Math.max(3000, scenes.length * 600),
    messages: [
      { role: 'system', content: [
        'You are an audio director. Plan sound only for the supplied locked scenes.',
        'Do not rewrite or add visual actions. Do not direct camera, image, or video motion. Sound events must be plausible consequences of the described action; invent no unsupported event.',
        'Create one coherent audio identity across the iteration, with recurring motifs only when useful. No spoken dialogue, narration, or voices. Music is optional and need not play in every scene.',
        'For every sound event, use seconds relative to its scene. startSeconds must be before endSeconds, and both must fit the exact scene duration. Keep ambientTexture concise and concrete.',
        'Intentional silence is allowed. When intentionalSilence is true, soundEvents must be empty and silenceReason must explain the choice.',
        'Audio direction is a separate prompt for the video model. It must not alter the supplied visual prompt.',
      ].join('\n') },
      { role: 'user', content: JSON.stringify({
        storyPremise: record.plan.storyPremise,
        protagonist: record.plan.protagonist?.name || null,
        scenes,
      }) },
    ],
    response_format: { type: 'json_schema', json_schema: {
      name: 'eu_news_audio_direction', strict: true,
      schema: object({
        audioDirection: object({
          overallConcept: { type: 'string', minLength: 1 },
          recurringMotifs: list,
          voicePolicy: { type: 'string', enum: ['no_spoken_dialogue'] },
          musicPolicy: { type: 'string', minLength: 1 },
          continuityStrategy: { type: 'string', minLength: 1 },
        }),
        scenes: {
          type: 'array', minItems: scenes.length, maxItems: scenes.length,
          items: object({
            sceneIndex: { type: 'integer', minimum: 1, maximum: scenes.length },
            sceneAudio,
          }),
        },
      }),
    } },
  };
}

export function validateAudioDirectionResponse(response, { record }) {
  const choice = response.choices?.[0];
  if (choice?.message?.refusal) throw new Error(`Audio direction refusal: ${choice.message.refusal}`);
  if (choice?.finish_reason !== 'stop') throw new Error('GPT did not return complete audio direction');
  const direction = JSON.parse(choice.message.content);
  const expectedScenes = record.plan.scenes;
  const concept = direction.audioDirection;
  if (!concept?.overallConcept?.trim() || !Array.isArray(concept.recurringMotifs)
    || concept.voicePolicy !== 'no_spoken_dialogue' || !concept.musicPolicy?.trim() || !concept.continuityStrategy?.trim()
    || !Array.isArray(direction.scenes) || direction.scenes.length !== expectedScenes.length) {
    throw new Error('Invalid whole-story audio direction');
  }
  for (const [index, { sceneAudio }] of direction.scenes.entries()) {
    const original = expectedScenes[index];
    if (direction.scenes[index].sceneIndex !== original.index || !sceneAudio
      || sceneAudio.spokenDialogue !== false || typeof sceneAudio.intentionalSilence !== 'boolean'
      || !Array.isArray(sceneAudio.soundEvents) || typeof sceneAudio.ambientTexture !== 'string'
      || !sceneAudio.continuityFromPrevious?.trim() || !sceneAudio.continuityToNext?.trim()
      || (sceneAudio.intentionalSilence && (sceneAudio.soundEvents.length || !sceneAudio.silenceReason?.trim()))) {
      throw new Error(`Invalid audio direction for scene ${original.index}`);
    }
    for (const event of sceneAudio.soundEvents) {
      if (!event.description?.trim() || !Number.isFinite(event.startSeconds) || !Number.isFinite(event.endSeconds)
        || event.startSeconds < 0 || event.endSeconds <= event.startSeconds || event.endSeconds > original.durationSeconds) {
        throw new Error(`Audio event outside scene ${original.index} duration`);
      }
    }
  }
  return direction;
}

export function buildAudioPrompt(sceneAudio, audioDirection) {
  if (!sceneAudio || !audioDirection) return '';
  const instruction = sceneAudio.intentionalSilence
    ? `Use intentional silence. ${sceneAudio.silenceReason}`
    : `${sceneAudio.ambientTexture}${sceneAudio.soundEvents.length
      ? ` Sound events: ${sceneAudio.soundEvents.map((event) => `${event.startSeconds.toFixed(1)}–${event.endSeconds.toFixed(1)}s: ${event.description}`).join('; ')}.`
      : ' No discrete sound event.'} ${sceneAudio.continuityFromPrevious} ${sceneAudio.continuityToNext}`;
  return `AUDIO: Generate synchronized sound with this video. ${instruction} Overall sound identity: ${audioDirection.overallConcept}. Music policy: ${audioDirection.musicPolicy}. No spoken dialogue or narration.`;
}
