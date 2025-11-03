// lib/generator/image-image/hfTextImage.js
import PostTo from '../PostTo.js';
import fs from 'fs-extra';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { saveJSON } from '../save-utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

try {
  dotenv.config({ path: path.join(__dirname, '.env') });
} catch {}

const maskToken = (t) => (!t || typeof t !== 'string' ? 'none' : (t.length <= 8 ? '*'.repeat(t.length) : `${t.slice(0,4)}…${t.slice(-4)}`));
const getEnv = (k, fb = '') => process.env[k] || fb;

// --- helpers for 16:9 ---
const snap8 = (n) => Math.max(8, Math.round(n / 8) * 8);
function ensure169({ width, height, fallbackW = 1280, fallbackH = 720 }) {
  let w = Number(width) || 0;
  let h = Number(height) || 0;
  if (!w && !h) { w = fallbackW; h = fallbackH; }
  else if (w && !h) h = Math.round((w * 9) / 16);
  else if (!w && h) w = Math.round((h * 16) / 9);
  return { width: snap8(w), height: snap8(h) };
}

async function createHFImageToImage({ model, token, prompt, inputPath, parameters = {} }) {
  if (!token) throw new Error('Missing HF_API_TOKEN for Hugging Face Inference');
  if (!inputPath || !fs.existsSync(inputPath)) {
    throw new Error(`HF image-to-image requires a valid input image path. Received: ${inputPath}`);
  }

  let InferenceClient, fileFromPath;
  try { ({ InferenceClient } = await import('@huggingface/inference')); }
  catch { throw new Error('Hugging Face provider requires @huggingface/inference. Install: npm i @huggingface/inference'); }
  try { ({ fileFromPath } = await import('formdata-node/file-from-path')); }
  catch { throw new Error('Hugging Face image-to-image requires formdata-node. Install: npm i formdata-node'); }

  const hf = new InferenceClient(token);
  const file = await fileFromPath(inputPath);

  const { width, height } = ensure169({ width: parameters.width, height: parameters.height });

  // Allow forcing provider via env or options
  const forcedProvider = parameters.provider || process.env.HF_PROVIDER || undefined;

  async function doCall(providerOpt) {
    return hf.imageToImage({
      model,
      ...(providerOpt ? { provider: providerOpt } : {}),
      inputs: file,
      parameters: {
        prompt: String(prompt || ''),
        guidance_scale: parameters.guidance_scale ?? 2.5,
        num_inference_steps: parameters.num_inference_steps ?? 28,
        seed: parameters.seed ?? 0,
        negative_prompt: parameters.negative_prompt,
        width,
        height,
        ...parameters, // allow extra params
      },
    });
  }

  try {
    // Try with forced provider if given, else default auto routing
    return Buffer.from(await (await doCall(forcedProvider)).arrayBuffer());
  } catch (e) {
    const msg = String(e?.message || e);

    // If a provider was forced and it doesn't support the task, retry without forcing provider (auto)
    if (forcedProvider && /Task 'image-to-image' not supported for provider/i.test(msg)) {
      const result = await doCall(undefined);
      return Buffer.from(await result.arrayBuffer());
    }

    if (msg.includes('not been able to find inference provider information')) {
      throw new Error(
        `HF imageToImage unsupported for model "${model}". ` +
        `Use a model with an image-to-image pipeline (e.g., timbrooks/instruct-pix2pix) ` +
        `or set HF_MODEL to a compatible model.`
      );
    }
    throw e;
  }
}

export class PostToHF_ImageImage_TextImage extends PostTo {
  constructor(modelConfig = {}) {
    super(modelConfig);
    this.config = modelConfig || {};
    this.config.provider = 'hf';
    this.config.model = this.config.model || process.env.HF_MODEL || 'black-forest-labs/FLUX.1-Kontext-dev';
    this.config.folderName = this.config.folderName ?? 'image-image-hf';

    const targetSub = this.config.folderName && this.config.folderName !== '.' ? this.config.folderName : '.';
    this.imageDir = path.join(__dirname, targetSub);
    fs.ensureDirSync(this.imageDir);
  }

  async init() {
    const token = getEnv('HF_API_TOKEN') || getEnv('HF_TOKEN') || getEnv('HF_APIKEY');
    console.log('[image-image:HF] Using HF token:', maskToken(token));
    console.log('[image-image:HF] Model:', this.config.model);
    return this;
  }

  async prompt(promptText, options = {}) {
    const promptStr = options.prompt ?? String(promptText ?? '');

    // Resolve input image robustly
    let inputPath = options.imagePath || null;
    if (!inputPath && Array.isArray(options.images) && options.images.length) inputPath = options.images[0]?.path || null;

    // If a filename is embedded in the prompt, search a couple of likely dirs
    if (!inputPath && promptStr) {
      try {
        const match = String(promptStr).match(/([\w.-]+\.(?:png|jpg|jpeg|webp|gif))/i);
        if (match) {
          const fname = match[1];
          const candidateDirs = [
            path.join(__dirname, '..', 'test.datas'),
            process.cwd(),
          ];
          for (const dir of candidateDirs) {
            const p = path.join(dir, fname);
            if (fs.existsSync(p)) { inputPath = p; break; }
          }
          if (!inputPath && fs.existsSync(fname)) inputPath = path.resolve(fname);
        }
      } catch {}
    }

    if (!inputPath) throw new Error('HF image-to-image requires an input image (options.imagePath or filename in prompt)');

    const token = getEnv('HF_API_TOKEN') || getEnv('HF_TOKEN') || getEnv('HF_APIKEY');
    const usedModel = options.model || this.config.model;
    console.log('[image-image:HF] Model:', usedModel);

    const parameters = {
      guidance_scale: options.guidance_scale,
      num_inference_steps: options.num_inference_steps,
      seed: options.seed,
      width: options.width,
      height: options.height,
      negative_prompt: options.negative_prompt,
      provider: options.provider,              // allow per-call provider
      ...(options.parameters || {}),
    };

    const buffer = await createHFImageToImage({
      model: usedModel,
      token,
      prompt: promptStr,
      inputPath,
      parameters,
    });

    const baseName = `${Date.now()}-image-image-hf`;
    const savePath = path.join(this.imageDir, `${baseName}.png`);
    await fs.writeFile(savePath, buffer);
    console.log(`[image-image:HF] Saved image buffer to: ${savePath}`);

    const { width, height } = ensure169({ width: parameters.width, height: parameters.height });
    const json = {
      provider: 'hf',
      model: usedModel,
      prompt: promptStr,
      inputPath,
      parameters: {
        guidance_scale: parameters.guidance_scale ?? 2.5,
        num_inference_steps: parameters.num_inference_steps ?? 28,
        seed: parameters.seed ?? 0,
        width,
        height,
        negative_prompt: parameters.negative_prompt,
        provider: parameters.provider || process.env.HF_PROVIDER || null,
      },
    };
    const jsonData = await saveJSON(savePath, json);

    return { image: { path: savePath }, json: jsonData };
  }
}

export default {
  init: async (config = {}) => {
    const instance = new PostToHF_ImageImage_TextImage(config);
    return await instance.init();
  }
};
