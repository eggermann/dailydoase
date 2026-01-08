import 'dotenv/config';
import { jest } from '@jest/globals';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';

const RUN_REAL = process.env.RUN_HEARTSYNC_REAL !== '0';

import { PostToHeartsync_NsfwUncensoredVideo2_ImageVideo } from './imageVideo.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Allow extra time for real API
jest.setTimeout(180_000);

const label = RUN_REAL ? 'returns a created video file path (real API)' : 'returns a created video file path (mock)';
test(label, async () => {
  const generatorRoot = path.resolve(__dirname, '..', '..', '..');
  const localTestDir = path.join(__dirname, 'test-generations');
  await fs.ensureDir(localTestDir);
  const tmpDir = await fs.mkdtemp(path.join(localTestDir, 'run-'));

  const logPath = path.join(tmpDir, 'jest-run.log');
  await fs.ensureFile(logPath);
  const originalLog = console.log;
  const writeLogLine = (args) => {
    const line = args.map((arg) => {
      if (typeof arg === 'string') return arg;
      try {
        return JSON.stringify(arg);
      } catch (_) {
        return String(arg);
      }
    }).join(' ');
    fs.appendFileSync(logPath, `${line}\n`);
  };
  console.log = (...args) => {
    writeLogLine(args);
    originalLog(...args);
  };

  try {
    const api = await new PostToHeartsync_NsfwUncensoredVideo2_ImageVideo({
      folderName: path.relative(generatorRoot, tmpDir),
      height: 256,
      width: 256,
      duration_seconds: 1,
      sampling_steps: 2,
      guide_scale: 1.0,
      shift: 1.0,
      seed: 0,
      mock: RUN_REAL ? false : true,
      predictTimeoutMs: 110_000,
      downloadTimeoutMs: 30_000,
    }).init();

    const imgPath = path.join(__dirname, '../../../test.datas/timba_small.jpg');
    const imgBuffer = await fs.readFile(imgPath);

    const res = await api.prompt(imgBuffer, { prompt: 'test prompt' });
    console.log('Result video path:', res);
    expect(typeof res).toBe('object');
    expect(res.file).toBeTruthy();
    const exists = await fs.pathExists(res.file);
    expect(exists).toBe(true);
  } finally {
    console.log = originalLog;
  }
  // If needed later, we could expose a close() to clean up resources.
});
// npm test -- lib/generator/image-video/Heartsync/NSFW-Uncensored-video2/imageVideo.test.js 
