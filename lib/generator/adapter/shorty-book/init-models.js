import path from 'path';

import AiqtechNSFW from '../../text-image/aiqtech-NSFW-Real/textImage.js';
import ImageActorInScene from '../../image-image/imageActorInScene.js';
import FLUX from '../../post-to-FLUX.js';
import { PostToWan22_FirstLastFrame } from '../../image-video/wan22/firstLastFrame.js';
import { PostToWan22_5B_ImageVideo } from '../../image-video/wan22/imageVideo.js';
import { PostToFal_FirstLastFrame } from '../../image-video/fal/firstLastFrame.js';
import { PostToFal_ImageVideo } from '../../image-video/fal/imageVideo.js';
import { PostToRunware_FirstLastFrame } from '../../image-video/runware/firstLastFrame.js';
import { PostToRunware_ImageVideo } from '../../image-video/runware/imageVideo.js';
import { PostToMirelo_VideoSound } from '../../mireloAI/video-sound.js';

import { resolveImageInitConfig, resolveImageModel } from './image-utils.js';

export const initModels = async ({ config, imageDir }) => {
  const FALLBACK_MODEL_TYPES = {
    wanFirstLast: PostToWan22_FirstLastFrame,
    wanSingleImage: PostToWan22_5B_ImageVideo,
    falFirstLast: PostToFal_FirstLastFrame,
    falImageToVideo: PostToFal_ImageVideo,
    runwareFirstLast: PostToRunware_FirstLastFrame,
    runwareImageToVideo: PostToRunware_ImageVideo,
  };

  const initVideoModelWithFallbacks = async (ModelClass, baseConfig = {}, defaultType = '') => {
    const { fallbacks = [], ...primaryConfig } = baseConfig || {};
    const primaryModel = await new ModelClass({
      ...primaryConfig,
      skipCollectionCounter: true,
    }).init();
    const fallbackModels = [];
    for (const fallbackConfig of fallbacks) {
      const { type = defaultType, ...fallbackModelConfig } = fallbackConfig || {};
      const FallbackModelClass = FALLBACK_MODEL_TYPES[type] || ModelClass;
      fallbackModels.push(await new FallbackModelClass({
        ...primaryConfig,
        ...fallbackModelConfig,
        skipCollectionCounter: true,
      }).init());
    }
    return { primaryModel, fallbackModels };
  };

  const mireloAI = await new PostToMirelo_VideoSound({
    ...(config.mireloAI ?? {}),
    skipCollectionCounter: true,
  }).init();
  const firstLastModelConfig = {
    ...(config.video?.model ?? {}),
  };
  if (!firstLastModelConfig.space && config.model?.space) {
    firstLastModelConfig.space = config.model.space;
  }
  const {
    primaryModel: videoModelFirstLast,
    fallbackModels: videoModelFirstLastFallbacks,
  } = await initVideoModelWithFallbacks(PostToWan22_FirstLastFrame, firstLastModelConfig, 'wanFirstLast');
  const {
    primaryModel: videoModelSingle,
    fallbackModels: videoModelSingleFallbacks,
  } = await initVideoModelWithFallbacks(PostToWan22_5B_ImageVideo, config.video2?.model ?? {}, 'wanSingleImage');

  const imageModel = resolveImageModel(config.image?.type, {
    aiqtech: AiqtechNSFW,
    imageActorInScene: ImageActorInScene,
    flux: FLUX,
  });
  const imageInitConfig = {
    ...(resolveImageInitConfig(config.image) || {}),
    skipCollectionCounter: true,
  };
  const flux = await imageModel.init(imageInitConfig);

  const partsDir = path.join(imageDir, '/parts');
  mireloAI.imageDir = partsDir;
  videoModelFirstLast.imageDir = partsDir;
  videoModelSingle.imageDir = partsDir;
  flux.imageDir = partsDir;
  for (const model of videoModelFirstLastFallbacks) {
    model.imageDir = partsDir;
  }
  for (const model of videoModelSingleFallbacks) {
    model.imageDir = partsDir;
  }

  return {
    mireloAI,
    videoModelFirstLast,
    videoModelFirstLastFallbacks,
    videoModelSingle,
    videoModelSingleFallbacks,
    flux,
  };
};
