import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import os from 'os';
import fs from 'fs-extra';
import PostToWan22_5B_ImageVideo from './post-to-wan2-2-fast.js';


(async () => {

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wan-test-'));
  const api = await PostToWan22_5B_ImageVideo.init(
    {
      folderName: path.basename(tmpDir),
      height: 128,
      width: 128,
      duration_seconds: 1.0,
      sampling_steps: 2,
      guide_scale: 1.0,
      shift: 1.0,
      seed: 0,
    });

  const __testDir = path.dirname(new URL(import.meta.url).pathname);
  const imgBuffer = (path.join(__testDir, 'test.datas', '1755295723001-flux.jpeg'));
  const resultPath = await api.prompt(imgBuffer, {
    prompt: 'dog'
  });



})()