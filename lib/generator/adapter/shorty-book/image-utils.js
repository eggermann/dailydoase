import promptCreator from '../../../prompt-creator.js';

export const buildImagePrompt = async (streams, options, promptSource = null) => {
  let prompt = typeof promptSource === 'string' && promptSource.trim().length > 0
    ? promptSource
    : await promptCreator.default(streams, options);

  if (options?.prompts?.create) {
    prompt = await options.prompts.create(prompt);
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
    Object.assign(merged, actorOpts);
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
