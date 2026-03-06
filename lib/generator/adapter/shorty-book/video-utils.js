import { extractLastFrame } from '../../ffmpeg-helpers.js';
import { createLogger } from '../../logger.js';

const logger = createLogger('shorty-book:video', { envKeys: ['WAN_DEBUG', 'GENERATOR_DEBUG'] });

export const prepareVideoGeneration = async ({
  startFrame,
  streams,
  options,
  fileName,
  useSingleImage,
  imageOptions,
  videoModelFirstLast,
  videoModelSingle,
  generateImage,
}) => {
  let videoType = videoModelFirstLast;
  let videoPrompt = options.video.prompts || {};
  let videoModel = options.video;
  let generatedPrompt = '';
  let lastEndFrame = null;

  const firstLastUnavailable = !videoModelFirstLast || !videoModelFirstLast._cli;
  const shouldUseSingleImage = useSingleImage || firstLastUnavailable;
  if (firstLastUnavailable && !useSingleImage) {
    logger.warn('FirstLast WAN model unavailable, falling back to single-image WAN model.');
  }

  if (shouldUseSingleImage) {
    logger.info('Using single-image WAN model (PostToWan22_5B_ImageVideo).');
    videoType = videoModelSingle;
    videoPrompt = options.video2.prompts || {};
    videoModel = options.video2;

    if (videoPrompt.create) {
      generatedPrompt = await videoPrompt.create(startFrame.json.metadata.prompt);
    }
  } else {
    logger.info('Using first-last WAN model (PostToWan22_FirstLastFrame).');
    options.name = `${fileName}-end`;

    lastEndFrame = await generateImage(streams, imageOptions);
    options.endImageStream = lastEndFrame.image.path;

    if (videoPrompt.create) {
      generatedPrompt = await videoPrompt.create(
        startFrame.json.metadata.prompt,
        lastEndFrame.json.metadata.prompt
      );
    }
  }

  return { videoType, videoModel, generatedPrompt, lastEndFrame };
};

export const buildVideoConfig = ({
  config,
  addStaticPrompt,
  generatedPrompt,
  videoModel,
  startFrame,
  options,
}) => {
  logger.payload('video prompt', generatedPrompt);
  const mergedConfig = { ...config, ...(videoModel.model || {}) };
  const totalPrompt = addStaticPrompt(generatedPrompt, videoModel.staticPrompt);

  mergedConfig.prompt = totalPrompt ?? (options.useImagePrompt
    ? startFrame.json.metadata.prompt
    : '');

  logger.payload('final video prompt', mergedConfig.prompt);
  return mergedConfig;
};

export const createRepeatVideoGeneration = ({
  videoType,
  startFrame,
  mergedConfig,
  useSingleImage,
  setLastEndFrame,
}) => async () => {
  const data = await videoType.prompt(startFrame.image.path, mergedConfig);

  if (!useSingleImage) {
    const lastPngPath = data.file.replace(/\.mp4$/, '-last-frame.png');
    await extractLastFrame(data.file, lastPngPath);

    setLastEndFrame({
      image: { path: lastPngPath },
      json: startFrame.json,
    });
  }

  logger.payload('video callback data', data);
  return data;
};
