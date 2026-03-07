import path from 'path';

import AiqtechNSFW from '../../text-image/aiqtech-NSFW-Real/textImage.js';
import ImageActorInScene from '../../image-image/imageActorInScene.js';
import FLUX from '../../post-to-FLUX.js';
import { PostToWan22_FirstLastFrame } from '../../image-video/wan22/firstLastFrame.js';
import { PostToWan22_5B_ImageVideo } from '../../image-video/wan22/imageVideo.js';
import { PostToMirelo_VideoSound } from '../../mireloAI/video-sound.js';

import { resolveImageInitConfig, resolveImageModel } from './image-utils.js';

export const initModels = async ({ config, imageDir }) => {
  const mireloAI = await new PostToMirelo_VideoSound().init({
    ...(config.mireloAI ?? {}),
    skipCollectionCounter: true,
  });
  const firstLastModelConfig = {
    ...(config.video?.model ?? {}),
    skipCollectionCounter: true,
  };
  if (!firstLastModelConfig.space && config.model?.space) {
    firstLastModelConfig.space = config.model.space;
  }
  const videoModelFirstLast = await new PostToWan22_FirstLastFrame().init(firstLastModelConfig);
  const videoModelSingle = await new PostToWan22_5B_ImageVideo().init({
    ...((config.video2?.model) ?? {}),
    skipCollectionCounter: true,
  });

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

  return { mireloAI, videoModelFirstLast, videoModelSingle, flux };
};
