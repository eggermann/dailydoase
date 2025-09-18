import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

import { muxVideoAndAudio } from '../utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper: check if ffmpeg binary is available
function hasFfmpeg() {
  try {
    const res = spawnSync('ffmpeg', ['-version'], { encoding: 'utf8' });
    return res.status === 0;
  } catch (_) {
    return false;
  }
}

describe('muxVideoAndAudio', () => {
  const absVideo = '/Users/eggermann/Projekte/dailydoase/lib/generator/test.datas/1758194381202-wan22-first-last.mp4';
  const absAudio = '/Users/eggermann/Projekte/dailydoase/lib/generator/test.datas/1758194387418-mirelo-sfx.wav';

  // Fallback to repo-relative paths if absolute are not present
  const relVideo = path.resolve(__dirname, '../test.datas/1758194381202-wan22-first-last.mp4');
  const relAudio = path.resolve(__dirname, '../test.datas/1758194387418-mirelo-sfx.wav');

  const videoPath = fs.existsSync(absVideo) ? absVideo : relVideo;
  const audioPath = fs.existsSync(absAudio) ? absAudio : relAudio;

  const outDir = path.join(__dirname, 'mux-out');

  beforeAll(async () => {
    await fs.ensureDir(outDir);
  });

  afterAll(async () => {
    // keep outputs for inspection; comment next line to retain
    // await fs.remove(outDir);
  });

  test('merges provided mp4 and wav into an mp4', async () => {
    if (!hasFfmpeg()) {
      console.warn('Skipping muxVideoAndAudio test: ffmpeg not available');
      return;
    }
    if (!fs.existsSync(videoPath) || !fs.existsSync(audioPath)) {
      console.warn('Skipping muxVideoAndAudio test: input files not found', { videoPath, audioPath });
      return;
    }

    const outputName = `test-merged-${Date.now()}.mp4`;
    const outPath = await muxVideoAndAudio(videoPath, audioPath, outDir, {
      outputName,
      crf: 28,
      preset: 'ultrafast'
    });

    expect(typeof outPath).toBe('string');
    expect(path.basename(outPath)).toBe(outputName);
    expect(await fs.pathExists(outPath)).toBe(true);
    // Sidecar JSON is written next to output
    expect(await fs.pathExists(`${outPath}.json`)).toBe(true);
  }, 60_000);
});

//npm test -- lib/generator/adapter/muxVideoAndAudio.test.js