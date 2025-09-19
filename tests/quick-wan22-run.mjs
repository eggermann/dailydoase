import 'dotenv/config';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { PostToWan22_5B_ImageVideo } from '../lib/generator/wan22/imageVideo.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  const imgPath = path.join(__dirname, '../lib/generator/test.datas/1755295723001-flux.jpeg');
  if (!(await fs.pathExists(imgPath))) {
    console.error('Input image missing:', imgPath);
    process.exit(2);
  }

  const api = await new PostToWan22_5B_ImageVideo({
    folderName: 'wan22-imagevideo-test-xoFFL2',
    // Deliberately set odd sizes to test clamp
    height: 933,
    width: 777,
    duration_seconds: 1.0,
    sampling_steps: 2,
    guide_scale: 1.0,
    shift: 1.0,
    seed: 0,
  }).init();

  const buf = await fs.readFile(imgPath);
  const res = await api.prompt(buf, { prompt: 'dimension clamp check' });
  console.log('Video saved at:', res.file);
  console.log('JSON saved at:', res.json.path);

  const meta = await fs.readJson(res.json.path);
  console.log('Metadata summary:', {
    prompt: meta.prompt,
    width: meta.width,
    height: meta.height,
    url: meta.url || meta.sourceUrl,
  });
}

main().catch((e) => {
  console.error('Run failed:', e?.message || e);
  process.exit(1);
});
