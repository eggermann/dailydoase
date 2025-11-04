import PostTo from '../PostTo.js';
import fs from 'fs-extra';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

dotenv.config();
import { saveJSON } from '../save-utils.js';

// Load local .env (lib/generator/image-image/.env)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
try {
  dotenv.config({ path: path.join(__dirname, '.env') });
} catch (_) { }




const getEnv = (key, fallback = '') => process.env[key] || fallback;

async function runHFImageToImage({ model, token, prompt, inputPath, parameters = {} }) {
  if (!token) throw new Error('Missing HF_API_TOKEN for Hugging Face Inference');
  if (!inputPath || !fs.existsSync(inputPath)) {
    throw new Error(`imageActorInScene requires a valid input image path. Received: ${inputPath}`);
  }

  let InferenceClient, fileFromPath;
  try {
    ({ InferenceClient } = await import('@huggingface/inference'));
  } catch (e) {
    throw new Error('Hugging Face provider requires @huggingface/inference. Install: npm i @huggingface/inference');
  }
  try {
    ({ fileFromPath } = await import('formdata-node/file-from-path'));
  } catch (e) {
    throw new Error('Hugging Face image-to-image requires formdata-node. Install: npm i formdata-node');
  }

  const hf = new InferenceClient(token);
  const file = await fileFromPath(inputPath);

  let result;
  try {
    result = await hf.imageToImage({
      model,
      inputs: file,
      parameters: {
        prompt: String(prompt || ''),
        guidance_scale: parameters.guidance_scale ?? 2.5,
        num_inference_steps: parameters.num_inference_steps ?? 28,
        seed: parameters.seed ?? 0,
        ...parameters,
      },
    });
  } catch (e) {
    const msg = String(e && (e.message || e));
    if (msg.includes('not been able to find inference provider information')) {
      throw new Error(
        `HF imageToImage unsupported for model "${model}". ` +
        `Use a model with an image-to-image pipeline (e.g., timbrooks/instruct-pix2pix) ` +
        `or set HF_MODEL to a compatible model.`
      );
    }
    throw e;
  }

  const buffer = Buffer.from(await result.arrayBuffer());
  return buffer;
}

export class PostToHF_ImageActorInScene extends PostTo {
  constructor(modelConfig = {}) {
    super(modelConfig);
    this.config = modelConfig || {};
    this.config.provider = 'hf';
    this.model = this.config.model || process.env.HF_MODEL || 'timbrooks/instruct-pix2pix';
    this.config.folderName = this.config.folderName ?? 'image-actor-in-scene';

    const targetSub = this.config.folderName && this.config.folderName !== '.'
      ? this.config.folderName
      : '.';
    this.imageDir = path.join(__dirname, targetSub);
    fs.ensureDirSync(this.imageDir);
  }

  async init() {
    const token = process.env.HF_API_TOKEN || process.env.HF_TOKEN || process.env.HF_APIKEY || null;
    const masked = token && typeof token === 'string' ? `${token.slice(0,4)}…${token.slice(-4)}` : 'none';
    console.log('[image-actor-in-scene:HF] Using HF token:', masked);
    return this;
  }

  async prompt(promptText, options = {}) {
    const promptStr = options.prompt ?? String(promptText ?? '');

    // Accept actor/reference image explicitly or auto-resolve from prompt filename
    let imagePath = options.imagePath;

    if (!imagePath && Array.isArray(options.images) && options.images.length) {
      imagePath = options.images[0]?.path || null;
    }

    console.log('[image-actor-in-scene:HF] Model:', this.model);
    if (imagePath) {
      console.log('[image-actor-in-scene:HF] Input image:', imagePath);
    }


    /*  if (!inputPath && promptStr) {
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
        } catch (_) { }
      }*/

    if (!imagePath) {
      throw new Error('imageActorInScene requires an input image (options.imagePath or filename in prompt)');
    }



    const token = process.env.HF_API_TOKEN;
    const parameters = {
      guidance_scale: options.guidance_scale,
      num_inference_steps: options.num_inference_steps,
      seed: options.seed,
      width: options.width,
      height: options.height,
      negative_prompt: options.negative_prompt,
      ...(options.parameters || {}),
    };


    // Image directory may be overridden by the adapter (e.g., to a /parts folder). Ensure it exists.
    try { fs.ensureDirSync(this.imageDir); } catch (_) {}

    const buffer = await runHFImageToImage({
      model: this.model,
      token,
      prompt: promptStr,
      inputPath: imagePath,
      parameters,
    });

    const baseName = `${Date.now()}-image-actor-in-scene`;
    const savePath = path.join(this.imageDir, `${baseName}.png`);
    // Ensure target directory exists right before writing
    try { fs.ensureDirSync(path.dirname(savePath)); } catch (_) {}
    await fs.writeFile(savePath, buffer);
    console.log(`[image-actor-in-scene:HF] Saved image buffer to: ${savePath}`);

    const json = {
      provider: 'hf',
      model: this.model,
      prompt: promptStr,
      inputPath: imagePath,
      parameters: {
        guidance_scale: parameters.guidance_scale ?? 2.5,
        num_inference_steps: parameters.num_inference_steps ?? 28,
        seed: parameters.seed ?? 0,
      },
    };
    const jsonData = await saveJSON(savePath, json);

    return { image: { path: savePath }, imagePath: savePath, file: savePath, json: jsonData };
  }
}

export default {
  init: async (config = {}) => {
    const instance = new PostToHF_ImageActorInScene(config);
   
    return instance;
  }
};
