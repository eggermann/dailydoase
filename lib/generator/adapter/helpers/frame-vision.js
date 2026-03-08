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

export const summarizeVisionAnchor = (value) => {
  const original = normalizeVisionText(value);
  const subjectMatch = original.match(/subject:\s*([^.;]+(?:[.;][^.;]+){0,1})/i);
  const settingMatch = original.match(/setting:\s*([^.;]+(?:[.;][^.;]+){0,1})/i);

  if (subjectMatch || settingMatch) {
    const parts = [];
    if (subjectMatch?.[1]) {
      parts.push(subjectMatch[1].trim());
    }
    if (settingMatch?.[1]) {
      parts.push(`in ${settingMatch[1].trim().replace(/^in\s+/i, '')}`);
    }
    const combined = parts.join(', ').replace(/[.:;,\s]+$/g, '').trim();
    return combined.length > 180 ? `${combined.slice(0, 177).trim()}...` : combined;
  }

  const normalized = original
    .replace(/^(?:here(?:’|')?s|here is)\s+(?:an?\s+)?(?:analysis|breakdown|description)(?:\s+of\s+the\s+visible\s+shot)?(?:\s+based\s+on\s+your\s+(?:request|image|description|provided image))?:\s*/i, '')
    .replace(/^the image (?:shows|depicts|contains)\s*/i, '')
    .replace(/^visible shot analysis:\s*/i, '')
    .replace(/^camera shot description:\s*/i, '')
    .replace(/^subject:\s*/i, '')
    .trim();

  if (!normalized) {
    return '';
  }

  const firstSentence = normalized.split(/(?<=[.!?])\s+/)[0]?.trim() || normalized;
  const compact = firstSentence.replace(/[.:;,\s]+$/g, '').trim();
  return compact.length > 180 ? `${compact.slice(0, 177).trim()}...` : compact;
};

export const createFrameVisionHelper = (options = {}) => {
  const {
    enabled = true,
    prompt,
    providers = [],
    logPrefix = 'frame-vision',
    onResult = null,
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
      if (typeof onResult === 'function') {
        await onResult({
          frame,
          imagePath,
          outputText,
          result,
          overrides,
        });
      }
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
  summarizeVisionAnchor,
};
