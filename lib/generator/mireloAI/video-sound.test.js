import 'dotenv/config';
import os from 'os';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';

import { PostToMirelo_VideoSound } from './video-sound.js';


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

process.env.MIRELO_ENABLE_AUTO_UPLOAD = 'false';
process.env.MIRELO_AUTH_MODE = 'x-api-key';
// Optionally set the API key here for local testing; otherwise rely on .env
process.env.MIRELO_API_KEY = process.env.MIRELO_API_KEY || 'c882a256e5a05c6607e4f9519ce8b5334897263e6318d6a65e332463a62249d7';
process.env.MIRELO_DEBUG = 'true';

// Increase timeout if jest is available
globalThis.jest?.setTimeout?.(180000);

test('returns a created file path (asset or error sidecar)', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mirelo-videosound-test-'));
  const api = await new PostToMirelo_VideoSound({
    folderName: path.basename(tmpDir),
    duration: 5.1,
    num_samples: 1,
    steps: 25,
    seed: -1,
    creativity_coef: 4.5,
    maxRetries5xx: 0,
    retryDelayMs: 250,
    text_prompt: 'A soundscape from an 80s reality show, with laughter and applause, like Al Bundy',
  }).init();

  const videoUrl = 'https://multimodalart-wan-2-2-first-last-frame.hf.space/gradio_api/file=/tmp/gradio/a877cbaa187d1b4b6236a696de952d6d4c6203ef122edf63bc33ee6006a7995b/tmp2ff54w9i.mp4/';

  const resultPath = await api.prompt(videoUrl, {
    audioOnly: true,        // /video-to-sfx
    // Using JSON body (no multipart)
    text_prompt: '',
    duration: 5.1,
    num_samples: 1,
    steps: 25,
    seed: -1,
    creativity_coef: 4.5,
  });
  console.log('Saved to:', resultPath);

  expect(typeof resultPath).toBe('string');
  expect(await fs.pathExists(resultPath)).toBe(true);
  const output_path = path.extname(resultPath).toLowerCase();

console.log('output_path:', output_path); 

//expect(output_path).toBe.not(null); // should be .wav or .mp3
}, 180000);
