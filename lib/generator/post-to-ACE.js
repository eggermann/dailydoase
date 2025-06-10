import fs from 'fs-extra';
import path from 'path';
import { Client } from '@gradio/client';
import dotenv from 'dotenv';
import PostTo from './PostTo.js';
import store from '../store.cjs';

class PostToACE extends PostTo {
  constructor(modelConfig = {}) {
    super(modelConfig);
    this.config = modelConfig;
    this.config.space = modelConfig.space ?? 'ACE-Step/ACE-Step';
    this.config.folderName = modelConfig.folderName ?? 'aceMusic';
    this.config.audio_duration = modelConfig.audio_duration ?? 10;
    this.config.prompt = modelConfig.prompt ?? 'A calm piano melody';
    this.config.lyrics = modelConfig.lyrics ?? '';
    this.config.infer_step = modelConfig.infer_step ?? 50;
    this._cli = null;
  }

  async init() {
    await store.initCache(this.imageDir);
    this._cli = await Client.connect(this.config.space, {
      hf_token: process.env.HF_TOKEN ?? process.env.HF_API_TOKEN
    });
    this.config.spaceActive = this.config.space;
    return this;
  }

  async prompt(options = {}) {
    await this.checkSignature();
    const endpoint = '/__call__';
    const payload = {
      audio_duration: options.audio_duration ?? this.config.audio_duration,
      prompt: options.prompt ?? this.config.prompt,
      lyrics: options.lyrics ?? this.config.lyrics,
      infer_step: options.infer_step ?? this.config.infer_step
    };

    let result;
    try {
      result = await this._cli.predict(endpoint, payload);
      console.log('Gradio API response:', JSON.stringify(result, null, 2));
    } catch (err) {
      console.error('Error calling ACE-Step Gradio Space:', err);
      throw err;
    }

    let audioUrl = null;
    if (Array.isArray(result.data)) {
      const first = result.data[0];
      if (first && typeof first === 'object' && first.url) {
        audioUrl = first.url;
      }
    }

    if (!audioUrl) {
      throw new Error('Space returned no audio URL. Check the Gradio Space output format.');
    }

    // Download the audio from the URL and save locally
    const fnameAudio = `${Date.now()}-ace-music.wav`;
    const pathAudio = path.join(this.imageDir, fnameAudio);
    const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
    const response = await fetch(audioUrl);
    const buffer = await response.arrayBuffer();
    await fs.writeFile(pathAudio, Buffer.from(buffer));
    store.addFile(path.basename(this.imageDir), fnameAudio);

    await fs.writeJson(`${pathAudio}.json`, {
      prompt: payload.prompt,
      lyrics: payload.lyrics,
      infer_step: payload.infer_step,
      audio_duration: payload.audio_duration,
      timestamp: new Date().toISOString(),
      audioUrl
    }, { spaces: 2 });

    console.log(`✅  Audio saved via "${this.config.spaceActive}" → ${pathAudio}`);
    return pathAudio;
  }
}

let cachedInstance = null;

export default {
  init: async (config = {}) => {
    if (!cachedInstance) {
      cachedInstance = await (new PostToACE(config)).init();
    }
    return cachedInstance;
  }
};