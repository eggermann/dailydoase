import { createVisionHelper } from './vision-model.js';

const ANSI = {
  reset: '\x1b[0m',
  yellow: '\x1b[33m',
};

export const normalizeVisionText = (value) => String(value ?? '')
  .replace(/^#+\s*/gm, '')
  .replace(/\*\*/g, '')
  .replace(/^\s*[-*]\s*/gm, '')
  .replace(/\s+/g, ' ')
  .trim();

export const createFrameVisionHelper = (options = {}) => {
  const {
    enabled = true,
    prompt,
    providers = [],
    logPrefix = 'frame-vision',
  } = options;

  const visionHelper = createVisionHelper({
    ...(prompt ? { prompt } : {}),
    ...(providers.length > 0 ? { providers } : {}),
  });
  const visionCache = new Map();
  let visionAvailable = enabled;
  let hasLoggedVisionDisable = false;

  return async function getFrameVision(frame, overrides = {}) {
    if (!visionAvailable || !frame?.image?.path) {
      return '';
    }

    const imagePath = frame.image.path;
    if (visionCache.has(imagePath)) {
      return visionCache.get(imagePath);
    }

    try {
      const result = await visionHelper({
        imagePath,
        ...(overrides.prompt ? { prompt: overrides.prompt } : {}),
      });
      const outputText = normalizeVisionText(result?.outputText);
      visionCache.set(imagePath, outputText);
      return outputText;
    } catch (error) {
      visionAvailable = false;
      if (!hasLoggedVisionDisable) {
        hasLoggedVisionDisable = true;
        console.log('');
        console.log(`${ANSI.yellow}[${logPrefix}] vision disabled${ANSI.reset}`);
        console.log(`  reason: ${error.message}`);
        console.log('');
      }
      return '';
    }
  };
};

export default {
  createFrameVisionHelper,
  normalizeVisionText,
};
