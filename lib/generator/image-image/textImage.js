import PostTo from '../PostTo.js';
import fs from 'fs-extra';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

import { downloadToFile, saveJSON } from '../save-utils.js';

// Local .env for this generator folder (lib/generator/image-image/.env)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
try {
  dotenv.config({ path: path.join(__dirname, '.env') });
} catch (_) {
  // ignore
}

const maskToken = (t) => {
  if (!t || typeof t !== 'string') return 'none';
  if (t.length <= 8) return '*'.repeat(t.length);
  return `${t.slice(0, 4)}…${t.slice(-4)}`;
};

// -------- Minimal helpers adapted from the provided snippet --------
const getEnv = (key, fallback = '') => process.env[key] || fallback;

async function createSceneByFormData(args) {
  // Minimal OpenAI Images API call using prompt and optional image uploads.
  const apiKey = getEnv('OPENAI_API_KEY');
  if (!apiKey) throw new Error('Missing OPENAI_API_KEY for image generation');

  const model = getEnv('OPENAI_IMAGE_MODEL', 'gpt-image-1');
  const size = args?.size || '512x512';
  const responseFormat = 'b64_json';

  // Helper to guess a mime type from a filename
  const mimeByExt = (name) => {
    const ext = String(name || '').toLowerCase().split('.').pop();
    if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
    if (ext === 'png') return 'image/png';
    if (ext === 'webp') return 'image/webp';
    if (ext === 'gif') return 'image/gif';
    return 'application/octet-stream';
  };

  const hasImages = Array.isArray(args?.images) && args.images.length > 0;

  // If reference images are provided, use the edits endpoint with multipart/form-data
  if (hasImages) {
    const form = new FormData();
    form.append('prompt', String(args?.prompt || ''));
    form.append('model', String(model));
    form.append('size', String(size));
    // Do not send response_format here; some deployments reject it on edits.

    for (const img of args.images) {
      if (!img) continue;
      try {
        if (img.path && typeof img.path === 'string') {
          // Use the path as-is (supports absolute paths)
          const filePath = img.path;
          if (!fs.existsSync(filePath)) continue;
          const buf = fs.readFileSync(filePath);
          if (!buf?.length) continue;
          const filename = path.basename(filePath);
          const blob = new Blob([buf], { type: mimeByExt(filename) });
          form.append('image', blob, filename); // NOTE: field name must be "image"
        } else if (img.url && /^https?:\/\//i.test(String(img.url))) {
          const res = await fetch(String(img.url));
          if (res.ok) {
            const ab = await res.arrayBuffer();
            const ct = res.headers.get('content-type') || 'application/octet-stream';
            const blob = new Blob([ab], { type: ct });
            const filename = (new URL(String(img.url))).pathname.split('/').pop() || 'remote-image';
            form.append('image', blob, filename); // NOTE: field name must be "image"
          }
        }
      } catch {
        // ignore individual image failures
      }
    }

    const res = await fetch('https://api.openai.com/v1/images/edits', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}` },
      body: form
    });

    const data = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error(`OpenAI API error: ${res.status} ${res.statusText} ${JSON.stringify(data || {})}`);
    }
    const first = data?.data?.[0] || {};
    if (first.b64_json) {
      return `data:image/png;base64,${first.b64_json}`;
    }
    if (first.url) {
      return String(first.url);
    }
    throw new Error('No image returned from OpenAI (edits).');
  }

  // Otherwise, use the generations endpoint with JSON
  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      prompt: args?.prompt || '',
      model,
      n: 1,
      size
    })
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(`OpenAI API error: ${res.status} ${res.statusText} ${JSON.stringify(data || {})}`);
  }
  const first = data?.data?.[0] || {};
  if (first.b64_json) {
    return `data:image/png;base64,${first.b64_json}`;
  }
  if (first.url) {
    return String(first.url);
  }
  throw new Error('No image data returned from OpenAI (generations).');
}

// Simplified Gemini example using @google/genai
async function createSceneGemini(args) {
  const apiKey = getEnv('GOOGLE_API_KEY') || getEnv('GOOGLE_API_KEY_BEARER');
  if (!apiKey) throw new Error('Missing GOOGLE_API_KEY for Gemini image generation');

  // Lazy import to avoid requiring the dependency unless used
  let GoogleGenAI;
  try {
    ({ GoogleGenAI } = await import('@google/genai'));
  } catch (e) {
    throw new Error('Gemini provider requires @google/genai. Please install it: npm i @google/genai');
  }

  const client = new GoogleGenAI({ apiKey });
  const model = getEnv('GEMINI_IMAGE_MODEL', getEnv('GEMINI_MODEL', 'gemini-2.5-flash-image-preview'));

  // Build contents with optional inline images
  const contents = [];
  const images = Array.isArray(args?.images) ? args.images : [];
  const names = [];

  // Helper: mime type by filename
  const mimeByExt = (name) => {
    const ext = String(name || '').toLowerCase().split('.').pop();
    if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
    if (ext === 'png') return 'image/png';
    if (ext === 'webp') return 'image/webp';
    if (ext === 'gif') return 'image/gif';
    return 'application/octet-stream';
  };

  // Attach a brief instruction listing available named images
  for (const img of images) {
    try {
      const src = img.path || img.url;
      if (!src) continue;
      const filename = img.path ? path.basename(img.path) : (new URL(String(img.url))).pathname.split('/').pop();
      const base = String(filename || 'image').replace(/\.[^.]+$/, '');
      const name = base.toUpperCase();
      names.push(name);
    } catch (_) { /* ignore */ }
  }
  if (names.length) {
    contents.push({ text: `You are given named reference images. Available images: ${names.join(', ')}` });
  }

  if (args?.prompt) contents.push({ text: String(args.prompt) });

  // Now embed each referenced image as a marker + inlineData
  for (const img of images) {
    try {
      const filename = img.path ? path.basename(img.path) : (new URL(String(img.url))).pathname.split('/').pop();
      const base = String(filename || 'image').replace(/\.[^.]+$/, '');
      const name = base.toUpperCase();
      let buf = null;
      let mime = mimeByExt(filename || '');
      if (img.path && fs.existsSync(img.path)) {
        buf = fs.readFileSync(img.path);
      } else if (img.url) {
        const res = await fetch(String(img.url));
        if (res.ok) {
          const ab = await res.arrayBuffer();
          buf = Buffer.from(ab);
          mime = res.headers.get('content-type') || mime;
        }
      }
      if (!buf) continue;
      const b64 = buf.toString('base64');
      contents.push({ text: `[image:${name}]` });
      contents.push({ inlineData: { mimeType: mime, data: b64 } });
    } catch { /* ignore single image failure */ }
  }

  const resp = await client.models.generateContent({ model, contents });
  const parts = resp?.candidates?.[0]?.content?.parts || [];
  for (const p of parts) {
    if (p?.inlineData?.data) {
      const mime = p.inlineData.mimeType || 'image/png';
      return `data:${mime};base64,${p.inlineData.data}`;
    }
  }
  throw new Error('Gemini response contained no inline image data');
}

export async function createSceneImage(info, width, height, openaiSize = '1024x1024') {
  const requested = String(
    typeof info === 'object' && info.provider ||
    getEnv("IMAGE_PROVIDER", "openai")
  ).toLowerCase();

  const hasOpenAI = !!getEnv("OPENAI_API_KEY");
  const hasGemini = !!(getEnv("GOOGLE_API_KEY") || getEnv("GOOGLE_API_KEY_BEARER"));
  const hasHF = true; // Assume HF is always available for now

  const args = {
    prompt: info.prompt || String(info),
    images: info.images || [],
    size: openaiSize,
  };

  // OpenAI (default)
  if (requested === 'openai' && hasOpenAI) {
    return await createSceneByFormData(args);
  }

  // Gemini stub (to be implemented)
  if (requested === 'gemini' && hasGemini) {
    return await createSceneGemini(args);
  }

  // HuggingFace stub (to be implemented)
  if (requested === 'hf' && hasHF) {
    // TODO: Implement HuggingFace API call here
    throw new Error("HuggingFace provider not yet implemented.");
  }

  // Fallback to OpenAI
  if (hasOpenAI) {
    return await createSceneByFormData(args);
  }

  throw new Error("No valid image provider available.");
}

// ------------------------------------------------------------------

export class PostToImageImage_TextImage extends PostTo {
  constructor(modelConfig = {}) {
    super(modelConfig);
    this.config = modelConfig || {};
    this.config.space = 'openai/images';
    this.config.folderName = this.config.folderName ?? 'image-image';

    // Optional size like '512x512' | '1024x1024'
    this.config.openaiSize = this.config.openaiSize || '512x512';

    // Save into this generator's own directory by default, or into a subfolder when folderName is provided
    const targetSub = this.config.folderName && this.config.folderName !== '.'
      ? this.config.folderName
      : '.';
    this.imageDir = path.join(__dirname, targetSub);
    fs.ensureDirSync(this.imageDir);
  }

  async init() {
    const token = process.env.OPENAI_API_KEY || null;
    console.log('[image-image] Using OpenAI token:', maskToken(token));
    return this;
  }

  async prompt(promptText, options = {}) {
    // Build base info
    const promptStr = options.prompt ?? String(promptText ?? '');
    let images = Array.isArray(options.images) ? options.images.slice() : [];

    // Auto-resolve image references mentioned by filename in the prompt text
    // Example: "... Banana_Girl_BG_bikini.png ..." will try to attach that file from ../test.datas
    try {
      if (!images.length && promptStr) {
        const fileMatches = Array.from(
          new Set(
            String(promptStr).match(/([\w.-]+\.(?:png|jpg|jpeg|webp|gif))/gi) || []
          )
        );
        if (fileMatches.length) {
          const candidateDirs = [
            path.join(__dirname, '..', 'test.datas'),
            process.cwd(),
          ];
          for (const fname of fileMatches) {
            let resolved = null;
            // If it's an absolute or relative path as-is
            try {
              const asIs = path.isAbsolute(fname) ? fname : path.resolve(process.cwd(), fname);
              if (fs.existsSync(asIs)) resolved = asIs;
            } catch (_) {}
            // Try known candidate dirs
            if (!resolved) {
              for (const dir of candidateDirs) {
                const p = path.join(dir, fname);
                if (fs.existsSync(p)) { resolved = p; break; }
              }
            }
            if (resolved) {
              images.push({ path: resolved });
            }
          }
          if (images.length) {
            console.log('[image-image] Resolved reference images from prompt:', images.map(i => i.path || i.url));
          }
        }
      }
    } catch (_) { /* non-fatal */ }

    const info = { prompt: promptStr, images, provider: options.provider ?? this.config.provider };
    console.log('[image-image] Calling createSceneImage with:', {
      prompt: info.prompt,
      openaiSize: options.openaiSize || this.config.openaiSize,
      images: images && images.length ? images.map(i => i.path || i.url) : []
    });

    const resultUrlOrDataUrl = await createSceneImage(
      info,
      options.width,
      options.height,
      options.openaiSize || this.config.openaiSize
    );

    const baseName = `${Date.now()}-image-image`;
    let savePath = path.join(this.imageDir, `${baseName}.png`);

    if (typeof resultUrlOrDataUrl === 'string' && resultUrlOrDataUrl.startsWith('data:image/')) {
      // data URL case
      const m = resultUrlOrDataUrl.match(/^data:(image\/(\w+));base64,(.*)$/);
      if (!m) throw new Error('Unsupported data URL image format');
      const ext = m[2] || 'png';
      savePath = path.join(this.imageDir, `${baseName}.${ext}`);
      const buffer = Buffer.from(m[3], 'base64');
      await fs.writeFile(savePath, buffer);
      console.log(`[image-image] Saved image buffer to: ${savePath}`);
    } else if (typeof resultUrlOrDataUrl === 'string') {
      // URL case
      try {
        const uExt = (new URL(resultUrlOrDataUrl)).pathname.split('.').pop();
        if (uExt && uExt.length <= 4) {
          savePath = path.join(this.imageDir, `${baseName}.${uExt}`);
        }
      } catch (_) { /* ignore */ }
      console.log(`[image-image] Downloading from: ${resultUrlOrDataUrl}`);
      await downloadToFile(resultUrlOrDataUrl, savePath);
      console.log(`[image-image] Saved image to: ${savePath}`);
    } else {
      throw new Error('image-image: Unexpected result type from createSceneImage');
    }

    const json = {
      model: this.config.space,
      prompt: info.prompt,
      openaiSize: options.openaiSize || this.config.openaiSize,
      url: typeof resultUrlOrDataUrl === 'string' ? resultUrlOrDataUrl : null,
      sourceUrl: typeof resultUrlOrDataUrl === 'string' ? resultUrlOrDataUrl : null,
      referenceImages: images && images.length ? images.map(i => i.path || i.url) : []
    };
    const jsonData = await saveJSON(savePath, json);

    return { image: { path: savePath }, json: jsonData };
  }
}

export default {
  init: async (config = {}) => {
    const instance = new PostToImageImage_TextImage(config);
    return await instance.init();
  }
};
