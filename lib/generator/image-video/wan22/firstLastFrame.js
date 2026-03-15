import PostTo from '../../PostTo.js';
import { Client, handle_file } from '@gradio/client';
import fs from 'fs-extra';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

import { extractLastFrame } from '../../ffmpeg-helpers.js';
import { joinOutPath, toSharp } from './../../utils.js';
import { saveJSON, downloadToFile} from './../../save-utils.js';
import { createLogger } from '../../logger.js';
const defaultVideoVars = {
  // start_image_pil: handle_file(tmpStart),
  // end_image_pil: handle_file(tmpEnd),
  //  prompt:  '',
  negative_prompt: 'bright colors, overexposed, static, blurred details, subtitles, style, artwork, painting, picture, still, overall gray, worst quality, low quality, JPEG compression residue, ugly, incomplete, extra fingers, poorly drawn hands, poorly drawn faces, deformed, disfigured, malformed limbs, fused fingers, still picture, cluttered background, three legs, many people in the background, walking backwards',
  duration_seconds: 2.1,//max 5.1
  steps: 8,//max 30
  guidance_scale: 1,//max 10
  guidance_scale_2: 1, //max 10
  seed: -1,
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

const DEFAULT_FIRST_LAST_SPACE = 'cakegreen/Wan-2-2-first-last-frame';
const SELF_HOSTED_FIRST_LAST_SPACE = 'eggman-poff/wan-flf2v';
const SELF_HOSTED_FIRST_LAST_MODEL_ID = 'Wan-AI/Wan2.1-FLF2V-14B-720P-diffusers';
const SELF_HOSTED_DEFAULT_FPS = 16;
const SELF_HOSTED_MIN_FRAMES = 33;
const SELF_HOSTED_MAX_FRAMES = 121;
const SELF_HOSTED_FRAME_STEP = 4;
const SELF_HOSTED_DEFAULT_MAX_AREA = 832 * 480;
const logger = createLogger('wan:first-last', { envKeys: ['WAN_DEBUG'] });
const TRUTHY_VALUES = new Set(['1', 'true', 'yes', 'on']);

const normalizeBoolean = (value) => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') return TRUTHY_VALUES.has(value.trim().toLowerCase());
  return false;
};

const clampNumber = (value, min, max, fallback = min) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
};

const roundToSteppedRange = (value, min, max, step, fallback = min) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  const clamped = Math.min(max, Math.max(min, Math.round(n)));
  return Math.min(max, Math.max(min, min + (Math.round((clamped - min) / step) * step)));
};

export const resolveWanFirstLastRuntime = (config = {}) => {
  const selfHostedSpace = config.selfHostedHugginfaceSpace
    ?? config.selfHostedHuggingfaceSpace
    ?? config.selfHostedHuggingFaceSpace
    ?? process.env.WAN22_FIRST_LAST_SELF_HOSTED_SPACE
    ?? SELF_HOSTED_FIRST_LAST_SPACE;
  const selfHostedHugginfaceModel = normalizeBoolean(
    config.selfHostedHugginfaceModel
    ?? config.selfHostedHuggingfaceModel
    ?? config.selfHostedHuggingFaceModel
  );

  if (selfHostedHugginfaceModel) {
    return {
      selfHostedHugginfaceModel: true,
      space: selfHostedSpace,
      endpoint: '/generate_video',
    };
  }

  return {
    selfHostedHugginfaceModel: false,
    space: config.space
      ?? process.env.WAN22_FIRST_LAST_SPACE
      ?? DEFAULT_FIRST_LAST_SPACE,
    endpoint: '/generate_video',
  };
};

export const resolveWanFirstLastSelfHostedTiming = ({
  durationSeconds,
  requestedFps,
  requestedNumFrames,
} = {}) => {
  const targetDuration = Number(durationSeconds);
  const preferredFps = clampNumber(
    requestedFps,
    8,
    24,
    SELF_HOSTED_DEFAULT_FPS
  );

  if (requestedNumFrames !== undefined && requestedNumFrames !== null && requestedNumFrames !== '') {
    return {
      fps: preferredFps,
      numFrames: roundToSteppedRange(
        requestedNumFrames,
        SELF_HOSTED_MIN_FRAMES,
        SELF_HOSTED_MAX_FRAMES,
        SELF_HOSTED_FRAME_STEP,
        65
      ),
    };
  }

  let fps = preferredFps;
  let desiredFrames = Number.isFinite(targetDuration) && targetDuration > 0
    ? targetDuration * fps
    : SELF_HOSTED_MIN_FRAMES;

  if (Number.isFinite(targetDuration) && targetDuration > 0 && desiredFrames < SELF_HOSTED_MIN_FRAMES) {
    const promotedFps = clampNumber(
      Math.round(SELF_HOSTED_MIN_FRAMES / targetDuration),
      8,
      24,
      preferredFps
    );
    fps = Math.max(fps, promotedFps);
    desiredFrames = targetDuration * fps;
  }

  return {
    fps,
    numFrames: roundToSteppedRange(
      desiredFrames,
      SELF_HOSTED_MIN_FRAMES,
      SELF_HOSTED_MAX_FRAMES,
      SELF_HOSTED_FRAME_STEP,
      SELF_HOSTED_MIN_FRAMES
    ),
  };
};

export const buildWanFirstLastSelfHostedPayload = ({
  tmpStart,
  tmpEnd,
  options = {},
  config = {},
  durationSeconds,
} = {}) => {
  const requestedNumFrames = options.num_frames
    ?? options.numFrames
    ?? config.num_frames
    ?? config.numFrames;
  const { fps, numFrames } = resolveWanFirstLastSelfHostedTiming({
    durationSeconds: Number(durationSeconds) || config.duration_seconds || defaultVideoVars.duration_seconds,
    requestedFps: options.fps ?? options.frames_per_second ?? config.fps ?? config.frames_per_second,
    requestedNumFrames,
  });

  return {
    first_image: handle_file(tmpStart),
    last_image: handle_file(tmpEnd),
    model_id: options.model_id ?? config.model_id ?? process.env.WAN22_FIRST_LAST_MODEL_ID ?? SELF_HOSTED_FIRST_LAST_MODEL_ID,
    prompt: options.prompt ?? '',
    negative_prompt: options.negative_prompt ?? defaultVideoVars.negative_prompt,
    num_frames: numFrames,
    num_inference_steps: clampNumber(options.steps ?? config.steps, 8, 60, 16),
    guidance_scale: clampNumber(options.guidance_scale ?? config.guidance_scale, 1, 8, 4),
    fps,
    seed: clampNumber(options.seed ?? config.seed, 0, 999999, 42),
    randomize_seed: normalizeBoolean(options.randomize_seed ?? config.randomize_seed),
    custom_max_area: clampNumber(
      options.custom_max_area ?? config.custom_max_area ?? SELF_HOSTED_DEFAULT_MAX_AREA,
      1,
      1280 * 720,
      SELF_HOSTED_DEFAULT_MAX_AREA
    ),
  };
};

const isHttpUrl = (v) => typeof v === 'string' && /^https?:\/\//i.test(v);
const looksLikeVideoRef = (v) => typeof v === 'string'
  && (/\.mp4(\?|$)/i.test(v) || v.includes('/file=') || v.includes('/gradio_api/file='));

const collectVideoRefs = (value, out = []) => {
  if (!value) return out;
  if (typeof value === 'string') {
    out.push(value);
    return out;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectVideoRefs(item, out);
    return out;
  }
  if (typeof value === 'object') {
    if (typeof value.url === 'string') out.push(value.url);
    if (typeof value.path === 'string') out.push(value.path);
    if (typeof value.video === 'string') out.push(value.video);
    if (value.video && typeof value.video === 'object') collectVideoRefs(value.video, out);
    for (const v of Object.values(value)) collectVideoRefs(v, out);
  }
  return out;
};

const toPublicFileUrl = (cli, value) => {
  if (!value || typeof value !== 'string') return null;
  if (isHttpUrl(value)) return value;

  const root = (cli?.config?.root_url || cli?.config?.root || '').replace(/\/$/, '');
  const apiPrefix = (cli?.config?.api_prefix || cli?.api_prefix || '/gradio_api').replace(/\/$/, '');
  if (!root) return null;

  if (value.startsWith('/gradio_api/file=')) return `${root}${value}`;
  if (value.startsWith('/file=')) return `${root}${value}`;
  if (value.startsWith('file=')) return `${root}/${value}`;
  if (value.startsWith('/tmp/') || value.startsWith('tmp/') || value.startsWith('/output/') || value.startsWith('output/')) {
    return `${root}${apiPrefix}/file=${value}`;
  }
  if (value.startsWith('/')) return `${root}${value}`;
  return `${root}/${value}`;
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
   * @param {number} [modelConfig.seed] default -1
   * @param {boolean} [modelConfig.randomize_seed] default true
   */
  constructor(modelConfig = {}) {
    super(modelConfig);
    this.config = modelConfig || {};
    this.runtime = resolveWanFirstLastRuntime(this.config);

    this.config.space = this.runtime.space;
      
    this.config.folderName = this.config.folderName ?? 'wan22FirstLast';

    this.config.duration_seconds = this.config.duration_seconds ?? 2.1;
    this.config.steps = this.config.steps ?? 8;
    this.config.guidance_scale = this.config.guidance_scale ?? 1;
    this.config.guidance_scale_2 = this.config.guidance_scale_2 ?? 1;
    this.config.seed = this.config.seed ?? -1;
    this.config.randomize_seed = this.config.randomize_seed ?? true;

    this._cli = null;
    this._connectError = null;
    this.imageDir = joinOutPath(this.config.folderName);

    this.roundCounter = 0;
  }

  async init() {

    const token = this.config.hfToken || process.env.HF_TOKEN || process.env.HF_API_TOKEN || null;
    logger.info('Using HF token:', maskToken(token));


    try {
      this._cli = await Client.connect(this.config.space, token ? { hf_token: token } : {});
    } catch (e) {
      this._connectError = e;
      logger.warn('Error checking HF token or service i sdown:', this.config.space, e);
    }
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
    if (!this._cli) {
      const rootMessage = this._connectError?.message || 'client not initialized';
      throw new Error(`Wan-2.2 FirstLast is unavailable (${this.config.space}): ${rootMessage}`);
    }

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

    
    const payload = this.runtime.selfHostedHugginfaceModel
      ? buildWanFirstLastSelfHostedPayload({
          tmpStart,
          tmpEnd,
          options,
          config: this.config,
          durationSeconds: duration,
        })
      : {
          start_image_pil: handle_file(tmpStart),
          end_image_pil: handle_file(tmpEnd),
          prompt: options.prompt ?? '',
          negative_prompt: options.negative_prompt ?? undefined,
          duration_seconds: duration,
          steps: options.steps ?? this.config.steps,
          guidance_scale: options.guidance_scale ?? this.config.guidance_scale,
          guidance_scale_2: options.guidance_scale_2 ?? this.config.guidance_scale_2,
          seed: options.seed ?? this.config.seed,
          randomize_seed: options.randomize_seed ?? this.config.randomize_seed,
        };

    if (logger.isDebugEnabled()) {
      logger.payload('generate_video payload', payload);
    }
    logger.netRequest({
      method: 'POST',
      url: `${this.config.space}${this.runtime.endpoint}`,
      body: payload,
      label: this.runtime.endpoint,
    });

    const result = await this._cli.predict(this.runtime.endpoint, payload);
    logger.netResponse({
      method: 'POST',
      url: `${this.config.space}${this.runtime.endpoint}`,
      body: result?.data,
      label: this.runtime.endpoint,
    });

    const refs = collectVideoRefs(result?.data);
    const candidates = refs.filter(looksLikeVideoRef);
    const chosen = candidates[0] || refs[0] || null;
    const url = toPublicFileUrl(this._cli, chosen);

    if (!url) {
      logger.payload('generate_video response (unparsed)', result?.data, { maxLength: 2000 });
      throw new Error(`Wan-2.2 FirstLast: Unexpected response format from ${this.runtime.endpoint}`);
    }

    const fnameVideo = `${Date.now()}-wan22-first-last.mp4`;
    const savePath = path.join(this.imageDir, fnameVideo);



    const json = {
      model: this.config.space,
      selfHostedHugginfaceModel: this.runtime.selfHostedHugginfaceModel,
      prompt: options.prompt ?? '',
      negative_prompt: options.negative_prompt ?? undefined,
      duration_seconds: options.duration_seconds ?? this.config.duration_seconds,
      width: options.width ?? this.config.width,
      height: options.height ?? this.config.height,
      fps: this.runtime.selfHostedHugginfaceModel
        ? payload.fps
        : (options.fps ?? options.frames_per_second ?? this.config.fps ?? this.config.frames_per_second),
      num_frames: this.runtime.selfHostedHugginfaceModel
        ? payload.num_frames
        : (options.num_frames ?? options.numFrames ?? this.config.num_frames ?? this.config.numFrames),
      custom_max_area: options.custom_max_area ?? this.config.custom_max_area,
      steps: options.steps ?? this.config.steps,
      guidance_scale: options.guidance_scale ?? this.config.guidance_scale,
      guidance_scale_2: options.guidance_scale_2 ?? this.config.guidance_scale_2,
      seed: options.seed ?? this.config.seed,
      randomize_seed: options.randomize_seed ?? this.config.randomize_seed,
      end_image_path: typeof options.endImageStream === 'string' ? options.endImageStream : '',
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
