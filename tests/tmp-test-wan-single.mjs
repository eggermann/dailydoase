import dotenv from 'dotenv';
dotenv.config();
import path from 'node:path';
import { PostToWan22_5B_ImageVideo } from '../lib/generator/image-video/wan22/imageVideo.js';

const imagePath = path.resolve('/Users/eggermann/Projekte/dailydoase/tests/GENERATIONS/470-freshweb-low-cost-test/parts/471-FLUX/1772833733377.jpeg');
const tests = [
  {
    label: 'same',
    prompt: 'A weathered hand gently places the small green seedling into the rich soil of the garden. As the hand withdraws, the camera slowly pans up to reveal the striking Bauhaus building rising majestically in the background, its clean lines and geometric forms bathed in warm sunlight.',
  },
  {
    label: 'simple',
    prompt: 'Subtle realistic motion in the existing garden scene, gentle hand movement, slight camera drift only.',
  },
];

for (const t of tests) {
  const model = new PostToWan22_5B_ImageVideo({
    duration_seconds: 2,
    sampling_steps: 10,
    guide_scale: 3,
    shift: 3,
    height: 512,
    width: 512,
    seed: 0,
    hfToken: process.env.HF_TOKEN || process.env.HF_API_TOKEN,
  });
  await model.init();
  try {
    const out = await model.prompt(imagePath, {
      prompt: t.prompt,
      duration_seconds: 2,
      sampling_steps: 10,
      guide_scale: 3,
      shift: 3,
      height: 512,
      width: 512,
      seed: 0,
    });
    console.log(JSON.stringify({ label: t.label, ok: true, file: out?.file || out }, null, 2));
  } catch (error) {
    console.error(JSON.stringify({
      label: t.label,
      ok: false,
      message: error?.message,
      title: error?.title,
      stage: error?.stage,
      success: error?.success,
      endpoint: error?.endpoint,
      raw: error,
    }, null, 2));
  }
}
