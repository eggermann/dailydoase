import 'dotenv/config';
import os from 'os';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { PostToMirelo_VideoSound } from './video-sound.js';
import { downloadToFile } from '../utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  const remoteUrl = process.env.MIRELO_DEMO_VIDEO_URL || 'https://di3otfzjg1gxa.cloudfront.net/input_example.mp4';

  // Prepare a real local file (multipart/form-data path)
  const tmpBase = await fs.mkdtemp(path.join(os.tmpdir(), 'mirelo-demo-form-'));
  const localPath = path.join(tmpBase, 'input_example.mp4');
  await downloadToFile(remoteUrl, localPath);

  const client = await new PostToMirelo_VideoSound({
    folderName: 'mirelo-demo-form',
    duration: Number(process.env.MIRELO_DEMO_DURATION ?? 2),
    num_samples: 1,
    steps: Number(process.env.MIRELO_DEMO_STEPS ?? 25),
    seed: Number(process.env.MIRELO_DEMO_SEED ?? 2105),
    creativity_coef: Number(process.env.MIRELO_DEMO_CREATIVITY ?? 4.5),
    // Force multipart to exercise the provider's direct file upload
    force_form_data: true,
    maxRetries5xx: 1,
    retryDelayMs: 800,
    auth_mode: process.env.MIRELO_AUTH_MODE || undefined
  }).init();

  const savePath = await client.runVideoToVideoFormData(localPath, {
    text_prompt: process.env.MIRELO_DEMO_TEXT || 'cinematic music, orchestral, epic, dramatic'
  });

  console.log('Saved movie (form):', savePath);
}

main().catch((err) => {
  console.error('Demo (form) failed:', err?.message || err);
  process.exit(1);
});