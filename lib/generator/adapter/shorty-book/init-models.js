import path from 'path';

import AiqtechNSFW from '../../text-image/aiqtech-NSFW-Real/textImage.js';
import ImageActorInScene from '../../image-image/imageActorInScene.js';
import FLUX from '../../post-to-FLUX.js';
import { PostToWan22_FirstLastFrame } from '../../image-video/wan22/firstLastFrame.js';
import { PostToWan22_5B_ImageVideo } from '../../image-video/wan22/imageVideo.js';
import { PostToLtxDistilled_ImageVideo } from '../../image-video/ltx-distilled/imageVideo.js';
import { PostToFal_FirstLastFrame } from '../../image-video/fal/firstLastFrame.js';
import { PostToFal_ImageVideo } from '../../image-video/fal/imageVideo.js';
import { PostToRunware_FirstLastFrame } from '../../image-video/runware/firstLastFrame.js';
import { PostToRunware_ImageVideo } from '../../image-video/runware/imageVideo.js';
import { PostToMirelo_VideoSound } from '../../mireloAI/video-sound.js';
import { createLogger } from '../../logger.js';

import { resolveImageInitConfig, resolveImageModel } from './image-utils.js';

const logger = createLogger('shorty-book:init-models', { envKeys: ['GENERATOR_DEBUG', 'WAN_DEBUG'] });
import { normalizeOpeningStartMode } from './opening-start.js';

const TRUTHY_VALUES = new Set(['1', 'true', 'yes', 'on']);
const FALSY_VALUES = new Set(['0', 'false', 'no', 'off', '']);

const resolveBoolean = (value, fallback = false) => {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (TRUTHY_VALUES.has(normalized)) return true;
    if (FALSY_VALUES.has(normalized)) return false;
  }
  if (value === undefined || value === null) {
    return fallback;
  }
  return Boolean(value);
};

export const shouldInitFirstLastVideoModel = (config = {}) => !resolveBoolean(
  config?.model?.forceImageToVideoOnly
    ?? config?.sceneLoop?.forceImageToVideoOnly
    ?? config?.story?.forceImageToVideoOnly,
  false
);

export const shouldInitOpeningFluxContextModel = (config = {}) => resolveBoolean(
  config?.sceneLoop?.openingImage?.enabled,
  false
) && normalizeOpeningStartMode(config?.sceneLoop?.openingImage?.mode) === 'fluxContext';

export const shouldInitPersonaReferenceImageModel = (config = {}) => resolveBoolean(
  config?.sceneLoop?.openingImage?.usePersonaReferenceForFreshImages,
  false
);

const VIDEO_MODEL_TYPE_ALIASES = {
  wan: 'wanSingleImage',
  wanSingle: 'wanSingleImage',
  wanSingleImage: 'wanSingleImage',
  ltx: 'ltxImageToVideo',
  ltxImageToVideo: 'ltxImageToVideo',
  ltxDistilled: 'ltxImageToVideo',
  falImageToVideo: 'falImageToVideo',
  runwareImageToVideo: 'runwareImageToVideo',
  wanFirstLast: 'wanFirstLast',
  falFirstLast: 'falFirstLast',
  runwareFirstLast: 'runwareFirstLast',
};

export const normalizeVideoModelType = (value, fallback = 'wanSingleImage') => {
  const normalized = String(value || '').trim();
  if (!normalized) {
    return fallback;
  }

  return VIDEO_MODEL_TYPE_ALIASES[normalized] || fallback;
};

export const resolveVideoModelClass = (type, fallback = 'wanSingleImage') => {
  const resolvedType = normalizeVideoModelType(type, fallback);
  const modelTypes = {
    wanFirstLast: PostToWan22_FirstLastFrame,
    wanSingleImage: PostToWan22_5B_ImageVideo,
    ltxImageToVideo: PostToLtxDistilled_ImageVideo,
    falFirstLast: PostToFal_FirstLastFrame,
    falImageToVideo: PostToFal_ImageVideo,
    runwareFirstLast: PostToRunware_FirstLastFrame,
    runwareImageToVideo: PostToRunware_ImageVideo,
  };

  return {
    type: resolvedType,
    ModelClass: modelTypes[resolvedType] || modelTypes[fallback] || PostToWan22_5B_ImageVideo,
  };
};

export const resolveFirstLastVideoModelType = (config = {}) => normalizeVideoModelType(
  config?.video?.model?.type,
  'wanFirstLast'
);

const createLazyFallbackVideoModel = ({ type, config = {}, defaultType = '' } = {}) => {
  const resolved = resolveVideoModelClass(type, defaultType || type || 'wanSingleImage');
  let instance = null;
  let initPromise = null;
  let imageDir = '';

  const ensureInstance = async () => {
    if (instance) {
      if (imageDir) {
        instance.imageDir = imageDir;
      }
      return instance;
    }
    if (!initPromise) {
      initPromise = (async () => {
        const created = await new resolved.ModelClass({
          ...config,
          skipCollectionCounter: true,
        }).init();
        if (imageDir) {
          created.imageDir = imageDir;
        }
        instance = created;
        return created;
      })();
    }
    return initPromise;
  };

  return {
    config: {
      ...config,
      type: resolved.type,
    },
    get _cli() {
      return instance?._cli || { lazy: true };
    },
    get imageDir() {
      return instance?.imageDir || imageDir;
    },
    set imageDir(value) {
      imageDir = value;
      if (instance) {
        instance.imageDir = value;
      }
    },
    async prompt(...args) {
      const model = await ensureInstance();
      return model.prompt(...args);
    },
  };
};

const describeVideoModelCandidate = (model = {}) => (
  model?.config?.model
  || model?.config?.space
  || model?.config?.type
  || 'unknown-video-model'
);

export const initModels = async ({ config, imageDir }) => {
  const initVideoModelWithFallbacks = async (primaryType, baseConfig = {}, defaultType = '') => {
    const { fallbacks = [], ...primaryConfig } = baseConfig || {};
    const candidates = [
      {
        type: primaryType,
        config: primaryConfig,
      },
      ...fallbacks.map((fallbackConfig) => {
        const { type = defaultType, ...fallbackModelConfig } = fallbackConfig || {};
        return {
          type,
          config: {
            ...primaryConfig,
            ...fallbackModelConfig,
          },
        };
      }),
    ];

    const initializedModels = [];
    const lazyFallbackModels = [];
    const initErrors = [];

    for (let index = 0; index < candidates.length; index += 1) {
      const candidate = candidates[index];
      const { type, ModelClass } = resolveVideoModelClass(candidate.type, defaultType || primaryType);
      try {
        initializedModels.push(await new ModelClass({
          ...candidate.config,
          skipCollectionCounter: true,
        }).init());
      } catch (error) {
        initErrors.push({
          type,
          message: String(error?.message || error),
        });
        if (index > 0) {
          lazyFallbackModels.push(createLazyFallbackVideoModel({
            type,
            config: candidate.config,
            defaultType: defaultType || primaryType,
          }));
        }
      }
    }

    if (initializedModels.length === 0) {
      const attemptedTypes = initErrors.map(({ type, message }) => `${type}: ${message}`).join(' | ');
      throw new Error(`Failed to initialize video model candidates (${attemptedTypes || defaultType || primaryType})`);
    }

    if (initErrors.length > 0) {
      logger.warn(
        `Video fallback init had recoverable errors; later fallbacks remain enabled: ${initErrors.map(({ type, message }) => `${type}: ${message}`).join(' | ')}`
      );
    }

    return {
      primaryModel: initializedModels[0] || null,
      fallbackModels: [...initializedModels.slice(1), ...lazyFallbackModels],
      initErrors,
    };
  };

  const mireloAI = await new PostToMirelo_VideoSound({
    ...(config.mireloAI ?? {}),
    skipCollectionCounter: true,
  }).init();
  const initFirstLastVideoModel = shouldInitFirstLastVideoModel(config);
  const firstLastVideoModelType = resolveFirstLastVideoModelType(config);
  const firstLastModelConfig = {
    ...(config.video?.model ?? {}),
  };
  delete firstLastModelConfig.type;
  if (!firstLastModelConfig.space && config.model?.space) {
    firstLastModelConfig.space = config.model.space;
  }
  const {
    primaryModel: videoModelFirstLast,
    fallbackModels: videoModelFirstLastFallbacks,
  } = initFirstLastVideoModel
    ? await initVideoModelWithFallbacks(firstLastVideoModelType, firstLastModelConfig, firstLastVideoModelType)
    : { primaryModel: null, fallbackModels: [] };
  const singleVideoModelType = normalizeVideoModelType(
    config.video2?.model?.type,
    'wanSingleImage'
  );
  const {
    primaryModel: videoModelSingle,
    fallbackModels: videoModelSingleFallbacks,
  } = await initVideoModelWithFallbacks(singleVideoModelType, config.video2?.model ?? {}, singleVideoModelType);

  logger.info(
    `Single-image video candidates: ${[
      videoModelSingle,
      ...videoModelSingleFallbacks,
    ].map(describeVideoModelCandidate).join(' -> ')}`
  );

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
  const personaReferenceImageModel = shouldInitPersonaReferenceImageModel(config)
    ? await ImageActorInScene.init({
      ...(config?.sceneLoop?.openingImage?.personaReferenceModel || {}),
      skipCollectionCounter: true,
    })
    : null;
  const openingFluxContextModel = shouldInitOpeningFluxContextModel(config)
    ? await ImageActorInScene.init({
      ...(config?.sceneLoop?.openingImage?.model || {}),
      skipCollectionCounter: true,
    })
    : null;
  const driftCorrectionEnabled = resolveBoolean(config?.driftCorrection?.enabled, false);
  const driftCorrectionModel = driftCorrectionEnabled
    ? await ImageActorInScene.init({
      ...(config?.driftCorrection?.model || {}),
      skipCollectionCounter: true,
    })
    : null;

  const partsDir = path.join(imageDir, '/parts');
  mireloAI.imageDir = partsDir;
  if (videoModelFirstLast) {
    videoModelFirstLast.imageDir = partsDir;
  }
  videoModelSingle.imageDir = partsDir;
  flux.imageDir = partsDir;
  if (personaReferenceImageModel) {
    personaReferenceImageModel.imageDir = partsDir;
  }
  if (openingFluxContextModel) {
    openingFluxContextModel.imageDir = partsDir;
  }
  if (driftCorrectionModel) {
    driftCorrectionModel.imageDir = partsDir;
  }
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
    personaReferenceImageModel,
    openingFluxContextModel,
    driftCorrectionModel,
  };
};
