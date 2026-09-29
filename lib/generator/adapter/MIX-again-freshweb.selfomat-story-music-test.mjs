#!/usr/bin/env node

import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import {
  createStoryMusicBlueprint,
  requestMiniMaxMusic3,
  saveStoryMusicArtifacts,
} from './shorty-book/story-music.js';

const workingDirectory = process.cwd();
const moduleRootCandidates = [
  process.env.FRESHWEB_NODE_MODULES_PATH,
  path.join(workingDirectory, 'node_modules'),
  path.resolve(workingDirectory, '../dailydoase/node_modules'),
].filter(Boolean);
const moduleRoot = moduleRootCandidates.find((candidate) => existsSync(candidate));
if (!moduleRoot) throw new Error('No node_modules folder found. Set FRESHWEB_NODE_MODULES_PATH.');

const require = createRequire(import.meta.url);
const dotenv = require(path.join(moduleRoot, 'dotenv'));
dotenv.config({ path: process.env.FRESHWEB_DOTENV_PATH || path.resolve(workingDirectory, '../dailydoase/.env') });

const storyPath = path.resolve(process.env.FRESHWEB_STORY_TRANSPORT_PATH || 'GENRATIONS-KAUFHAUF/1-selfomat-love-animal-lowres-twofilms/story-transport/iteration-0002.json');
const transport = JSON.parse(await fs.readFile(storyPath, 'utf8'));
const outputDirectory = path.resolve(
  process.env.FRESHWEB_STORY_MUSIC_OUTPUT_DIRECTORY
    || path.join(path.dirname(storyPath), '..', 'story-music')
);
const durationSeconds = Math.max(5, Math.min(300, Number(process.env.FRESHWEB_STORY_MUSIC_DURATION || 60)));
const OpenAI = (await import(pathToFileURL(path.join(moduleRoot, 'openai/index.mjs')).href)).default;
const { Client } = await import(pathToFileURL(path.join(moduleRoot, '@gradio/client/dist/index.js')).href);

if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is required for the o4-mini music blueprint.');
if (!process.env.HF_API_TOKEN && !process.env.HF_TOKEN) throw new Error('HF_API_TOKEN or HF_TOKEN is required for MiniMax Music 3.');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const { source, blueprint, responseId } = await createStoryMusicBlueprint({
  openai,
  transport,
  model: process.env.FRESHWEB_STORY_MUSIC_MODEL || 'o4-mini',
  durationSeconds,
});
const client = await Client.connect(
  process.env.FRESHWEB_MINIMAX_SPACE || 'MiniMaxAI/MiniMax-Music3',
  { hf_token: process.env.HF_API_TOKEN || process.env.HF_TOKEN }
);
const music = await requestMiniMaxMusic3({
  client,
  blueprint,
  seed: Number(process.env.FRESHWEB_STORY_MUSIC_SEED || 0),
  randomizeSeed: process.env.FRESHWEB_STORY_MUSIC_RANDOMIZE_SEED !== '0',
  steps: Number(process.env.FRESHWEB_STORY_MUSIC_STEPS || 30),
  guidance: Number(process.env.FRESHWEB_STORY_MUSIC_GUIDANCE || 1.7),
});
const artifacts = await saveStoryMusicArtifacts({
  outputDirectory,
  iteration: transport.iteration,
  source,
  blueprint,
  responseId,
  audioUrl: music.audioUrl,
  seed: music.seed,
});

console.log(JSON.stringify({ storyPath, outputDirectory, ...artifacts }, null, 2));
client.close();
