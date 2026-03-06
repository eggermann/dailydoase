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
  const firstLastVideoOptions = options.video || {};
  const singleImageVideoOptions = options.video2 || {};
  let generatedPrompt = '';
  let lastEndFrame = null;

  const firstLastUnavailable = !videoModelFirstLast || !videoModelFirstLast._cli;
  const useSingleImageMode = useSingleImage || firstLastUnavailable;
  if (firstLastUnavailable && !useSingleImage) {
    logger.warn('FirstLast WAN model unavailable, falling back to single-image WAN model.');
  }

  if (useSingleImageMode) {
    logger.info('Using single-image WAN model (PostToWan22_5B_ImageVideo).');
    const selectedVideoGenerator = videoModelSingle;
    const selectedVideoOptions = singleImageVideoOptions;
    const selectedVideoPrompt = selectedVideoOptions.prompts || {};

    if (selectedVideoPrompt.create) {
      generatedPrompt = await selectedVideoPrompt.create(startFrame.json.metadata.prompt);
    }

    return {
      videoType: selectedVideoGenerator,
      videoModel: selectedVideoOptions,
      generatedPrompt,
      lastEndFrame,
    };
  } else {
    logger.info('Using first-last WAN model (PostToWan22_FirstLastFrame).');
    options.name = `${fileName}-end`;

    lastEndFrame = await generateImage(streams, imageOptions);
    options.endImageStream = lastEndFrame.image.path;

    const selectedVideoGenerator = videoModelFirstLast;
    const selectedVideoOptions = firstLastVideoOptions;
    const selectedVideoPrompt = selectedVideoOptions.prompts || {};

    if (selectedVideoPrompt.create) {
      generatedPrompt = await selectedVideoPrompt.create(
        startFrame.json.metadata.prompt,
        lastEndFrame.json.metadata.prompt
      );
    }

    return {
      videoType: selectedVideoGenerator,
      videoModel: selectedVideoOptions,
      generatedPrompt,
      lastEndFrame,
    };
  }
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
  captureLastFrame = !useSingleImage,
  endFramePrompt = null,
}) => async () => {
  const data = await videoType.prompt(startFrame.image.path, mergedConfig);

  if (captureLastFrame) {
    const lastPngPath = data.file.replace(/\.mp4$/, '-last-frame.png');
    await extractLastFrame(data.file, lastPngPath);

    setLastEndFrame({
      image: { path: lastPngPath },
      json: {
        ...startFrame.json,
        metadata: {
          ...(startFrame.json?.metadata || {}),
          prompt: endFramePrompt ?? mergedConfig.prompt ?? startFrame.json?.metadata?.prompt,
        },
      },
    });
  }

  logger.payload('video callback data', data);
  return data;
};
