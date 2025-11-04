import PostTo from '../../PostTo.js';
import { Client, handle_file } from '@gradio/client';
import fs from 'fs-extra';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

import { extractLastFrame } from '../../ffmpeg-helpers.js';

import { joinOutPath, toSharp, withTimeout } from '../../utils.js';
import { saveJSON, downloadToFile } from '../../save-utils.js';

// Load local .env from this folder (lib/generator/Heartsync/NSFW-Uncensored-video2/.env)
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

const SPACE = 'Heartsync/NSFW-Uncensored-video2';
const defaults = {
  duration_seconds: 3.5,
  sampling_steps: 30,
  guide_scale: 5,
  shift: 5,
  height: 768,
  width: 512,
  seed: -1,
};

export class PostToHeartsync_NsfwUncensoredVideo2_ImageVideo extends PostTo {
  constructor(modelConfig = {}) {
    super(modelConfig);
    this.config = modelConfig || {};
    this.config.space = SPACE;
    this.config.folderName = this.config.folderName ?? SPACE.split('/')[1];

    // Apply defaults
    this.config.duration_seconds = this.config.duration_seconds ?? defaults.duration_seconds;
    this.config.sampling_steps = this.config.sampling_steps ?? defaults.sampling_steps;
    this.config.guide_scale = this.config.guide_scale ?? defaults.guide_scale;
    this.config.shift = this.config.shift ?? defaults.shift;
    this.config.height = (this.config.height ?? this.config.height_ui) ?? defaults.height;
    this.config.width = (this.config.width ?? this.config.width_ui) ?? defaults.width;

    this._cli = null;
    this.imageDir = joinOutPath(this.config.folderName);
    fs.ensureDirSync(this.imageDir);
    this.roundCounter = 0;
  }

  async init() {
    const token = this.config.hfToken || process.env.HF_TOKEN || process.env.HF_API_TOKEN || null;
    console.log('[Heartsync ImageVideo] Using HF token:', maskToken(token));
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
      : (meta?.height || this.config.height || defaults.height);
    let w = widthProvided
      ? (options.width ?? options.width_ui)
      : (meta?.width || this.config.width || defaults.width);

    // Ensure multiples of 32
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

    console.log('[Heartsync ImageVideo] Requesting /generate_video:', JSON.stringify(payload, null, 2));
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
      throw new Error('Heartsync NSFW-Uncensored-video2: Unexpected response format from /generate_video');
    }

    const fnameVideo = `${Date.now()}-heartsync-nsfw-uncensored-video2.mp4`;
    const savePath = path.join(this.imageDir, fnameVideo);

    console.log(`[Heartsync ImageVideo] Downloading video from: ${url}`);
    await downloadToFile(url, savePath, { timeoutMs: 15 * 60 * 1000 });
    console.log(`[Heartsync ImageVideo] Saved video to: ${savePath}`);

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

      await this.prompt(lastPng, {
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

