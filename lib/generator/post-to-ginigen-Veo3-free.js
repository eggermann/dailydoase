import fs from 'fs-extra';
import path from 'path';
import { Client } from '@gradio/client';
import PostTo from './PostTo.js';
import promptCreator from '../prompt-creator.js';

/**
 * Default option values mirroring the UI controls in the
 * ginigen/VEO3‑Free Gradio Space.  Any key omitted by the caller
 * will fall back to this table.
 */
const DEFAULT_OPTIONS = {
  /** ✨ Video Prompt (also used for audio generation) */
  prompt: '',
  /** Video Negative Prompt */
  nag_negative_prompt:
    'Static, motionless, still, ugly, bad quality, worst quality, poorly drawn, low resolution, blurry, lack of details',
  /** NAG Scale — strength of the negative prompt */
  nag_scale: 11,
  /** 📐 Height (×32) */
  height: 480,
  /** 📐 Width (×32) */
  width: 832,
  /** 📱 Duration (seconds) */
  duration_seconds: 4,
  /** 🔄 Inference Steps */
  steps: 4,
  /** 🌱 Seed */
  seed: 2025,
  /** 🎲 Random Seed? */
  randomize_seed: true,
  /** 🔊 Enable Automatic Audio Generation */
  enable_audio: true,
  /** Audio Negative Prompt */
  audio_negative_prompt:
    'Static, motionless, still, ugly, bad quality, worst quality, poorly drawn, low resolution, blurry, lack of details',
  /** Audio Inference Steps */
  audio_steps: 25,
  /** Audio CFG Strength */
  audio_cfg_strength: 1
};

/** PostTo subclass that hits the ginigen/VEO3-Free Space */
class GenVeo3Video extends PostTo {
  constructor(modelConfig = {}) {
    super(modelConfig);

    this.config = modelConfig;
    this.veo3 = null; // will hold the Ginigen client
    this.config.space = modelConfig.space ?? 'ginigen/VEO3-Free';
    this.config.folderName = modelConfig.folderName ?? 'veo3FreeVideos';
    this.config.guidance_scale = modelConfig.guidance_scale ?? 11;
    this.config.steps = modelConfig.steps ?? 4;
    this.config.seed = modelConfig.seed ?? 2025;
  }

  async init() {
    // Connect to the ginigen/VEO3‑Free Space once and cache the client
    this.veo3 = await Client.connect(this.config.space, {
      hf_token: process.env.HF_API_TOKEN ?? process.env.HF_TOKEN
    });

    // await this.checkSignature();    // from PostTo
    return this;
  }

  /** Core generator — accepts options only */
  async prompt(streams, options = {}) {
    await this.checkSignature();  // ensure imageDir etc.

    // Build a base prompt from upstream audio/image/text (exactly like GenImgVideo)
    let basePrompt = await promptCreator.default(streams, options);
    // Log basePrompt in red



    const prompTags = await this.config.prompts.createStyleTags(basePrompt);

    console.log('\x1b[36m%s\x1b[0m', `prompt tags : ${prompTags}`);


    const lyrics = await this.config.prompts.createLyrics( basePrompt,prompTags);



    // Colorize model response for better visibility
    console.log('\x1b[35m%s\x1b[0m', `response createLyrics: ${lyrics}`);
  
  

    basePrompt = this.addStaticPrompt(lyrics, options);

    console.log('\x1b[31m%s\x1b[0m', 'basePrompt:', basePrompt);
    // If the caller did not override `prompt`, use the generated one
    options.prompt = options.prompt ?? basePrompt;


    // The ginigen/VEO3-Free space uses /generate_video_with_audio for video generation (fn_index 0)
    const endpoint = "/generate_video_with_audio";
    // Merge provided options over defaults
    const opts = { ...DEFAULT_OPTIONS, ...options };

    const payload = {
      /** ✨ Video Prompt (also used for audio generation) */
      prompt: basePrompt,
      /** Video Negative Prompt */
      nag_negative_prompt: opts.nag_negative_prompt,
      /** NAG Scale — strength of the negative prompt */
      nag_scale: opts.nag_scale,
      /** 📐 Height (×32) */
      height: opts.height,
      /** 📐 Width (×32) */
      width: opts.width,
      /** 📱 Duration (seconds) */
      duration_seconds: opts.duration_seconds,
      /** 🔄 Inference Steps */
      steps: opts.steps,
      /** 🌱 Seed */
      seed: opts.seed,
      /** 🎲 Random Seed? */
      randomize_seed: opts.randomize_seed,
      /** 🔊 Enable Automatic Audio Generation */
      enable_audio: opts.enable_audio,
      /** Audio Negative Prompt */
      audio_negative_prompt: opts.audio_negative_prompt,
      /** Audio Inference Steps */
      audio_steps: opts.audio_steps,
      /** Audio CFG Strength */
      audio_cfg_strength: opts.audio_cfg_strength
    };
    console.log('Gradio payload:', JSON.stringify(payload, null, 2));
    console.log('Gradio token:', process.env.HF_API_TOKEN);

    let result;
    try {
      result = await this.veo3.predict(endpoint, payload);
      console.log('Gradio API response:', JSON.stringify(result, null, 2));
    } catch (err) {
      if (err instanceof Error) {
        console.error('Error calling Gradio Space:', err.message, err.stack);
      } else {
        console.error('Error calling Gradio Space:', JSON.stringify(err));
      }
      return false;
    }

    // --- normalise Gradio return shapes for <gr.Video> ---
    let mp4b64;
    let videoUrl = null;
    if (Array.isArray(result.data)) {
      // New API: first element is an object with a "video" property containing a URL
      const first = result.data[0];
      if (first && typeof first === 'object' && first.video && first.video.url) {
        videoUrl = first.video.url;
      }
    }

    // Attempt to locate an accompanying audio URL (several possible shapes)
    let audioUrl = null;
    if (Array.isArray(result.data)) {
      for (const item of result.data) {
        // Case 1: object with .audio.url
        if (item && typeof item === 'object' && item.audio && item.audio.url) {
          audioUrl = item.audio.url;
          break;
        }
        // Case 2: plain string URL (audio returned as second component)
        if (typeof item === 'string' && /(mp3|wav|aac|m4a)$/i.test(item)) {
          audioUrl = item;
          break;
        }
        // Case 3: object with direct .url and audio mime
        if (item && typeof item === 'object' && item.url && /(audio|mp3|wav)/i.test(item.url)) {
          audioUrl = item.url;
          break;
        }
      }
    }

    if (!videoUrl) {
      throw new Error('Space returned no video URL. Check the Gradio Space output format.');
    }

    // Download the video from the URL and save locally
    let pathAudio = null;
    let pathVideo = null;
    try {
      const fnameVideo = `${Date.now()}-veo3-video-with-audio.mp4`;
      pathVideo = path.join(this.imageDir, fnameVideo);
      const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
      const response = await fetch(videoUrl);
      const buffer = await response.arrayBuffer();
      await fs.writeFile(pathVideo, Buffer.from(buffer));

      // If an audio URL was provided, download it too
      if (audioUrl) {
        const ext = path.extname(new URL(audioUrl).pathname) || '.wav';
        const fnameAudio = `${Date.now()}-veo3-audio${ext}`;
        pathAudio = path.join(this.imageDir, fnameAudio);

        const audioRes = await fetch(audioUrl);
        const audioBuf = await audioRes.arrayBuffer();
        await fs.writeFile(pathAudio, Buffer.from(audioBuf));
      }

      // Persist metadata
      await fs.writeJson(`${pathVideo}.json`, {
        prompt: basePrompt,
        guidance_scale: this.config.guidance_scale,
        steps: this.config.steps,
        duration_seconds: options.duration_seconds ?? 4,
        seed: this.config.seed,
        timestamp: new Date().toISOString(),
        videoUrl,
        audioUrl
      }, { spaces: 2 });

      console.log(`✅  Video saved via "${this.config.spaceActive}" → ${pathVideo}`);
      return { video: pathVideo, audio: pathAudio }; // pathAudio may be null if no audio returned
    } catch (err) {
      if (err instanceof Error) {
        console.error('Error downloading or saving video/audio:', err.message, err.stack);
      } else {
        console.error('Error downloading or saving video/audio:', JSON.stringify(err));
      }
      throw err;
    }
  }
}

/* --- Common singleton wrapper, matching your other generators --- */
let cachedInstance = null;

export default {
  init: async (config = {}) => {
    const instance = await (new GenVeo3Video(config)).init();

    return instance;
  }
};