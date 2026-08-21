#!/usr/bin/env node
// One old-flow-shaped Semantic Stream probe, reduced to one immutable image input.
// This intentionally imports only Runware video helpers: no planner, no FLUX, no loop.
import 'dotenv/config';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import {
  imagePathToDataUrl,
  resolveRunwareKey,
  saveRunwareVideoResult,
  submitRunwareVideoJob,
} from '../../lib/generator/image-video/runware/common.js';

const root = resolve(import.meta.dirname, '..', '..');
const folder = 'cnak-garten-golum-semantic-kinetic-model-local-001';
const output = join(root, 'GENERATIONS-CNAK-KINETIC-MODEL-LOCAL', folder);
const poster = process.env.CNAK_POSTER_SOURCE || join(root, 'lib', 'Plak-2_images', 'page-1.jpg');
const words = ['Department store', 'Landscape', 'Art exhibition', 'Animals', 'Vernissage', 'Fast food'];
const semanticWord = words[0];
const apiKey = resolveRunwareKey();
if (!apiKey) throw new Error('Missing RUNWARE_API_KEY (or RUNWARE_KEY).');

mkdirSync(output, { recursive: true });
const prompt = [
  'Animate supplied original printed poster as an almost-still kinetic art Reel.',
  `Semantic Stream seed: ${semanticWord}. Make this visible only as a faint changing light rhythm already inside the drawing.`,
  'Garten-Golum identity, exact green botanical face, eyes, ears, root body, coloured-pencil texture, all figures, poster layout, original palette, existing lettering and information remain unchanged.',
  'Only movement: one slow blink, a very slight pulse in existing yellow eyes, and microscopic living sway in existing drawn vines.',
  'Static camera. No crop. No zoom. No new place. No new character. No new object. No new readable text. No changed typography. No 3D, comic redraw, film scene, hallucinated background, action, transformation or camera move.',
].join(' ');
const payload = {
  frameImages: [{ frame: 'first', image: await imagePathToDataUrl(poster) }],
  prompt,
  durationSeconds: 4,
  resolution: '720p',
  providerSettings: { alibaba: { audio: false, promptExtend: false } },
};
writeFileSync(join(output, 'semantic-input.json'), `${JSON.stringify({ words, semanticWord, poster, prompt, createdAt: new Date().toISOString() }, null, 2)}\n`);
const result = await submitRunwareVideoJob({ apiKey, model: 'alibaba:wan@2.6-flash', ...payload });
const saved = await saveRunwareVideoResult({
  imageDir: output,
  filePrefix: 'semantic-kinetic-wan26-flash',
  model: 'alibaba:wan@2.6-flash',
  payload,
  result,
  targetDurationSeconds: 4,
  targetFps: 24,
});
const sha256 = createHash('sha256').update(readFileSync(saved.file)).digest('hex');
writeFileSync(join(output, 'result.json'), `${JSON.stringify({ file: saved.file, sha256, semanticWord, model: 'alibaba:wan@2.6-flash' }, null, 2)}\n`);
console.log(JSON.stringify({ file: saved.file, sha256, semanticWord, model: 'alibaba:wan@2.6-flash' }, null, 2));
