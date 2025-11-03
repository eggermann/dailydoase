/**
 * Run via: node lib/generator/image-image/runHF.js
 */
import 'dotenv/config';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { PostToHF_ImageImage_TextImage } from './hfTextImage.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function generateImage() {
  let hfAvailable = true;
  try {
    await import('@huggingface/inference');
    await import('formdata-node/file-from-path');
  } catch {
    hfAvailable = false;
  }

  const hasKey = !!(process.env.HF_API_TOKEN || process.env.HF_TOKEN || process.env.HF_APIKEY);
  if (!hfAvailable || !hasKey) {
    console.error('❌ Hugging Face not available or no API key found');
    return;
  }

  console.log('[HF] Using model:', process.env.HF_MODEL || 'black-forest-labs/FLUX.1-Kontext-dev');

  const api = await new PostToHF_ImageImage_TextImage({
    folderName: './test-generations-hf',
    model: process.env.HF_MODEL || 'black-forest-labs/FLUX.1-Kontext-dev',
  }).init();

  // Resolve test image relative to THIS file
  const source = path.resolve(__dirname, '../test.datas/A.jpeg');
  if (!(await fs.pathExists(source))) {
    console.warn('[HF] Source image not found at', source);
    return;
  }

  const res = await api.prompt(
    'a scene of a woman and a panda fighting together on Mars as cinematic sci-fi art',
    {
      imagePath: source,
      guidance_scale: 2.5,
      num_inference_steps: 28,
      seed: 0,
      width: 1280,
      height: 720,
      // optionally force a provider if needed:
      // provider: process.env.HF_PROVIDER, // e.g., "huggingface"
    }
  );

  if (!res?.image?.path) {
    console.error('❌ No image path returned');
    return;
  }

  const exists = await fs.pathExists(res.image.path);
  console.log(exists ? '[HF] ✅ Image generated' : '[HF] ❌ Image file not found', res.image.path);

  const sidecar = res.image.path.replace(/\.[^.]+$/, '.json');
  console.log('[HF] Sidecar JSON:', (await fs.pathExists(sidecar)) ? 'created' : 'not found');
}

generateImage().catch((e) => {
  console.error('❌ Error generating image:', e?.message || e);
});