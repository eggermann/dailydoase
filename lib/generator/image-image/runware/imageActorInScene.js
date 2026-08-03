import fs from 'fs-extra';
import path from 'path';

import PostTo from '../../PostTo.js';
import { joinOutPath } from '../../utils.js';
import {
  imagePathToDataUrl,
  resolveRunwareKey,
  saveRunwareImageResult,
  submitRunwareImageTask,
} from '../../image-video/runware/common.js';

const DEFAULT_MODEL = 'runware:106@1';
const DEFAULT_WIDTH = 1184;
const DEFAULT_HEIGHT = 880;

const isRemoteImage = (value) => /^https?:\/\//i.test(value) || /^data:image\//i.test(value);

export const resolveRunwareReferenceImage = async (value) => {
  const reference = String(value?.path || value?.url || value || '').trim();
  if (!reference) return '';
  if (isRemoteImage(reference)) return reference;
  if (!(await fs.pathExists(reference))) {
    throw new Error(`Runware reference image not found: ${reference}`);
  }
  return imagePathToDataUrl(reference);
};

export class PostToRunware_ImageActorInScene extends PostTo {
  constructor(modelConfig = {}) {
    super(modelConfig);
    this.config = modelConfig || {};
    this.config.provider = 'runware';
    this.config.model = this.config.model || DEFAULT_MODEL;
    this.config.folderName = this.config.folderName ?? 'runware-image-actor-in-scene';
    this.imageDir = joinOutPath(this.config.folderName);
    fs.ensureDirSync(this.imageDir);
  }

  async init() {
    this.runwareKey = this.config.runwareKey || resolveRunwareKey();
    if (!this.runwareKey) {
      throw new Error('Missing RUNWARE_API_KEY (or RUNWARE_KEY) for Runware image generation');
    }
    return this;
  }

  async prompt(promptText, options = {}) {
    if (!this.config.skipCollectionCounter) {
      await this.checkSignature();
    }

    const primaryImage = String(options.imagePath || '').trim();
    if (!primaryImage) {
      throw new Error('Runware imageActorInScene requires options.imagePath');
    }

    const secondaryImages = Array.isArray(options.images) ? options.images.filter(Boolean) : [];
    const references = [primaryImage, ...secondaryImages];
    const referenceImages = (await Promise.all(references.map(resolveRunwareReferenceImage))).filter(Boolean);
    const referencePaths = references.map((entry) => entry?.path || entry?.url || entry).filter(Boolean);
    const contextReference = options.contextReference && typeof options.contextReference === 'object'
      ? options.contextReference
      : null;
    const continuityPrompt = contextReference?.enabled && secondaryImages.length > 0
      ? 'Use the first image as the exact location and the later images only for protagonist identity. Produce one unified scene, never a collage, split-screen, inset, or extra frame.'
      : '';
    const prompt = [options.prompt ?? String(promptText ?? ''), continuityPrompt].filter(Boolean).join(' ').trim();
    const model = options.model || this.config.model || DEFAULT_MODEL;
    const payload = {
      model,
      prompt,
      negativePrompt: options.negative_prompt,
      width: Number(options.width) || Number(this.config.width) || DEFAULT_WIDTH,
      height: Number(options.height) || Number(this.config.height) || DEFAULT_HEIGHT,
      steps: Number(options.num_inference_steps) || Number(this.config.num_inference_steps) || 28,
      guidanceScale: Number.isFinite(Number(options.guidance_scale))
        ? Number(options.guidance_scale)
        : Number(this.config.guidance_scale) || 2.5,
      seed: Number.isFinite(Number(options.seed)) ? Number(options.seed) : this.config.seed,
      referenceImages,
    };
    const { task, result } = await submitRunwareImageTask({
      apiKey: this.runwareKey,
      ...payload,
    });
    const saved = await saveRunwareImageResult({
      imageDir: this.imageDir,
      filePrefix: `${Date.now()}-runware-image-actor-in-scene`,
      model,
      payload: task,
      result,
      metadata: {
        prompt,
        inputPath: primaryImage,
        sourceInputPath: primaryImage,
        referenceImages: referencePaths.slice(1),
        contextReferenceMode: contextReference?.enabled ? 'nativeMultiReference' : 'disabled',
      },
    });
    return saved;
  }
}

export default {
  init: async (config = {}) => new PostToRunware_ImageActorInScene(config).init(),
};
