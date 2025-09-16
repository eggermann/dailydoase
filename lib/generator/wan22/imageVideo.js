import PostTo from '../PostTo.js';
import { Client, handle_file } from '@gradio/client';
import fs from 'fs-extra';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

import { extractLastFrame } from '../ffmpeg-helpers.js';
import { joinOutPath, toSharp, downloadToFile, saveJsonSidecar, inferDimsWithSpace } from './utils.js';

// Load local .env from this folder (lib/generator/wan22/.env)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
try {
  dotenv.config({ path: path.join(__dirname, '.env') });
} catch (_) {
  // ignore if missing
}

const maskToken = (t) => {
  if (!t || typeof t !== 'string') return 'none';
  if (t.length <= 8) return '*'.repeat(t.length);
  return `${t.slice(0, 4)}…${t.slice(-4)}`;
};

const SPACE = 'Wan-AI/Wan-2.2-5B';
const wanDefaults = {
  duration_seconds: {
    value: 3.5,
    max: 5
  },
  output_height: {
    value: 928,
    max: 1280
  },
  output_width: {
    value: 928,
    max: 1280
  },
  sampling_steps: {
    value: 38,
    max: 50
  },
  guidance_scale: {
    value: 5,
    max: 10
  },
  sample_shift: {
    value: 5,
    max: 20
  },
  seed: {
    value: -1
  }
};


export class PostToWan22_5B_ImageVideo extends PostTo {
  constructor(modelConfig = {}) {
    super(modelConfig);
    this.config = modelConfig || {};
    this.config.space = SPACE;
    this.config.folderName = this.config.folderName ?? SPACE.split('/')[1];

    // Apply defaults from wanDefaults
    this.config.duration_seconds = this.config.duration_seconds ?? wanDefaults.duration_seconds.value;
    this.config.sampling_steps = this.config.sampling_steps ?? wanDefaults.sampling_steps.value;
    this.config.guide_scale = this.config.guide_scale ?? wanDefaults.guidance_scale.value;
    this.config.shift = this.config.shift ?? wanDefaults.sample_shift.value;
    this.config.height = this.config.height ?? wanDefaults.output_height.value;
    this.config.width = this.config.width ?? wanDefaults.output_width.value;

    this._cli = null;
    this.imageDir = joinOutPath(this.config.folderName);
    fs.ensureDirSync(this.imageDir);
    this.roundCounter = 0;
  }

  async init() {
    const token = this.config.hfToken || process.env.HF_TOKEN || process.env.HF_API_TOKEN || null;
    console.log('[Wan22 ImageVideo] Using HF token:', maskToken(token));
    this._cli = await Client.connect(SPACE, token ? { hf_token: token } : {});
    return this;
  }

  async prompt(inputImageStream, options = {}) {
    const loop = options?.loop;

    if (loop) {
      if ((this.roundCounter + (loop.prompts?.length || 0)) % ((loop.prompts?.length || 0) + 1) === 0 && this.roundCounter > 0) {
        return true;
      }
    }

    const imageSharp = toSharp(inputImageStream);
    const tmpInputImage = path.join(this.imageDir, 'input-img', 'start.png');
    fs.ensureDirSync(path.dirname(tmpInputImage));
    await imageSharp.png().toFile(tmpInputImage);

    let h = options.height ?? this.config.height;
    let w = options.width ?? this.config.width;
    ({ h, w } = await inferDimsWithSpace(
      this._cli,
      tmpInputImage,
      h,
      w,
      this.config.height ?? wanDefaults.output_height.value,
      this.config.width ?? wanDefaults.output_width.value
    ));

    const payload = {
      image: handle_file(tmpInputImage),
      prompt: options.prompt ?? '',
   //   height: h,
     // width: w,
      duration_seconds: options.duration_seconds ?? this.config.duration_seconds,
      sampling_steps: options.sampling_steps ?? this.config.sampling_steps,
      guide_scale: options.guide_scale ?? this.config.guide_scale,
      shift: options.shift ?? this.config.shift,
      seed: options.seed ?? this.config.seed,
    };

    console.log('Gradio payload:', JSON.stringify(payload, null, 2));
    const result = await this._cli.predict('/generate_video', payload);

    let url = null;
    const out = result?.data?.[0]?.video;
    if (typeof out === 'string') {
      url = out;
    } else if (out && typeof out === 'object') {
      url = out.url || null;
    }

    if (!url) {
      throw new Error('Wan-2.2-5B: Unexpected response format from /generate_video');
    }

    const fnameVideo = `${Date.now()}-wan22-image-video.mp4`;
    const savePath = path.join(this.imageDir, fnameVideo);

    await downloadToFile(url, savePath);

    const json = {
      model: SPACE,
      prompt: options.prompt ?? '',
      height: h,
      width: w,
      duration_seconds: options.duration_seconds ?? this.config.duration_seconds,
      sampling_steps: options.sampling_steps ?? this.config.sampling_steps,
      guide_scale: options.guide_scale ?? this.config.guide_scale,
      shift: options.shift ?? this.config.shift,
      seed: options.seed ?? this.config.seed
    };

    await saveJsonSidecar(savePath, json);

    if (loop) {
      const lastPng = savePath.replace(/\.mp4$/, '-last-frame.png');
      await extractLastFrame(savePath, lastPng);

      if (typeof options.seed === 'number' && options.seed >= 0) {
        options.seed += 1;
      }

      await this.prompt(lastPng, {
        ...options,
        prompt: loop.prompts
          ? loop.prompts[this.roundCounter % loop.prompts.length]
          : options.prompt
      });
    }

    this.roundCounter = (this.roundCounter || 0) + 1;
    return savePath;
  }
}
