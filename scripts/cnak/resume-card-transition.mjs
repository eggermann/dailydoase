#!/usr/bin/env node
// Resume only missing Seedance Golem-to-card transition after a transient
// network failure. Existing paid opening and continuation assets stay intact.
import 'dotenv/config';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  imagePathToDataUrl,
  resolveRunwareKey,
  saveRunwareVideoResult,
  submitRunwareVideoJob,
} from '../../lib/generator/image-video/runware/common.js';

const root = resolve(import.meta.dirname, '..', '..');
const folder = process.argv[2];
if (!folder) throw new Error('Usage: node scripts/cnak/resume-card-transition.mjs <generation-folder>');
const output = join(root, 'GENERATIONS-CNAK-KINETIC-MODEL-LOCAL', folder);
const firstFrame = join(output, 'continuation-last-frame.png');
const lastFrame = join(output, 'names-card-i2i-start-16x9.png');
const cardMetadata = join(output, 'names-card-flux-i2i-target.json');
for (const required of [firstFrame, lastFrame, cardMetadata]) {
  if (!existsSync(required)) throw new Error(`Missing resume asset: ${required}`);
}

const cardArrival = JSON.parse(readFileSync(cardMetadata, 'utf8')).cardArrival || 'The botanical paper dissolves into a quiet ornamental exhibition card.';
const prompt = [
  'A single four-second 16:9 illustrated transition. Begin exactly at supplied final hand-drawn Garten-Golum frame and transform continuously into supplied text-free brown ornamental exhibition-card target.',
  cardArrival,
  'Golem lines, flowers, lamps and roots dissolve into paper grain and green border; no hard cut. Static camera, coloured-pencil and ink texture.',
  'No words, letters, names, title, number, character replacement, room, photorealism, 3D, glossy paint, crop change, pan, zoom, cutaway or montage.',
].join(' ');
const payload = {
  frameImages: [
    { frame: 'first', image: await imagePathToDataUrl(firstFrame) },
    { frame: 'last', image: await imagePathToDataUrl(lastFrame) },
  ],
  prompt,
  durationSeconds: 4,
  resolution: '720p',
};

let lastError;
for (let attempt = 1; attempt <= 3; attempt += 1) {
  try {
    const result = await submitRunwareVideoJob({ apiKey: resolveRunwareKey(), model: 'bytedance:seedance@2.0', ...payload });
    const saved = await saveRunwareVideoResult({
      imageDir: output,
      filePrefix: 'seedance-last-golum-to-i2i-names-card',
      model: 'bytedance:seedance@2.0',
      payload,
      result,
      targetDurationSeconds: 4,
      targetFps: 24,
    });
    console.log(JSON.stringify({ attempt, file: saved.file }, null, 2));
    process.exit(0);
  } catch (error) {
    lastError = error;
    if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 3_000));
  }
}
throw lastError;
