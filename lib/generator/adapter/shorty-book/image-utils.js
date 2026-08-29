import promptCreator from '../../../prompt-creator.js';

const getScenePlanEntry = (options = {}) => {
  const scenePlan = options?.sceneLoop?.scenePlan;
  const sceneIndex = Number(options?.sceneContext?.index || 0);
  if (!Array.isArray(scenePlan) || sceneIndex < 1) {
    return null;
  }
  return scenePlan[sceneIndex - 1] || null;
};

export const buildImagePrompt = async (streams, options, promptSource = null) => {
  const scenePlanEntry = getScenePlanEntry(options);
  let prompt = typeof promptSource === 'string' && promptSource.trim().length > 0
    ? promptSource
    : scenePlanEntry?.stillPrompt
      || scenePlanEntry?.imageDescription
      || await promptCreator.default(streams, options);

  if (options?.prompts?.create) {
    prompt = await options.prompts.create(prompt, options.sceneContext, scenePlanEntry);
  }

  return prompt;
};

export const mergeImageConfig = (baseConfig, options) => {
  const merged = { ...baseConfig, ...options };

  if (baseConfig.image?.type === 'imageActorInScene') {
    const m = baseConfig.image.model || {};
    const actorOpts = {
      imagePath: m.imagePath,
      guidance_scale: m.guidance_scale,
      num_inference_steps: m.num_inference_steps,
      seed: m.seed,
      width: m.width,
      height: m.height,
      negative_prompt: m.negative_prompt,
      model: m.model,
    };
    // Runtime scene options own their image path. A model config may provide
    // defaults, but an absent model imagePath must never erase the fresh room
    // frame selected for a creative cut.
    Object.entries(actorOpts).forEach(([key, value]) => {
      if (merged[key] === undefined && value !== undefined) {
        merged[key] = value;
      }
    });
  }

  return merged;
};

export const resolveImageModel = (imgType, models) => {
  if (imgType === 'aiqtech-NSFW-Real') return models.aiqtech;
  if (imgType === 'imageActorInScene') return models.imageActorInScene;
  return models.flux;
};

export const resolveImageInitConfig = (imageConfig) => {
  if (!imageConfig) return imageConfig;
  return imageConfig.model ? imageConfig.model : imageConfig;
};
