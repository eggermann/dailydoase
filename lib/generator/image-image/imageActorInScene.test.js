import 'dotenv/config';
import { jest } from '@jest/globals';
import fs from 'fs-extra';
import { fileURLToPath } from 'url';
import path from 'path';

import { PostToHF_ImageActorInScene } from './imageActorInScene.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


jest.setTimeout(180_000);

let hfAvailable = true;
try {
  await import('@huggingface/inference');
  await import('formdata-node/file-from-path');
} catch {
  hfAvailable = false;
}

const hasKey = !!(process.env.HF_API_TOKEN || process.env.HF_TOKEN || process.env.HF_APIKEY);
const runHF = hfAvailable && hasKey;

const hfModel = process.env.HF_MODEL || 'Qwen/Qwen-Image-Edit-2511';
const hfProvider = process.env.HF_PROVIDER || 'fal-ai';
const expectedProvider = (
  hfProvider === 'fal-ai'
  && !!(process.env.FAL_KEY || process.env.FAL_API_KEY || process.env.FAL_AI_API_KEY)
  && ['black-forest-labs/FLUX.1-Kontext-dev', 'black-forest-labs/FLUX.1-Kontext-pro'].includes(hfModel)
)
  ? 'fal'
  : 'hf';

(runHF ? test : test.skip)(
  'returns a usable HF image-to-image response for actor-in-scene generation',
  async () => {
    const api = await new PostToHF_ImageActorInScene({
      folderName: './test-generations-actor-in-scene',
      model: hfModel,
      hfProvider,
    }).init();

    const imagePath = path.join(__dirname, '..', 'test.datas', 'A.jpeg');

    const source = await fs.pathExists(imagePath);
    if (!source) {
      console.warn('Skipping: source image not found at', imagePath);
      return;
    }

    // Real API smoke test: keep settings minimal to reduce spend.
    const prompt = 'Place the actor in a simple photo studio with soft lighting.';
    let res;
    try {
      res = await api.prompt(prompt, {
        imagePath,
        guidance_scale: 1,
        num_inference_steps: 1,
        width: 256,
        height: 256,
        seed: 0,
      });
    } catch (err) {
      const msg = String(err?.message || err);
      if (
        msg.includes('HF provider billing required') ||
        msg.includes('Pre-paid credits') ||
        msg.includes('HF fal-ai imageToImage routing returned a malformed response') ||
        msg.includes('Received malformed response from Fal.ai image-to-image API') ||
        msg.includes('not supported for task') ||
        msg.includes('No Inference Provider available') ||
        msg.includes('not been able to find inference provider information') ||
        msg.includes('HF imageToImage unsupported for model')
      ) {
        console.warn('Skipping live HF smoke test:', msg);
        return;
      }
      throw err;
    }

    expect(typeof res).toBe('object');
    expect(res?.image?.path).toBeTruthy();
    expect(res.imagePath).toBe(res.image.path);
    expect(res.file).toBe(res.image.path);

    const exists = await fs.pathExists(res.image.path);
    expect(exists).toBe(true);
    const fileStats = await fs.stat(res.image.path);
    expect(fileStats.size).toBeGreaterThan(0);

    const sidecar = res.image.path.replace(/\.[^.]+$/, '.json');
    const sidecarExists = await fs.pathExists(sidecar);
    expect(sidecarExists).toBe(true);

    const sidecarData = await fs.readJson(sidecar);
    expect(sidecarData.provider).toBe(expectedProvider);
    expect(sidecarData.model).toBe(hfModel);
    expect(sidecarData.prompt).toBe(prompt);
    expect(sidecarData.inputPath).toBe(imagePath);
    expect(sidecarData.timestamp).toBeTruthy();
    expect(sidecarData.parameters.provider).toBe(hfProvider);

    expect(res.json.prompt).toBe(prompt);
    expect(res.json.path).toBe(sidecar);
  }
);

// npm test -- lib/generator/image-image/imageActorInScene.test.js
