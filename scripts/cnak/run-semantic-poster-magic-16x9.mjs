#!/usr/bin/env node
// One local 16:9 poster-magic iteration. Semantic words choose an event; GPT
// may describe only motion already contained in the supplied campaign poster.
import 'dotenv/config';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import OpenAI from 'openai';
import { getWordStreams } from '../../semantic-stream.js';
import { buildCollisionSourceCueRecords } from '../../lib/generator/adapter/shorty-book/source-cues.js';
import {
  imagePathToDataUrl,
  resolveRunwareKey,
  saveRunwareVideoResult,
  submitRunwareVideoJob,
} from '../../lib/generator/image-video/runware/common.js';

const root = resolve(import.meta.dirname, '..', '..');
const folder = 'cnak-garten-golum-poster-magic-16x9-local-009-stream-poster-only';
const output = join(root, 'GENERATIONS-CNAK-KINETIC-MODEL-LOCAL', folder);
const poster = process.env.CNAK_POSTER_SOURCE || join(root, 'lib', 'Plak-2_images', 'page-1.jpg');
const configuredWords = [['Department store', 'en'], ['Horror', 'en'], ['Art exhibition', 'en']];
if (!existsSync(poster)) throw new Error(`Poster missing: ${poster}`);
if (!resolveRunwareKey()) throw new Error('Missing RUNWARE_API_KEY (or RUNWARE_KEY).');
if (!process.env.OPENAI_API_KEY) throw new Error('Missing OPENAI_API_KEY.');
mkdirSync(output, { recursive: true });

// Same semantic-stream mechanism as trailer flow: configured seeds initialise
// once, then getNext() produces the actual collision driving this iteration.
const streams = await getWordStreams(configuredWords, { forceRefresh: true });
const [cue] = await buildCollisionSourceCueRecords({ streams, sceneCount: 1 });
const words = [cue.anchor.term, cue.collision.term];
const semanticContext = cue.collision.description || '';
// Stream identity stays verbatim in metadata. Runware rejects its first result
// here, so provider prompt receives the same formal tension without sexual phrasing.
const providerCollision = /erotic/i.test(cue.collision.term) ? 'charged botanical horror' : cue.collision.term;
const providerContext = /erotic/i.test(semanticContext) ? 'charged botanical horror' : semanticContext;

const stage = join(output, 'poster-stage-16x9.png');
// The 16:9 canvas contains only the full, unmodified campaign poster and a
// neutral black matte. There is no invented, blurred, or extended background.
execFileSync('magick', [
  poster, '-resize', 'x720', '-background', 'black', '-gravity', 'center', '-extent', '1280x720', stage,
], { stdio: 'inherit' });

const planner = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const planResponse = await planner.chat.completions.create({
  model: 'gpt-4.1-mini-2025-04-14',
  temperature: 0.45,
  response_format: { type: 'json_object' },
  messages: [
    { role: 'system', content: 'You direct a six-second campaign-poster magic moment. Return JSON only: {"motion":"..."}. Motion must preserve exact poster identity and lettering.' },
    { role: 'user', content: `Actual Semantic Stream cue rendered safely as: ${cue.anchor.term} → ${providerCollision}. Context: ${providerContext}. Create one clever dirty-horror escalation inside Garten-Golum printed poster only. Nonsexual abstract visual language only. Allowed: one blink, sickly eye glow, living vines/roots, grimy fluorescent light travelling across existing artist names, a dirty botanical shadow travelling through existing root lines, and existing title Formen der Abweichung growing from existing roots into its exact printed placement. Forbidden: new text, changed letters, new character, new location, camera move, cut, fight, monster redesign, or full-frame transformation.` },
  ],
});
let semanticMotion = '';
try { semanticMotion = JSON.parse(planResponse.choices[0]?.message?.content || '{}').motion || ''; } catch {}
if (!semanticMotion) semanticMotion = 'Existing yellow eyes blink once; a green light passes across existing names; existing title softly rises from existing roots into its unchanged printed position.';

const prompt = [
  'Supplied image is an original printed Formen der Abweichung Garten-Golum campaign poster. Keep the complete sharp poster in focus for the entire clip, centered in a neutral black 16:9 matte. The matte remains empty and motionless.',
  `Actual Semantic Stream direction (${cue.anchor.term} → ${providerCollision}; ${providerContext}): ${semanticMotion}`,
  'Dirty horror magic must occur on and inside this exact poster: one blink and sickly eye glow, aged botanical roots breathing gently, a dirty shadow travelling through existing root lines, flickering gallery light over existing printed names, original title grows organically but retains exactly same letters, typeface, words and final positions.',
  '16:9 landscape. Static camera. Preserve face, leaf ears, green root body, hand-drawn coloured-pencil surface, full poster composition and every existing text line. Do not generate, extend, or stylize a background.',
  'No new readable text, no altered spelling, no new character, no replacement monster, no new room, no Kaufhaus cutaway, no zoom, no pan, no cinematic action, no 3D, no cartoon redraw, no collage, no transformation. Keep central poster readable and sharp.',
].join(' ');
// Runware sees only compact visual instruction. Full semantic prompt stays in
// semantic-plan.json so stream causality remains inspectable without turning
// a motion provider prompt into a second planner request.
const providerPrompt = [
  '16:9 landscape. The complete original Garten-Golum printed campaign poster is sharp and centered in a neutral empty black matte; no generated, extended, blurred, or visible background.',
  'Poster-only dirty botanical magic: existing yellow eyes blink once and glow; aged green roots subtly breathe; dim yellow-green light moves across existing artist names; existing title grows from roots into same exact readable printed position.',
  'Static camera. Preserve exact face, leaf ears, root body, hand-drawn texture, full composition and all existing lettering.',
  'No new text, new character, new room, cutaway, zoom, action, 3D, cartoon redraw, collage, or transformation.',
].join(' ');

const payload = {
  frameImages: [{ frame: 'first', image: await imagePathToDataUrl(stage) }],
  prompt: providerPrompt,
  durationSeconds: 6,
  resolution: '720p',
  providerSettings: { alibaba: { audio: false, promptExtend: false } },
};
writeFileSync(join(output, 'semantic-plan.json'), `${JSON.stringify({ configuredWords, cue, words, providerCollision, providerContext, semanticMotion, plannerPrompt: prompt, providerPrompt, model: 'gpt-4.1-mini-2025-04-14' }, null, 2)}\n`);
const result = await submitRunwareVideoJob({ apiKey: resolveRunwareKey(), model: 'alibaba:wan@2.6-flash', ...payload });
const saved = await saveRunwareVideoResult({ imageDir: output, filePrefix: 'poster-magic-wan26-flash-16x9', model: 'alibaba:wan@2.6-flash', payload, result, targetDurationSeconds: 6, targetFps: 24 });
const sha256 = createHash('sha256').update(readFileSync(saved.file)).digest('hex');
writeFileSync(join(output, 'result.json'), `${JSON.stringify({ file: saved.file, sha256, words, semanticMotion, format: '16:9', durationSeconds: 6 }, null, 2)}\n`);
console.log(JSON.stringify({ file: saved.file, sha256, semanticMotion }, null, 2));
