import fs from 'fs-extra';
import path from 'path';
import { Client } from '@gradio/client';
import dotenv from 'dotenv';
import PostTo from '../PostTo.js';
import store from '../../store.cjs';


import promptCreator from '../../prompt-creator.js';
import magicPrompt from '../magicPrompt.js';
class PostToACE extends PostTo {
  constructor(modelConfig = {}) {
    super(modelConfig);
    this.config = modelConfig;
    this.config.space = modelConfig.space ?? 'ACE-Step/ACE-Step';
    this.config.folderName = modelConfig.folderName ?? 'aceMusic';

    // Default parameters object for ACE
    this.defaultParams = {
      format: 'mp3',
      audio_duration: -1,
      prompt: 'make this image come alive, cinematic motion, smooth animation',
      lyrics: '',
      infer_step: 60,
      guidance_scale: 15,
      scheduler_type: 'euler',
      cfg_type: 'apg',
      omega_scale: 10,
      manual_seeds: '',
      guidance_interval: 0.5,
      guidance_interval_decay: 0,
      min_guidance_scale: 3,
      use_erg_tag: true,
      use_erg_lyric: false,
      use_erg_diffusion: true,
      oss_steps: '',
      guidance_scale_text: 0,
      guidance_scale_lyric: 0,
      audio2audio_enable: false,
      ref_audio_strength: 0.5,
      ref_audio_input: null,
      lora_name_or_path: 'none'
    };

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

  async prompt(streams, options) {
    await this.checkSignature();
    let prompt ='AWA';// await promptCreator.default(streams, options);
    // prompt = await promptCreator.default(streams, options);


    const sysPrompt = options.staticPrompt?.pre ||
      `Generate a meaningful sound scape from diverse word cloud based on the concept of: ${prompt}`

   // prompt = await magicPrompt(sysPrompt);
    console.log('Using prompt:', { prompt, options });
    const endpoint = '/__call__';
    // Merge default parameters with any overrides coming from config or per‑call options
    const payload = {
      ...this.defaultParams,
      audio_duration: options.audio_duration ?? this.defaultParams.audio_duration,
      prompt,
      lyrics: options.lyrics ?? this.defaultParams.lyrics,
      infer_step: options.infer_step ?? this.defaultParams.infer_step,
      manual_seeds: options.seed ?? this.config.manual_seeds ?? '',
      guidance_scale: options.guidance_scale ?? this.defaultParams.guidance_scale
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
    const fnameAudio = `${Date.now()}-ace-music.mp3`;
    const pathAudio = path.join(this.imageDir, fnameAudio);
    const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
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