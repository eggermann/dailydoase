import PostTo from '../PostTo.js';
import { Client, handle_file } from '@gradio/client';
import fs from 'fs-extra';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

import { extractLastFrame } from '../ffmpeg-helpers.js';
import { joinOutPath, toSharp } from './../utils.js';
import { saveJSON, downloadToFile} from './../save-utils.js';
const defaultVideoVars = {
  // start_image_pil: handle_file(tmpStart),
  // end_image_pil: handle_file(tmpEnd),
  //  prompt:  '',
  negative_prompt: 'bright colors, overexposed, static, blurred details, subtitles, style, artwork, painting, picture, still, overall gray, worst quality, low quality, JPEG compression residue, ugly, incomplete, extra fingers, poorly drawn hands, poorly drawn faces, deformed, disfigured, malformed limbs, fused fingers, still picture, cluttered background, three legs, many people in the background, walking backwards',
  duration_seconds: 2.1,//max 5.1
  steps: 8,//max 30
  guidance_scale: 1,//max 10
  guidance_scale_2: 1, //max 10
  seed: 42,
  randomize_seed: true
};


// Resolve local .env in this folder (lib/generator/wan22/.env)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env') });

const maskToken = (t) => {
  if (!t || typeof t !== 'string') return 'none';
  if (t.length <= 8) return '*'.repeat(t.length);
  return `${t.slice(0, 4)}…${t.slice(-4)}`;
};

export class PostToWan22_FirstLastFrame extends PostTo {
  /**
   * @param {object} modelConfig
   * @param {string} [modelConfig.hfToken]
   * @param {string} [modelConfig.folderName] default: 'wan22FirstLast'
   * @param {number} [modelConfig.duration_seconds] default 2.1
   * @param {number} [modelConfig.steps] default 8
   * @param {number} [modelConfig.guidance_scale] default 1
   * @param {number} [modelConfig.guidance_scale_2] default 1
   * @param {number} [modelConfig.seed] default 42
   * @param {boolean} [modelConfig.randomize_seed] default true
   */
  constructor(modelConfig = {}) {
    super(modelConfig);
    this.config = modelConfig || {};

    this.config.space = this.config.space ?? 'multimodalart/wan-2-2-first-last-frame';
    this.config.folderName = this.config.folderName ?? 'wan22FirstLast';

    this.config.duration_seconds = this.config.duration_seconds ?? 2.1;
    this.config.steps = this.config.steps ?? 8;
    this.config.guidance_scale = this.config.guidance_scale ?? 1;
    this.config.guidance_scale_2 = this.config.guidance_scale_2 ?? 1;
    this.config.seed = this.config.seed ?? 42;
    this.config.randomize_seed = this.config.randomize_seed ?? true;

    this._cli = null;
    this.imageDir = joinOutPath(this.config.folderName);

    this.roundCounter = 0;
  }

  async init() {

    const token = this.config.hfToken || process.env.HF_TOKEN || process.env.HF_API_TOKEN || null;
    console.log('[Wan22 FirstLast] Using HF token:', maskToken(token));


    try {
      this._cli = await Client.connect(this.config.space, token ? { hf_token: token } : {});
    } catch (e) { console.warn('Error checking HF token or service i sdown:', this.config.space, e); }
    return this;
  }

  /**
   * Generate a video interpolating between start and end images.
   *
   * @param {Buffer|string|sharp.Sharp} startImageStream
   * @param {object} options
   * @param {Buffer|string|sharp.Sharp} [options.endImageStream] If omitted and loop.endImages exists, it will be used.
   * @param {string} [options.prompt]
   * @param {string} [options.negative_prompt]
   * @param {number} [options.duration_seconds]
   * @param {number} [options.steps]
   * @param {number} [options.guidance_scale]
   * @param {number} [options.guidance_scale_2]
   * @param {number} [options.seed]
   * @param {boolean} [options.randomize_seed]
   * @param {object} [options.loop] Optional loop controller {prompts: string[], endImages?: (Buffer|string|sharp.Sharp)[]}
   * @returns {Promise<string|true|false>} saved mp4 path, true when finishing loop, or false on download failure
   */
  async prompt(startImageStream, options = {}) {
    const loop = options?.loop;

    if (loop) {
      const L = loop.prompts?.length || 0;
      if (L > 0 && (this.roundCounter + L) % (L + 1) === 0 && this.roundCounter > 0) {
        return true;
      }
    }

    const startSharp = toSharp(startImageStream);
    let endImageStream = options.endImageStream;


    if (!endImageStream && loop?.endImages?.length) {
      endImageStream = loop.endImages[this.roundCounter % loop.endImages.length];
    }
    if (!endImageStream) {
      endImageStream = startImageStream;
    }
    const endSharp = toSharp(endImageStream);

    const tmpStart = path.join(this.imageDir, 'input-img', 'start.png');
    const tmpEnd = path.join(this.imageDir, 'input-img', 'end.png');
    fs.ensureDirSync(path.dirname(tmpStart));
    await startSharp.png().toFile(tmpStart);
    await endSharp.png().toFile(tmpEnd);


        // duration may be a number/string or a function (sync or async) that returns one
    let duration = options.duration_seconds ?? this.config.duration_seconds;
    if (typeof duration === 'function') {
      // allow functions to accept (localPath, options) and support async returns
      duration = duration();
    }

    
    const payload = {
      start_image_pil: handle_file(tmpStart),
      end_image_pil: handle_file(tmpEnd),
      prompt: options.prompt ?? '',
      negative_prompt: options.negative_prompt ?? undefined,
      duration_seconds:duration,



      steps: options.steps ?? this.config.steps,
      guidance_scale: options.guidance_scale ?? this.config.guidance_scale,
      guidance_scale_2: options.guidance_scale_2 ?? this.config.guidance_scale_2,
      seed: options.seed ?? this.config.seed,
      randomize_seed: options.randomize_seed ?? this.config.randomize_seed,
    };

    console.log('Wan-2.2 FirstLastFrame payload:', JSON.stringify(payload, null, 2));

    const result = await this._cli.predict('/generate_video', payload);

    let url = null;
    const out = result?.data?.[0]?.video;
    if (typeof out === 'string') {
      url = out;
    } else if (out && typeof out === 'object') {
      url = out.url || out.path || null;
    }

    if (!url) {
      throw new Error('Wan-2.2 FirstLast: Unexpected response format from /generate_video');
    }

    const fnameVideo = `${Date.now()}-wan22-first-last.mp4`;
    const savePath = path.join(this.imageDir, fnameVideo);



    const json = {
      model: this.config.space,
      prompt: options.prompt ?? '',
      negative_prompt: options.negative_prompt ?? undefined,
      duration_seconds: options.duration_seconds ?? this.config.duration_seconds,
      steps: options.steps ?? this.config.steps,
      guidance_scale: options.guidance_scale ?? this.config.guidance_scale,
      guidance_scale_2: options.guidance_scale_2 ?? this.config.guidance_scale_2,
      seed: options.seed ?? this.config.seed,
      randomize_seed: options.randomize_seed ?? this.config.randomize_seed,
      // Keep both for backwards-compat; prefer `url`
      url,
      sourceUrl: url,
    };



    if (loop) {
      const lastPng = savePath.replace(/\.mp4$/, '-last-frame.png');
      await extractLastFrame(savePath, lastPng);

      if (typeof options.seed === 'number' && options.seed >= 0) {
        options.seed += 1;
      }

      const nextPrompt = loop.prompts
        ? loop.prompts[this.roundCounter % loop.prompts.length]
        : options.prompt;

      await this.prompt(lastPng, {
        ...options,
        prompt: nextPrompt,
        endImageStream: loop?.endImages?.length
          ? loop.endImages[(this.roundCounter + 1) % loop.endImages.length]
          : options.endImageStream
      });
    }

    this.roundCounter = (this.roundCounter || 0) + 1;
    return {
      file: await downloadToFile(url, savePath),
      json: await saveJSON(savePath, json)

    };
  }
}
