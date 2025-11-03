import PostTo from '../PostTo.js';
import fs from 'fs-extra';
import path from 'path';
import dotenv from 'dotenv';
import sharp from 'sharp';
import { fileURLToPath } from 'url';
import { saveJSON } from '../save-utils.js';

// Load local .env (lib/generator/image-image/.env)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
try {
  dotenv.config({ path: path.join(__dirname, '.env') });
} catch (_) {}

const maskToken = (t) => {
  if (!t || typeof t !== 'string') return 'none';
  if (t.length <= 8) return '*'.repeat(t.length);
  return `${t.slice(0, 4)}…${t.slice(-4)}`;
};

const getEnv = (key, fallback = '') => process.env[key] || fallback;

async function ensurePngBuffer(input) {
  // Accept Buffer | string (path) and convert to PNG buffer for OpenAI edits
  if (Buffer.isBuffer(input)) {
    return await sharp(input).png().toBuffer();
  }
  if (typeof input === 'string') {
    return await sharp(input).png().toBuffer();
  }
  throw new Error('Unsupported input image; provide Buffer or path');
}

async function openAiImageEdit({ imageBuffer, prompt, size = '512x512' }) {
  const apiKey = getEnv('OPENAI_API_KEY');
  if (!apiKey) throw new Error('Missing OPENAI_API_KEY for image edit');

  const pngBuffer = await ensurePngBuffer(imageBuffer);
  const form = new FormData();
  form.set('prompt', String(prompt || ''));
  form.set('n', '1');
  form.set('size', size);
  form.set('response_format', 'b64_json');
  form.append('image', new Blob([pngBuffer], { type: 'image/png' }), 'input.png');

  const res = await fetch('https://api.openai.com/v1/images/edits', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/json',
    },
    body: form,
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`OpenAI edits API error: ${res.status} ${res.statusText} ${txt}`);
  }
  const data = await res.json();
  const b64 = data?.data?.[0]?.b64_json;
  if (!b64) throw new Error('OpenAI edits: missing b64_json in response');
  return Buffer.from(b64, 'base64');
}

export class PostToImageImage_EditImage extends PostTo {
  constructor(modelConfig = {}) {
    super(modelConfig);
    this.config = modelConfig || {};
    this.config.provider = 'openai-edits';
    this.config.folderName = this.config.folderName ?? 'image-image-edits';
    this.config.size = this.config.size || '512x512';

    const targetSub = this.config.folderName && this.config.folderName !== '.'
      ? this.config.folderName
      : '.';
    this.imageDir = path.join(__dirname, targetSub);
    fs.ensureDirSync(this.imageDir);
  }

  async init() {
    const token = process.env.OPENAI_API_KEY || null;
    console.log('[image-image:edits] Using OpenAI token:', maskToken(token));
    return this;
  }

  async prompt(inputImage, options = {}) {
    const promptText = options.prompt ?? '';
    const size = options.size || this.config.size || '512x512';

    const outBuffer = await openAiImageEdit({
      imageBuffer: inputImage,
      prompt: promptText,
      size,
    });

    const baseName = `${Date.now()}-image-image-edit`;
    const savePath = path.join(this.imageDir, `${baseName}.png`);
    await fs.writeFile(savePath, outBuffer);

    const json = {
      provider: this.config.provider,
      prompt: promptText,
      size,
    };
    const jsonData = await saveJSON(savePath, json);

    return { image: { path: savePath }, json: jsonData };
  }
}

export default {
  init: async (config = {}) => {
    const instance = new PostToImageImage_EditImage(config);
    return await instance.init();
  }
};

