import PostTo from '../../PostTo.js';
import { Client, handle_file } from '@gradio/client';
import fs from 'fs-extra';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

import { extractLastFrame } from '../../ffmpeg-helpers.js';


import { joinOutPath, toSharp, withTimeout }
  from './../../utils.js';
import { saveJSON, downloadToFile } from './../../save-utils.js';

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
    // Allow UI-style dimension keys to override when provided
    this.config.height = (this.config.height ?? this.config.height_ui) ?? wanDefaults.output_height.value;
    this.config.width = (this.config.width ?? this.config.width_ui) ?? wanDefaults.output_width.value;

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
    if (!this._cli) {
      throw new Error(`Wan-2.2-5B is unavailable (${SPACE}): client not initialized`);
    }

    //loop
    const loop = options?.loop;

    if (loop) {
      if ((this.roundCounter + (loop.prompts?.length || 0)) % ((loop.prompts?.length || 0) + 1) === 0
       && this.roundCounter > 0) {
        return true;
      }
    }

    const imageSharp = toSharp(inputImageStream);
    const tmpInputImage = path.join(this.imageDir, 'input-img', 'start.png');
    fs.ensureDirSync(path.dirname(tmpInputImage));
    await imageSharp.png().toFile(tmpInputImage);
    // Resolve output dimensions
    const meta = await imageSharp.metadata();
    const heightProvided = (
      Object.prototype.hasOwnProperty.call(options, 'height') ||
      Object.prototype.hasOwnProperty.call(options, 'height_ui')
    );
    const widthProvided = (
      Object.prototype.hasOwnProperty.call(options, 'width') ||
      Object.prototype.hasOwnProperty.call(options, 'width_ui')
    );

    let h = heightProvided
      ? (options.height ?? options.height_ui)
      : (meta?.height || this.config.height || wanDefaults.output_height.value);
    let w = widthProvided
      ? (options.width ?? options.width_ui)
      : (meta?.width || this.config.width || wanDefaults.output_width.value);

    // Ensure multiples of 32 (common requirement for T2V models)
    const nextMul32 = (v) => {
      v = Math.max(1, Math.round(Number(v) || 0));
      return (v % 32 === 0) ? v : v + (32 - (v % 32));
    };
    h = nextMul32(h);
    w = nextMul32(w);


    const payload = {
      image: handle_file(tmpInputImage),
      prompt: options.prompt ?? '',
      height: h,
      width: w,
      duration_seconds: options.duration_seconds ?? this.config.duration_seconds,
      sampling_steps: options.sampling_steps ?? this.config.sampling_steps,
      guide_scale: options.guide_scale ?? this.config.guide_scale,
      shift: options.shift ?? this.config.shift,
      seed: options.seed ?? this.config.seed,
    };

    console.log('[Wan22 ImageVideo] Requesting /generate_video:', JSON.stringify(payload, null, 2));
    const result = await withTimeout(
      this._cli.predict('/generate_video', payload),
      15 * 60 * 1000,
      `${SPACE} /generate_video`
    );

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

    console.log(`[Wan22 ImageVideo] Downloading video from: ${url}`);
    await downloadToFile(url, savePath, { timeoutMs: 15 * 60 * 1000 });
    console.log(`[Wan22 ImageVideo] Saved video to: ${savePath}`);

    const json = {
      model: SPACE,
      prompt: options.prompt ?? '',
      height: h,
      width: w,
      duration_seconds: options.duration_seconds ?? this.config.duration_seconds,
      sampling_steps: options.sampling_steps ?? this.config.sampling_steps,
      guide_scale: options.guide_scale ?? this.config.guide_scale,
      shift: options.shift ?? this.config.shift,
      seed: options.seed ?? this.config.seed,
      url,
      sourceUrl: url
    };

    const jsonData = await saveJSON(savePath, json);

    if (loop) {
      const lastPng = savePath.replace(/\.mp4$/, '-last-frame.png');
      await extractLastFrame(savePath, lastPng);

      if (typeof options.seed === 'number' && options.seed >= 0) {
        options.seed += 1;
      }

      /*???return*/  await this.prompt(lastPng, {
        ...options,
        prompt: loop.prompts
          ? loop.prompts[this.roundCounter % loop.prompts.length]
          : options.prompt
      });
    }

    this.roundCounter = (this.roundCounter || 0) + 1;



    return { file: savePath, json: jsonData };
  }
}
