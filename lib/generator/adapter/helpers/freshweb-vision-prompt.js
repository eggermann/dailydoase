import { compactScenePrompt } from './scene-generator.js';
import { normalizeVisionText, summarizeVisionAnchor } from './frame-vision.js';

export const DEFAULT_FRESHWEB_VISION_PROMPT = 'Describe only the visible shot: subject, setting, framing, lighting, and what should stay consistent for the next video shot.';

export const resolveFreshwebVisionPrompt = (...values) => {
  const match = values.find((value) => typeof value === 'string' && value.trim().length > 0);
  return match || DEFAULT_FRESHWEB_VISION_PROMPT;
};

export const resolveFreshwebVisionProviders = (...values) => values
  .find((value) => typeof value === 'string')
  ?.split(',')
  .map((value) => value.trim())
  .filter(Boolean) || [];

export const buildVisionAwarePrompt = ({
  basePrompt,
  startVision,
  endVision,
  useSingleImage = false,
  anchorBuilder = summarizeVisionAnchor,
} = {}) => {
  const prompt = normalizeVisionText(basePrompt);
  const toAnchor = typeof anchorBuilder === 'function' ? anchorBuilder : summarizeVisionAnchor;
  const startAnchor = toAnchor(startVision);
  const endAnchor = toAnchor(endVision);

  if (!prompt) {
    return compactScenePrompt([startAnchor, endAnchor].filter(Boolean).join(' '));
  }

  const additions = [];
  if (startAnchor) {
    additions.push(`Keep the visible start frame grounded in ${startAnchor}.`);
  }
  if (!useSingleImage && endAnchor) {
    additions.push(`Arrive in a scene that clearly reads as ${endAnchor}.`);
  }

  if (additions.length === 0) {
    return compactScenePrompt(prompt);
  }

  return compactScenePrompt(`${prompt} ${additions.join(' ')}`);
};

export default {
  DEFAULT_FRESHWEB_VISION_PROMPT,
  resolveFreshwebVisionPrompt,
  resolveFreshwebVisionProviders,
  buildVisionAwarePrompt,
};
