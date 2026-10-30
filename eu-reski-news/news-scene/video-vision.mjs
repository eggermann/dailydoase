const stringList = { type: 'array', items: { type: 'string' } };
const object = (properties) => ({
  type: 'object',
  additionalProperties: false,
  required: Object.keys(properties),
  properties,
});

export const videoVisionPromptVersion = 'eu-reski-video-vision-v1';

export function buildVideoVisionRequest({ record, images, model }) {
  const imageScenes = images.map(({ sceneIndex, path, sha256 }) => {
    const scene = record.plan.scenes[sceneIndex - 1];
    return {
      sceneIndex,
      imagePath: path,
      imageSha256: sha256,
      sceneDescription: scene.storyBeat,
      action: scene.protagonistAction,
      dramaticFunction: scene.dramaticFunction || null,
      visualControls: scene.visualStyleOptions || record.visualStyleOptions || null,
    };
  });
  const content = [{
    type: 'text',
    text: JSON.stringify({
      storyPremise: record.plan.storyPremise,
      storyArc: record.plan.storyArc || null,
      clouReveal: record.plan.clouReveal || null,
      scenes: imageScenes,
    }),
  }];
  for (const image of images) {
    content.push({ type: 'text', text: `Actual generated start image for scene ${image.sceneIndex}. Observe this image, not an imagined version of its prompt.` });
    content.push({ type: 'image_url', image_url: { url: image.dataUrl, detail: 'high' } });
  }
  const reasoningModel = /^gpt-6(?:\.1-sol|-luna)(?:-|$)/.test(model);
  return {
    model,
    ...(reasoningModel
      ? { reasoning_effort: model.startsWith('gpt-6-luna') ? 'medium' : 'high' }
      : { temperature: 0.2 }),
    max_completion_tokens: Math.max(5000, images.length * 1200),
    messages: [
      { role: 'system', content: [
        'You are a visual observer reviewing actual generated EU-RESKI start images for a later film-planning step.',
        'Inspect only the supplied image pixels. Separate directly visible observations from interpretations and uncertainty.',
        'Do not claim to see details that are unclear. Use qualitative uncertainty only; do not invent calibrated numeric confidence.',
        'Describe visible figures, objects, symbolic motifs, foreground/background relationships, apparent depth, overlap, movable elements, composition risks, and whether the supplied intended clou is already visible.',
        'Do not propose a new story, change the locked plan, or modify any image.',
      ].join('\n') },
      { role: 'user', content },
    ],
    response_format: { type: 'json_schema', json_schema: {
      name: 'eu_news_video_vision',
      strict: true,
      schema: {
        ...object({ scenes: {
          type: 'array', minItems: images.length, maxItems: images.length,
          items: object({
            sceneIndex: { type: 'integer', minimum: 1, maximum: record.plan.scenes.length },
            observations: object({
              observed: object({
                visibleProtagonist: { type: 'string' },
                visibleFigures: stringList,
                visibleObjects: stringList,
                visibleMotifs: stringList,
                spatialRelationships: stringList,
                apparentDepth: { type: 'string' },
                overlappingForms: stringList,
              }),
              interpreted: stringList,
              uncertain: stringList,
            }),
            motionCandidates: {
              type: 'array',
              items: object({ subject: { type: 'string' }, motion: { type: 'string' }, risk: { type: 'string', enum: ['low', 'medium', 'high'] } }),
            },
            preservationRisks: stringList,
            clouAssessment: object({ alreadyVisible: { type: 'boolean' }, confidence: { type: 'string', enum: ['low', 'medium', 'high', 'uncertain'] }, reason: { type: 'string' } }),
          }),
        } }),
      },
    } },
  };
}

export function validateVideoVisionResponse(response, { sceneIndices }) {
  const choice = response.choices?.[0];
  if (choice?.message?.refusal) throw new Error(`Video vision refusal: ${choice.message.refusal}`);
  if (choice?.finish_reason !== 'stop') throw new Error('GPT did not return complete video vision observations');
  const result = JSON.parse(choice.message.content);
  if (!Array.isArray(result.scenes) || result.scenes.length !== sceneIndices.length) throw new Error('Video vision must return one observation per supplied image');
  for (const [index, scene] of result.scenes.entries()) {
    if (scene.sceneIndex !== sceneIndices[index]) throw new Error('Video vision changed image-to-scene order');
    if (!scene.observations || !scene.observations.observed || !Array.isArray(scene.observations.interpreted)
      || !Array.isArray(scene.observations.uncertain) || !Array.isArray(scene.motionCandidates) || !Array.isArray(scene.preservationRisks)
      || typeof scene.clouAssessment?.alreadyVisible !== 'boolean'
      || !['low', 'medium', 'high', 'uncertain'].includes(scene.clouAssessment.confidence)) {
      throw new Error(`Invalid video vision observations for scene ${scene.sceneIndex}`);
    }
  }
  return result;
}
