import 'dotenv/config';
import { jest } from '@jest/globals';
import fs from 'fs-extra';
import { fileURLToPath } from 'url';
import path from 'path';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import { PostToHF_ImageActorInScene } from './imageActorInScene.js';


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

(runHF ? test : test.skip)(
  'places an actor image into a described scene via HF image-to-image',
  async () => {
    const api = new PostToHF_ImageActorInScene({
      folderName: './test-generations-actor-in-scene',
      model: "black-forest-labs/FLUX.1-Kontext-dev"// process.env.HF_MODEL || 'timbrooks/instruct-pix2pix',
    })

    const imagePath = path.join(__dirname, '..', 'test.datas/A.jpeg')

    const source = await fs.pathExists(imagePath);
    if (!source) {
      console.warn('Skipping: source image not found at', imagePath);
      return;
    }

    const prompt = 'Place the actors dancing into a shinny moody neon-lit city rooftop scene';
    const res = await api.prompt(prompt, { imagePath, num_inference_steps: 15 });

    expect(typeof res).toBe('object');
    expect(res?.image?.path).toBeTruthy();
    const exists = await fs.pathExists(res.image.path);
    expect(exists).toBe(true);

    const sidecar = res.image.path.replace(/\.[^.]+$/, '.json');
    const sidecarExists = await fs.pathExists(sidecar);
    expect(sidecarExists).toBe(true);
    expect(res.json.prompt).toBe(prompt);
  }
);

// npm test -- lib/generator/image-image/imageActorInScene.test.js

