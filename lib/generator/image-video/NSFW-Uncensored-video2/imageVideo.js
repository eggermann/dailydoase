import PostTo from '../../../PostTo.js';
import { Client, handle_file } from '@gradio/client';
import fs from 'fs-extra';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

import { extractLastFrame } from '../../../ffmpeg-helpers.js';

import { joinOutPath, toSharp, withTimeout } from '../../../utils.js';
import { saveJSON, downloadToFile } from '../../../save-utils.js';

// Load local .env from this folder (lib/generator/image-video/Heartsync/NSFW-Uncensored-video2/.env)
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
  predictTimeoutMs: 120_000,
  downloadTimeoutMs: 60_000,
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

    this.config.predictTimeoutMs = this.config.predictTimeoutMs ?? defaults.predictTimeoutMs;
    this.config.downloadTimeoutMs = this.config.downloadTimeoutMs ?? defaults.downloadTimeoutMs;
    this.config.mock = this.config.mock ?? (process.env.HEARTSYNC_MOCK === '1');
    // Allow override via env for debugging
    if (process.env.HEARTSYNC_DEBUG_TIMEOUT) {
      this.config.predictTimeoutMs = Number(process.env.HEARTSYNC_DEBUG_TIMEOUT);
      console.log(`[Heartsync ImageVideo] Debug: predictTimeoutMs set to ${this.config.predictTimeoutMs}ms`);
    }

    this._cli = null;
    // Allow endpoint override via config or env
    this._endpoint = this.config.endpoint || process.env.HEARTSYNC_NSFW_V2_ENDPOINT || null; // resolved Gradio endpoint
    this.imageDir = joinOutPath(this.config.folderName);
    fs.ensureDirSync(this.imageDir);
    this.roundCounter = 0;
  }

  async init() {
    if (this.config.mock) {
      console.log('[Heartsync ImageVideo] Mock mode enabled');
      this._cli = {
        // minimal surface used by the class
        predict: async () => ({ data: [{ url: 'https://example.com/mock.mp4' }] }),
        view_api: async () => ({ named_endpoints: { '/on_video_button_click': {} } })
      };
      return this;
    }
    const token = this.config.hfToken || process.env.HF_TOKEN || process.env.HF_API_TOKEN || null;
    console.log('[Heartsync ImageVideo] Using HF token:', maskToken(token));
    this._cli = await Client.connect(SPACE, token ? { hf_token: token } : {});
    return this;
  }

  async resolveEndpoint(force = false) {
    if (this.config.mock) {
      this._endpoint = '/on_video_button_click';
      return this._endpoint;
    }
    if (this._endpoint && !force) return this._endpoint;
    // Preferred order; will filter by availability below
    const preferred = [
      '/generate_video',
      '/generate_video_with_audio',
      '/generate',
      '/infer',
      '/__call__'
    ];

    let available = [];
    try {
      const api = await this._cli.view_api();
      // Gradio may expose named endpoints in different shapes across versions
      if (api && typeof api === 'object') {
        if (api.named_endpoints && typeof api.named_endpoints === 'object') {
          available = Object.keys(api.named_endpoints);
        } else if (Array.isArray(api.endpoints)) {
          available = api.endpoints.map(e => e?.path).filter(Boolean);
        } else if (Array.isArray(api.routes)) {
          available = api.routes.map(e => e?.path).filter(Boolean);
        }
      }
    } catch (e) {
      // view_api not available or failed; fall back to heuristics
      available = [];
    }

    // If we have no introspection data, try preferred list as-is
    const candidates = available.length
      ? preferred.filter(p => available.includes(p)).concat(
          // If none of the preferred appeared, try any route containing 'video'
          available.filter(p => /video/i.test(String(p)))
        )
      : preferred;

    // Pick first candidate
    this._endpoint = candidates[0] || '/generate_video';
    const msgPrefix = '[Heartsync ImageVideo] Endpoint resolution:';
    if (!available.length) {
      console.log(`${msgPrefix} heuristic -> ${this._endpoint}`);
    } else {
      console.log(`${msgPrefix} chosen ${this._endpoint}; available: ${available.join(', ')}`);
    }
    return this._endpoint;
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

    if (this.config.mock) {
      const fnameVideo = `${Date.now()}-heartsync-nsfw-uncensored-video2.mp4`;
      const savePath = path.join(this.imageDir, fnameVideo);
      await fs.ensureDir(path.dirname(savePath));
      // create a tiny placeholder mp4 header so file looks like a video file
      await fs.writeFile(savePath, Buffer.from([0,0,0,20,102,116,121,112,105,115,111,109,0,0,0,0,105,115,111,109,105,115,111,50]));
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
        url: 'https://example.com/mock.mp4',
        sourceUrl: 'mock'
      };
      const jsonData = await saveJSON(savePath, json);
      this.roundCounter = (this.roundCounter || 0) + 1;
      return { file: savePath, json: jsonData };
    }

    // Use the /on_video_button_click endpoint by default, but allow override for testing other endpoints
    const endpoint = this.config.endpoint || '/on_video_button_click';
    const looksLikeVideoUrl = (str) =>
      typeof str === 'string' &&
      /^https?:\/\/.+((\.(mp4|webm|mov)(\?.*)?)|(file=.+))$/i.test(str);

    const extractVideoUrl = (root) => {
      const queue = [root];
      const visited = new Set();
      while (queue.length) {
        const current = queue.shift();
        if (typeof current === 'string') {
          if (looksLikeVideoUrl(current)) {
            return current;
          }
          continue;
        }
        if (!current || typeof current !== 'object') {
          continue;
        }
        if (visited.has(current)) {
          continue;
        }
        visited.add(current);
        if (Array.isArray(current)) {
          queue.push(...current);
          continue;
        }
        const directKeys = ['url', 'value', 'path', 'src', 'href', 'video', 'data'];
        for (const key of directKeys) {
          const val = current[key];
          if (typeof val === 'string' && looksLikeVideoUrl(val)) {
            return val;
          }
          if (val && typeof val === 'object') {
            queue.push(val);
          }
        }
        for (const value of Object.values(current)) {
          if (typeof value === 'string') {
            if (looksLikeVideoUrl(value)) {
              return value;
            }
            continue;
          }
          if (value && typeof value === 'object') {
            queue.push(value);
          }
        }
      }
      return null;
    };

    try {
      await withTimeout(
        this._cli.predict('/update_image_state', {
          img: handle_file(tmpInputImage)
        }),
        Math.min(60 * 1000, this.config.predictTimeoutMs),
        `${SPACE} /update_image_state`
      );
    } catch (e) {
      console.warn('[Heartsync ImageVideo] update_image_state failed:', e?.message || e);
    }

    const baseLength = Number.isFinite(options.duration_seconds)
      ? Math.max(1, Math.round(options.duration_seconds))
      : Number.isFinite(this.config.duration_seconds)
        ? Math.max(1, Math.round(this.config.duration_seconds))
        : 2;
    const lengthCandidates = Array.from(new Set([
      baseLength,
      Math.max(1, baseLength - 1),
      2,
      1
    ])).filter(Boolean);

    let url = null;
    let lastError = null;
    for (let idx = 0; idx < lengthCandidates.length; idx += 1) {
      const lengthSeconds = lengthCandidates[idx];
      let result;
      try {
        console.log(`[Heartsync ImageVideo] Trying endpoint: ${endpoint} (attempt ${idx + 1}/${lengthCandidates.length}, length=${lengthSeconds}s)`);
        result = await withTimeout(
          this._cli.predict(endpoint, {
            uploaded_image: handle_file(tmpInputImage),
            prompt: options.prompt ?? '',
            length: String(lengthSeconds)
          }),
          this.config.predictTimeoutMs,
          `${SPACE} ${endpoint}`
        );
      } catch (err) {
        lastError = err;
        console.warn(`[Heartsync ImageVideo] Error calling ${endpoint}: ${err.message}`);
        if (err.message && err.message.toLowerCase().includes('timeout')) {
          console.warn(`[Heartsync ImageVideo] Reason: API timed out. Consider increasing predictTimeoutMs (currently ${this.config.predictTimeoutMs}ms)`);
        }
        // break out and fallback to image generation
        break;
      }

      console.log('[Heartsync ImageVideo] Raw response:', JSON.stringify(result, null, 2));
      const maybeUrl = extractVideoUrl(result?.data ?? result);
      if (maybeUrl) {
        url = maybeUrl;
        break;
      }

      const maybeError = Array.isArray(result?.data)
        ? result.data.find((item) => typeof item === 'string' && item.toLowerCase().includes('error'))
        : null;
      if (maybeError) {
        lastError = new Error(`Heartsync NSFW-Uncensored-video2: ${maybeError}`);
        if (!maybeError.toLowerCase().includes('timeout')) {
          break;
        }
      } else {
        lastError = new Error('Heartsync NSFW-Uncensored-video2: Unexpected response format from endpoint');
      }
    }

    if (!url) {
      if (lastError) {
        console.warn(`[Heartsync ImageVideo] Video endpoint failed: ${lastError.message}`);
      }
      // Fallback: use /infer image endpoint
      console.log(`[Heartsync ImageVideo] Falling back to /infer endpoint`);
      try {
        const inferResult = await withTimeout(
          this._cli.predict('/infer', {
            prompt: options.prompt ?? '',
            negative_prompt: options.negative_prompt ?? '',
            seed: options.seed ?? this.config.seed,
            randomize_seed: options.randomize_seed ?? true,
            width: w,
            height: h,
            guidance_scale: options.guide_scale ?? this.config.guide_scale,
            num_inference_steps: options.sampling_steps ?? this.config.sampling_steps
          }),
          this.config.predictTimeoutMs,
          `${SPACE} /infer`
        );
        console.log('[Heartsync ImageVideo] Fallback /infer result:', JSON.stringify(inferResult, null, 2));

        const imageEntry = Array.isArray(inferResult.data) ? inferResult.data[0] : inferResult.data;
        let imageUrl = null;
        if (typeof imageEntry === 'string') {
          imageUrl = imageEntry;
        } else if (imageEntry && typeof imageEntry === 'object') {
          imageUrl = imageEntry.url || imageEntry.path || null;
        }
        if (!imageUrl || typeof imageUrl !== 'string') {
          throw new Error('Heartsync NSFW-Uncensored-video2: Fallback /infer did not return a usable URL');
        }

        const fnameFallback = `${Date.now()}-heartsync-nsfw-uncensored-fallback.png`;
        const savePathFallback = path.join(this.imageDir, fnameFallback);
        await downloadToFile(imageUrl, savePathFallback, { timeoutMs: this.config.downloadTimeoutMs });
        console.log(`[Heartsync ImageVideo] Saved fallback image to: ${savePathFallback}`);

        const jsonFallback = {
          model: SPACE,
          prompt: options.prompt ?? '',
          height: h,
          width: w,
          duration_seconds: options.duration_seconds ?? this.config.duration_seconds,
          sampling_steps: options.sampling_steps ?? this.config.sampling_steps,
          guide_scale: options.guide_scale ?? this.config.guide_scale,
          shift: options.shift ?? this.config.shift,
          seed: options.seed ?? this.config.seed,
          url: imageUrl,
          sourceUrl: imageUrl,
          fallback: true
        };
        const jsonDataFallback = await saveJSON(savePathFallback, jsonFallback);
        this.roundCounter = (this.roundCounter || 0) + 1;
        return { file: savePathFallback, json: jsonDataFallback };
      } catch (fallbackErr) {
        throw fallbackErr;
      }
    }

    const fnameVideo = `${Date.now()}-heartsync-nsfw-uncensored-video2.mp4`;
    const savePath = path.join(this.imageDir, fnameVideo);

    console.log(`[Heartsync ImageVideo] Downloading video from: ${url}`);
    await downloadToFile(url, savePath, { timeoutMs: this.config.downloadTimeoutMs });
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
