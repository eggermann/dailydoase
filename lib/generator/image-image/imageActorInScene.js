import PostTo from '../PostTo.js';
import fs from 'fs-extra';
import path from 'path';
import dotenv from 'dotenv';
import { Blob as NodeBlob } from 'node:buffer';
import { fileURLToPath } from 'url';

dotenv.config();
import { downloadToFile, saveJSON } from '../save-utils.js';
import {
  imagePathToDataUrl,
  resolveFalKey,
  submitFalJob,
} from '../image-video/fal/common.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

try {
  dotenv.config({ path: path.join(__dirname, '.env') });
} catch (_) {}

const omitUndefined = (obj = {}) =>
  Object.fromEntries(Object.entries(obj).filter(([, value]) => value !== undefined));

const DEFAULT_HF_IMAGE_EDIT_MODEL = 'Qwen/Qwen-Image-Edit-2511';
const DEFAULT_HF_PROVIDER = 'fal-ai';
const DIRECT_FAL_MODEL_ALIASES = {
  'black-forest-labs/FLUX.1-Kontext-dev': 'fal-ai/flux-kontext/dev',
  'black-forest-labs/FLUX.1-Kontext-pro': 'fal-ai/flux-kontext/pro',
  'fal-ai/flux-kontext/dev': 'fal-ai/flux-kontext/dev',
  'fal-ai/flux-kontext/pro': 'fal-ai/flux-kontext/pro',
};

const normalizeProvider = (provider) => {
  if (provider === undefined || provider === null) {
    return undefined;
  }
  const value = String(provider).trim();
  if (!value || value.toLowerCase() === 'auto') {
    return undefined;
  }
  return value;
};

let fallbackFetchPromise = null;

const loadFallbackFetch = async () => {
  if (typeof globalThis.fetch === 'function') {
    return globalThis.fetch.bind(globalThis);
  }
  if (!fallbackFetchPromise) {
    fallbackFetchPromise = import('node-fetch').then((mod) => mod.default || mod);
  }
  return fallbackFetchPromise;
};

const ensureWebRuntimeGlobals = async () => {
  if (typeof globalThis.Blob !== 'function' && typeof NodeBlob === 'function') {
    globalThis.Blob = NodeBlob;
  }
  if (typeof globalThis.fetch !== 'function') {
    try {
      globalThis.fetch = await loadFallbackFetch();
    } catch (_) {}
  }
};

const isHttpUrl = (value) => typeof value === 'string' && /^https?:\/\//i.test(value);
const isDataImageUrl = (value) => typeof value === 'string' && /^data:image\//i.test(value);

export const resolveDirectFalImageEditModel = (model) => {
  const normalized = String(model || '').trim();
  if (!normalized) {
    return '';
  }
  return DIRECT_FAL_MODEL_ALIASES[normalized] || '';
};

const collectFalImageRefs = (value, out = []) => {
  if (!value) {
    return out;
  }
  if (typeof value === 'string') {
    if (isHttpUrl(value) || isDataImageUrl(value)) {
      out.push(value);
    }
    return out;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      collectFalImageRefs(item, out);
    }
    return out;
  }
  if (typeof value === 'object') {
    if (typeof value.url === 'string') out.push(value.url);
    if (typeof value.image_url === 'string') out.push(value.image_url);
    if (typeof value.image === 'string') out.push(value.image);
    if (value.image && typeof value.image === 'object') collectFalImageRefs(value.image, out);
    if (Array.isArray(value.images)) collectFalImageRefs(value.images, out);
    if (value.output) collectFalImageRefs(value.output, out);
    if (value.data) collectFalImageRefs(value.data, out);
    if (value.result) collectFalImageRefs(value.result, out);
    if (value.response) collectFalImageRefs(value.response, out);
  }
  return out;
};

export const extractFalImageUrl = (result) => {
  const refs = collectFalImageRefs(result);
  return refs.find((entry) => isHttpUrl(entry) || isDataImageUrl(entry)) || '';
};

const dataUrlToBuffer = (value) => {
  const match = String(value || '').match(/^data:([^;,]+)?;base64,(.+)$/);
  if (!match) {
    throw new Error('Invalid data URI image response from fal.ai');
  }
  return Buffer.from(match[2], 'base64');
};

const buildFalImageEditPrompt = ({ prompt, negativePrompt } = {}) => {
  const basePrompt = String(prompt || '').trim();
  const avoidPrompt = String(negativePrompt || '').trim();
  if (!avoidPrompt) {
    return basePrompt;
  }
  return [basePrompt, `Avoid: ${avoidPrompt}.`].filter(Boolean).join(' ').trim();
};

export const buildFalImageEditPayload = async ({
  prompt,
  inputPath,
  parameters = {},
} = {}) => ({
  prompt: buildFalImageEditPrompt({
    prompt,
    negativePrompt: parameters.negative_prompt,
  }),
  image_url: await imagePathToDataUrl(inputPath),
  guidance_scale: parameters.guidance_scale ?? 2.5,
  num_inference_steps: parameters.num_inference_steps ?? 28,
  ...(parameters.seed !== undefined ? { seed: parameters.seed } : {}),
  num_images: 1,
  output_format: 'png',
  resolution_mode: 'match_input',
});

export const shouldUseDirectFalImageEdit = ({
  model,
  provider,
  falKey,
} = {}) => {
  const directModel = resolveDirectFalImageEditModel(model);
  if (!directModel || !falKey) {
    return false;
  }
  const normalizedProvider = normalizeProvider(provider);
  return normalizedProvider === 'fal-ai' || directModel === String(model || '').trim();
};

async function runHFImageToImage({ model, token, prompt, inputPath, parameters = {}, provider }) {
  await ensureWebRuntimeGlobals();
  if (!token) {
    throw new Error('Missing HF token (HF_API_TOKEN/HF_TOKEN/HF_APIKEY) for Hugging Face Inference');
  }
  if (!inputPath || !fs.existsSync(inputPath)) {
    throw new Error(`imageActorInScene requires a valid input image path. Received: ${inputPath}`);
  }

  let InferenceClient;
  let fileFromPath;
  try {
    ({ InferenceClient } = await import('@huggingface/inference'));
  } catch (_) {
    throw new Error('Hugging Face provider requires @huggingface/inference. Install: npm i @huggingface/inference');
  }
  try {
    ({ fileFromPath } = await import('formdata-node/file-from-path'));
  } catch (_) {
    throw new Error('Hugging Face image-to-image requires formdata-node. Install: npm i formdata-node');
  }

  const hf = new InferenceClient(token);
  const file = await fileFromPath(inputPath);

  let result;
  try {
    const resolvedProvider = normalizeProvider(provider);
    const args = {
      model,
      inputs: file,
      parameters: {
        prompt: String(prompt || ''),
        guidance_scale: parameters.guidance_scale ?? 2.5,
        num_inference_steps: parameters.num_inference_steps ?? 28,
        ...parameters,
      },
    };
    if (resolvedProvider) {
      args.provider = resolvedProvider;
    }
    result = await hf.imageToImage(args);
  } catch (error) {
    const msg = String(error && (error.message || error));
    if (msg.includes('Received malformed response from Fal.ai image-to-image API')) {
      throw new Error(
        `HF fal-ai imageToImage routing returned a malformed response for model "${model}". ` +
        'Use the direct fal.ai route for FLUX Kontext models, or switch to a different HF provider/model.'
      );
    }
    if (msg.includes('Pre-paid credits are required')) {
      throw new Error(
        `HF provider billing required for model "${model}" via provider "${provider || 'auto'}". ` +
        'This account does not currently have usable prepaid/provider credits for this routed request.'
      );
    }
    if (msg.includes('not been able to find inference provider information')) {
      throw new Error(
        `HF imageToImage unsupported for model "${model}". ` +
        `Try Qwen/Qwen-Image-Edit-2511 or Qwen/Qwen-Image-Edit with provider "${DEFAULT_HF_PROVIDER}", ` +
        'or use the direct fal.ai FLUX Kontext route with a FAL key.'
      );
    }
    throw error;
  }

  return Buffer.from(await result.arrayBuffer());
}

async function runFalImageToImage({ model, falKey, prompt, inputPath, parameters = {} }) {
  const falModel = resolveDirectFalImageEditModel(model);
  if (!falModel) {
    throw new Error(`No direct fal.ai image-edit model mapping found for "${model}"`);
  }
  if (!falKey) {
    throw new Error('Missing fal.ai API key');
  }
  if (!inputPath || !fs.existsSync(inputPath)) {
    throw new Error(`imageActorInScene requires a valid input image path. Received: ${inputPath}`);
  }

  const payload = await buildFalImageEditPayload({
    prompt,
    inputPath,
    parameters,
  });
  const result = await submitFalJob({
    model: falModel,
    payload,
    falKey,
  });
  const url = extractFalImageUrl(result);

  if (!url) {
    throw new Error(
      `Malformed fal.ai image-to-image response for model "${falModel}": expected an image url in the result payload`
    );
  }

  return {
    provider: 'fal',
    routeModel: falModel,
    payload,
    raw: result,
    buffer: isDataImageUrl(url) ? dataUrlToBuffer(url) : null,
    url: isHttpUrl(url) ? url : '',
  };
}

export class PostToHF_ImageActorInScene extends PostTo {
  constructor(modelConfig = {}) {
    super(modelConfig);
    this.config = modelConfig || {};
    this.config.provider = 'hf';
    this.model = this.config.model || process.env.HF_MODEL || DEFAULT_HF_IMAGE_EDIT_MODEL;
    this.hfProvider = this.config.hfProvider || process.env.HF_PROVIDER || DEFAULT_HF_PROVIDER;
    this.config.folderName = this.config.folderName ?? 'image-actor-in-scene';

    const targetSub = this.config.folderName && this.config.folderName !== '.'
      ? this.config.folderName
      : '.';
    this.imageDir = path.join(__dirname, targetSub);
    fs.ensureDirSync(this.imageDir);
  }

  async init() {
    const token = process.env.HF_API_TOKEN || process.env.HF_TOKEN || process.env.HF_APIKEY || null;
    const maskedToken = token && typeof token === 'string' ? `${token.slice(0, 4)}...${token.slice(-4)}` : 'none';
    console.log('[image-actor-in-scene:HF] Using HF token:', maskedToken);
    const falKey = this.config.falKey || resolveFalKey();
    const maskedFalKey = falKey && typeof falKey === 'string' ? `${falKey.slice(0, 4)}...${falKey.slice(-4)}` : 'none';
    console.log('[image-actor-in-scene:FAL] Using FAL key:', maskedFalKey);
    return this;
  }

  async prompt(promptText, options = {}) {
    const promptStr = options.prompt ?? String(promptText ?? '');
    const usedModel = options.model || this.model;
    const requestedProvider = options.hfProvider ?? options.provider ?? this.hfProvider ?? process.env.HF_PROVIDER;
    const hfProvider = normalizeProvider(requestedProvider);
    const contextReference = options.contextReference && typeof options.contextReference === 'object'
      ? options.contextReference
      : null;

    let imagePath = options.imagePath;
    const referenceImages = Array.isArray(options.images) ? options.images.filter(Boolean) : [];
    const referencePaths = referenceImages.map((entry) => entry?.path || entry?.url).filter(Boolean);
    const referencePrompt = contextReference?.enabled && referencePaths.length > 0
      ? [
          'Reference continuity images are provided.',
          'Use them only as off-frame identity/location continuity references.',
          'Do not render collage, split-screen, thumbnails, picture-in-picture, or extra frames.',
        ].join(' ')
      : '';
    const mergedPrompt = [promptStr, referencePrompt].filter(Boolean).join(' ').trim();

    if (!imagePath && Array.isArray(options.images) && options.images.length) {
      imagePath = options.images[0]?.path || null;
    }
    if (!imagePath) {
      throw new Error('imageActorInScene requires an input image (options.imagePath or filename in prompt)');
    }

    const token = process.env.HF_API_TOKEN || process.env.HF_TOKEN || process.env.HF_APIKEY;
    const falKey = this.config.falKey || resolveFalKey();
    const parameters = omitUndefined({
      guidance_scale: options.guidance_scale,
      num_inference_steps: options.num_inference_steps,
      seed: options.seed,
      width: options.width,
      height: options.height,
      negative_prompt: options.negative_prompt,
      ...(options.parameters || {}),
    });
    const useDirectFal = shouldUseDirectFalImageEdit({
      model: usedModel,
      provider: hfProvider,
      falKey,
    });
    const providerLabel = useDirectFal ? 'FAL' : 'HF';

    console.log(`[image-actor-in-scene:${providerLabel}] Model:`, usedModel);
    console.log(`[image-actor-in-scene:${providerLabel}] Provider:`, useDirectFal ? 'fal-api' : (hfProvider || 'auto'));
    console.log(`[image-actor-in-scene:${providerLabel}] Input image:`, imagePath);
    if (referencePaths.length > 0) {
      console.log(`[image-actor-in-scene:${providerLabel}] Reference images:`, referencePaths.length);
    }

    try {
      fs.ensureDirSync(this.imageDir);
    } catch (_) {}

    const imageResult = useDirectFal
      ? await runFalImageToImage({
        model: usedModel,
        falKey,
        prompt: mergedPrompt,
        inputPath: imagePath,
        parameters,
      })
      : {
        provider: 'hf',
        routeModel: usedModel,
        payload: null,
        raw: null,
        buffer: await runHFImageToImage({
          model: usedModel,
          token,
          prompt: mergedPrompt,
          inputPath: imagePath,
          parameters,
          provider: hfProvider,
        }),
        url: '',
      };

    const baseName = `${Date.now()}-image-actor-in-scene`;
    const savePath = path.join(this.imageDir, `${baseName}.png`);

    try {
      fs.ensureDirSync(path.dirname(savePath));
    } catch (_) {}

    if (imageResult.buffer) {
      await fs.writeFile(savePath, imageResult.buffer);
    } else if (imageResult.url) {
      await downloadToFile(imageResult.url, savePath, { timeoutMs: 15 * 60 * 1000 });
    } else {
      throw new Error(`imageActorInScene produced no image buffer or url for provider "${imageResult.provider}"`);
    }
    console.log(`[image-actor-in-scene:${providerLabel}] Saved image to: ${savePath}`);

    const json = {
      provider: imageResult.provider,
      model: usedModel,
      runtimeModel: imageResult.routeModel || usedModel,
      prompt: mergedPrompt,
      inputPath: imagePath,
      sourceInputPath: options.imagePath || '',
      referenceImages: referencePaths,
      contextReferenceMode: contextReference?.enabled ? 'promptOnly' : 'disabled',
      parameters: {
        guidance_scale: parameters.guidance_scale ?? 2.5,
        num_inference_steps: parameters.num_inference_steps ?? 28,
        ...(parameters.seed !== undefined ? { seed: parameters.seed } : {}),
        ...(requestedProvider !== undefined ? { provider: hfProvider || 'auto' } : {}),
      },
      ...(imageResult.payload ? { payload: imageResult.payload } : {}),
      ...(imageResult.url ? { sourceUrl: imageResult.url } : {}),
    };
    const jsonData = await saveJSON(savePath, json);

    return { image: { path: savePath }, imagePath: savePath, file: savePath, json: jsonData };
  }
}

export default {
  init: async (config = {}) => {
    const instance = new PostToHF_ImageActorInScene(config);
    return instance;
  },
};
