import { extractLastFrame } from '../../ffmpeg-helpers.js';
import { createLogger } from '../../logger.js';

const logger = createLogger('shorty-book:video', { envKeys: ['WAN_DEBUG', 'GENERATOR_DEBUG'] });
const ANSI = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  cyan: '\x1b[36m',
  blue: '\x1b[34m',
  green: '\x1b[32m',
};

const wrapLogText = (value, width = 96, indent = '  ') => {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return '';

  const words = text.split(' ');
  const lines = [];
  let line = '';

  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > width && line) {
      lines.push(`${indent}${line}`);
      line = word;
    } else {
      line = next;
    }
  }

  if (line) {
    lines.push(`${indent}${line}`);
  }

  return lines.join('\n');
};

const formatSceneLabel = (sceneContext = {}) => {
  const index = Number(sceneContext?.index) || 1;
  const total = Number(sceneContext?.total) || index;
  return `Scene ${index}/${total}`;
};

const formatSceneDuration = (sceneContext = {}) => {
  const duration = Number(sceneContext?.durationSeconds);
  if (!Number.isFinite(duration) || duration <= 0) {
    return '';
  }
  return ` => ${duration}s`;
};

const formatFrameSource = (sceneContext = {}) => {
  const frameSource = String(sceneContext?.frameSource || '').trim();
  if (!frameSource) {
    return '';
  }
  if (frameSource === 'cameraShot') {
    return 'webcam-shot';
  }
  return frameSource === 'newImage' ? 'new-image' : 'last-frame';
};

const logSceneStart = (sceneContext, modeLabel) => {
  const label = `${formatSceneLabel(sceneContext)}${formatSceneDuration(sceneContext)}`;
  console.log('');
  console.log(`${ANSI.bold}${ANSI.cyan}[shorty-book:video] ${label}${ANSI.reset}`);
  console.log(`${ANSI.blue}  mode:${ANSI.reset} ${modeLabel}`);
  const frameSource = formatFrameSource(sceneContext);
  if (frameSource) {
    console.log(`${ANSI.blue}  image source:${ANSI.reset} ${frameSource}`);
  }
};

const logScenePrompt = (sceneContext, prompt) => {
  const label = formatSceneLabel(sceneContext);
  console.log(`${ANSI.green}[shorty-book:video] ${label} prompt${ANSI.reset}`);
  console.log(wrapLogText(prompt));
  console.log('');
};

export const prepareVideoGeneration = async ({
  startFrame,
  streams,
  options,
  fileName,
  useSingleImage,
  imageOptions,
  videoModelFirstLast,
  videoModelSingle,
  videoModelFirstLastFallbacks = [],
  videoModelSingleFallbacks = [],
  generateImage,
}) => {
  const firstLastVideoOptions = options.video || {};
  const singleImageVideoOptions = options.video2 || {};
  const sceneContext = options.sceneContext || null;
  let generatedPrompt = '';
  let lastEndFrame = null;

  const firstLastUnavailable = !videoModelFirstLast || !videoModelFirstLast._cli;
  const useSingleImageMode = useSingleImage || firstLastUnavailable;
  if (firstLastUnavailable && !useSingleImage) {
    logger.warn('FirstLast WAN model unavailable, falling back to single-image WAN model.');
  }

  if (useSingleImageMode) {
    logSceneStart(sceneContext, 'single-image WAN');
    const selectedVideoGenerator = videoModelSingle;
    const selectedVideoOptions = singleImageVideoOptions;
    const selectedVideoPrompt = selectedVideoOptions.prompts || {};

    if (selectedVideoPrompt.create) {
      generatedPrompt = await selectedVideoPrompt.create(
        startFrame.json.metadata.prompt,
        sceneContext,
        {
          startFrame,
          scenePlan: options.sceneLoop?.scenePlan || null,
        }
      );
    }

    return {
      videoType: selectedVideoGenerator,
      videoTypeCandidates: [selectedVideoGenerator, ...videoModelSingleFallbacks].filter(Boolean),
      videoModel: selectedVideoOptions,
      generatedPrompt,
      lastEndFrame,
    };
  } else {
    logSceneStart(sceneContext, 'first-last WAN');
    options.name = `${fileName}-end`;

    const hasEndImage = typeof options.endImageStream === 'string' && options.endImageStream.length > 0;
    if (hasEndImage) {
      lastEndFrame = {
        image: { path: options.endImageStream },
        json: {
          metadata: {
            prompt: options.endFramePrompt ?? startFrame.json?.metadata?.prompt ?? '',
          },
        },
      };
    } else {
      lastEndFrame = await generateImage(streams, {
        ...imageOptions,
        sceneContext,
        frameRole: 'end',
      });
      options.endImageStream = lastEndFrame.image.path;
    }

    const selectedVideoGenerator = videoModelFirstLast;
    const selectedVideoOptions = firstLastVideoOptions;
    const selectedVideoPrompt = selectedVideoOptions.prompts || {};

    if (selectedVideoPrompt.create) {
      generatedPrompt = await selectedVideoPrompt.create(
        startFrame.json.metadata.prompt,
        lastEndFrame.json.metadata.prompt,
        sceneContext,
        {
          startFrame,
          endFrame: lastEndFrame,
          scenePlan: options.sceneLoop?.scenePlan || null,
        }
      );
    }

    return {
      videoType: selectedVideoGenerator,
      videoTypeCandidates: [selectedVideoGenerator, ...videoModelFirstLastFallbacks].filter(Boolean),
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
  const mergedConfig = { ...config, ...(videoModel.model || {}) };
  const totalPrompt = addStaticPrompt(generatedPrompt, videoModel.staticPrompt);

  mergedConfig.prompt = totalPrompt ?? (options.useImagePrompt
    ? startFrame.json.metadata.prompt
    : '');

  logScenePrompt(options.sceneContext, mergedConfig.prompt);
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
