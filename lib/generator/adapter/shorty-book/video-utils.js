import { extractLastFrame } from '../../ffmpeg-helpers.js';

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

  if (useSingleImage) {
    videoType = videoModelSingle;
    videoPrompt = options.video2.prompts || {};
    videoModel = options.video2;

    if (videoPrompt.create) {
      generatedPrompt = await videoPrompt.create(startFrame.json.metadata.prompt);
    }
  } else {
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
  console.log('\x1b[35m%s\x1b[0m', `video prompt: ${generatedPrompt}`);
  const mergedConfig = { ...config, ...(videoModel.model || {}) };
  const totalPrompt = addStaticPrompt(generatedPrompt, videoModel.staticPrompt);

  mergedConfig.prompt = totalPrompt ?? (options.useImagePrompt
    ? startFrame.json.metadata.prompt
    : '');

  console.log('GenImgVideo final video prompt:', mergedConfig.prompt);
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

  console.log('\x1b[33m%s\x1b[0m', 'VideoCallback data --> :', data);
  return data;
};
