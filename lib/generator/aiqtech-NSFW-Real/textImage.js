import PostTo from '../PostTo.js';
import { Client } from '@gradio/client';
import fs from 'fs-extra';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

import { joinOutPath } from './../utils.js';
import { saveJSON, downloadToFile } from './../save-utils.js';

// Load local .env from this folder (lib/generator/aiqtech-NSFW-Real/.env)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
try {
  dotenv.config({ path: path.join(__dirname, '.env') });
} catch (_) {
  // ignore if missing
}

const maskToken = (t) => {
  if (!t || typeof t !== 'string') return 'none';
  if (t.length <= 8) return '*'.repeat(t.length);
  return `${t.slice(0, 4)}…${t.slice(-4)}`;
};

const SPACE = 'aiqtech/NSFW-Real';

const defaults = {
  negative_prompt:
    ' watermark, signature, ugly, poorly drawn',
  seed: 0,
  randomize_seed: true,
  width: 1024,
  height: 1024,
  guidance_scale: 7,
  num_inference_steps: 28,
};

export class PostToAIQTech_NSFWReal_TextImage extends PostTo {
  constructor(modelConfig = {}) {
    super(modelConfig);
    this.config = modelConfig || {};
    this.config.space = SPACE;
    this.config.folderName = this.config.folderName ?? SPACE.split('/')[1];

    // Apply defaults
    this.config.negative_prompt =
      this.config.negative_prompt ?? defaults.negative_prompt;
    this.config.seed = this.config.seed ?? defaults.seed;
    this.config.randomize_seed =
      this.config.randomize_seed ?? defaults.randomize_seed;
    this.config.width = this.config.width ?? defaults.width;
    this.config.height = this.config.height ?? defaults.height;
    this.config.guidance_scale =
      this.config.guidance_scale ?? defaults.guidance_scale;
    this.config.num_inference_steps =
      this.config.num_inference_steps ?? defaults.num_inference_steps;

    this._cli = null;
    // Save into this generator's own directory by default, or into a subfolder when folderName is provided
    const targetSub = this.config.folderName && this.config.folderName !== '.'
      ? this.config.folderName
      : '.';
    this.imageDir = path.join(__dirname, targetSub);
    fs.ensureDirSync(this.imageDir);
  }

  async init() {
    const token =
      this.config.hfToken || process.env.HF_TOKEN || process.env.HF_API_TOKEN || null;
    console.log('[AIQTech NSFW-Real] Using HF token:', maskToken(token));
    this._cli = await Client.connect(SPACE, token ? { hf_token: token } : {});
    return this;
  }

  async prompt(promptText, options = {}) {
    const payload = {
      prompt: options.prompt ?? String(promptText ?? ''),
      negative_prompt: options.negative_prompt ?? this.config.negative_prompt,
      seed: options.seed ?? this.config.seed,
      randomize_seed:
        typeof options.randomize_seed === 'boolean'
          ? options.randomize_seed
          : this.config.randomize_seed,
      width: options.width ?? this.config.width,
      height: options.height ?? this.config.height,
      guidance_scale: options.guidance_scale ?? this.config.guidance_scale,
      num_inference_steps:
        options.num_inference_steps ?? this.config.num_inference_steps,
    };

    // Ensure multiples of 32 for dimensions (common model constraint)
    const nextMul32 = (v) => {
      v = Math.max(1, Math.round(Number(v) || 0));
      return v % 32 === 0 ? v : v + (32 - (v % 32));
    };
    payload.height = nextMul32(payload.height);
    payload.width = nextMul32(payload.width);

    console.log('[AIQTech NSFW-Real] Gradio payload:', JSON.stringify(payload, null, 2));
    const result = await this._cli.predict('/infer', payload);

    let out = Array.isArray(result?.data) ? result.data[0] : result?.data;
    let url = null;
    let buffer = null;
    let ext = 'png';

    if (typeof out === 'string') {
      if (/^https?:\/\//i.test(out)) {
        url = out;
      } else if (out.startsWith('data:image/')) {
        // data URL
        const m = out.match(/^data:(image\/\w+);base64,(.*)$/);
        if (m) {
          ext = m[1].split('/')[1] || 'png';
          buffer = Buffer.from(m[2], 'base64');
        }
      } else {
        // Unexpected string format; try to treat as URL path
        url = out;
      }
    } else if (out && typeof out === 'object') {
      url = out.url || out.path || null;
    }

    // Prepare file name
    const baseName = `${Date.now()}-aiqtech-nsfw-real`;
    let savePath = path.join(this.imageDir, `${baseName}.${ext}`);

    if (url) {
      // Try to infer extension from URL
      const uExt = (new URL(url)).pathname.split('.').pop();
      if (uExt && uExt.length <= 4) {
        savePath = path.join(this.imageDir, `${baseName}.${uExt}`);
      }
      await downloadToFile(url, savePath);
    } else if (buffer) {
      await fs.writeFile(savePath, buffer);
    } else {
      throw new Error('AIQTech NSFW-Real: Unexpected response format from /infer');
    }

    const json = {
      model: SPACE,
      prompt: payload.prompt,
      negative_prompt: payload.negative_prompt,
      seed: payload.seed,
      randomize_seed: payload.randomize_seed,
      width: payload.width,
      height: payload.height,
      guidance_scale: payload.guidance_scale,
      num_inference_steps: payload.num_inference_steps,
      url,
      sourceUrl: url,
    };
    const jsonData = await saveJSON(savePath, json);

    return { image: { path: savePath }, json: jsonData };
  }
}

export default {
  init: async (config = {}) => {
    const instance = new PostToAIQTech_NSFWReal_TextImage(config);
    return await instance.init();
  }
};
