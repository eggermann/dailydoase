import fs from 'fs-extra';
import path from 'node:path';
import OpenAI from 'openai';
import { Client } from '@gradio/client';

import { muxVideoAndAudio } from '../../utils.js';
import { saveJSON } from '../../save-utils.js';
import {
  createStoryMusicBlueprint,
  inferStoryMusicDuration,
  requestMiniMaxMusic3,
  saveStoryMusicArtifacts,
} from './story-music.js';

const compact = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();

const closeClient = async (client) => {
  if (typeof client?.close !== 'function') return;
  await client.close();
};

/**
 * Add one MiniMax Music 3 track to an already concatenated film.
 *
 * The audio adapter is deliberately final-only: scene clips remain silent,
 * then the complete StoryTransport drives one music blueprint and one mux.
 */
export const addMiniMaxAudioAndMux = async ({
  imageDir,
  fileName,
  videoInput,
  transport,
  options = {},
} = {}) => {
  const videoPath = compact(videoInput);
  if (!videoPath) throw new Error('MiniMax audio needs a concatenated video path');
  if (!transport) throw new Error('MiniMax audio needs completed StoryTransport');

  const openAiKey = compact(options.openaiApiKey || process.env.OPENAI_API_KEY);
  const hfToken = compact(options.hfToken || process.env.HF_API_TOKEN || process.env.HF_TOKEN);
  if (!openAiKey) throw new Error('MiniMax audio needs OPENAI_API_KEY for the music blueprint');
  if (!hfToken) throw new Error('MiniMax audio needs HF_API_TOKEN or HF_TOKEN');

  const outputDirectory = options.outputDirectory || path.join(imageDir, 'story-music');
  const iteration = Number(transport.iteration) || 0;
  const durationSeconds = Number(options.durationSeconds) > 0
    ? Number(options.durationSeconds)
    : inferStoryMusicDuration(transport);
  const model = compact(options.model || process.env.FRESHWEB_STORY_MUSIC_MODEL) || 'o4-mini';
  const space = compact(options.space || process.env.FRESHWEB_MINIMAX_SPACE) || 'MiniMaxAI/MiniMax-Music3';
  const seed = Number(options.seed ?? process.env.FRESHWEB_STORY_MUSIC_SEED ?? 0);
  const randomizeSeed = String(options.randomizeSeed ?? process.env.FRESHWEB_STORY_MUSIC_RANDOMIZE_SEED ?? '1') !== '0';
  const steps = Number(options.steps ?? process.env.FRESHWEB_STORY_MUSIC_STEPS ?? 30);
  const guidance = Number(options.guidance ?? process.env.FRESHWEB_STORY_MUSIC_GUIDANCE ?? 1.7);
  const safeName = compact(fileName) || `iteration-${String(iteration).padStart(4, '0')}`;
  const errorPath = path.join(imageDir, `${safeName}-minimax-music.error.json`);
  let client;

  try {
    const openai = new OpenAI({ apiKey: openAiKey });
    const { source, blueprint, responseId } = await createStoryMusicBlueprint({
      openai,
      transport,
      model,
      durationSeconds,
    });
    client = await Client.connect(space, { hf_token: hfToken });
    const music = await requestMiniMaxMusic3({
      client,
      blueprint,
      seed,
      randomizeSeed,
      steps,
      guidance,
    });
    const artifacts = await saveStoryMusicArtifacts({
      outputDirectory,
      iteration,
      source,
      blueprint,
      responseId,
      audioUrl: music.audioUrl,
      seed: music.seed,
    });
    const audioPath = artifacts.mp3Path || artifacts.audioSourcePath;
    if (!audioPath) throw new Error('MiniMax Music 3 produced no local audio file');

    const mergedOutDir = path.join(imageDir, 'merged');
    await fs.ensureDir(mergedOutDir);
    const mergedFilePath = await muxVideoAndAudio(videoPath, audioPath, mergedOutDir, {
      outputName: `${safeName}-with-minimax-sound.mp4`,
    });
    const finalMedia = {
      adapter: 'minimax-music3',
      status: 'completed',
      space,
      model,
      iteration,
      durationSeconds,
      sourceVideo: videoPath,
      audioPath,
      mergedFilePath,
      blueprintPath: artifacts.blueprintPath,
      seed: music.seed,
    };
    await saveJSON(path.join(imageDir, `${safeName}-minimax-music.json`), finalMedia);
    return finalMedia;
  } catch (error) {
    await saveJSON(errorPath, {
      adapter: 'minimax-music3',
      stage: 'final-audio-mux',
      videoPath,
      iteration,
      error: String(error?.message || error),
    });
    throw error;
  } finally {
    await closeClient(client);
  }
};

export default addMiniMaxAudioAndMux;
