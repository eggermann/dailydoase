import PostTo from '../../PostTo.js';
import { Client, handle_file } from '@gradio/client';
import fs from 'fs-extra';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

import { extractLastFrame } from '../../ffmpeg-helpers.js';


import { joinOutPath, toSharp, withTimeout }
  from './../../utils.js';
import { saveJSON, downloadToFile } from './../../save-utils.js';
import { createLogger } from '../../logger.js';

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
const logger = createLogger('wan:image-video', { envKeys: ['WAN_DEBUG'] });
const wanDefaults = {
  duration_seconds: {
    value: 3.0,
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

const nextMul32 = (value) => {
  const v = Math.max(1, Math.round(Number(value) || 0));
  return (v % 32 === 0) ? v : v + (32 - (v % 32));
};

const fitDimensionsToSourceAspect = ({
  sourceWidth,
  sourceHeight,
  maxWidth,
  maxHeight,
  minSide = 256,
}) => {
  if (!Number.isFinite(sourceWidth) || !Number.isFinite(sourceHeight) || sourceWidth <= 0 || sourceHeight <= 0) {
    return {
      width: nextMul32(Math.max(minSide, maxWidth)),
      height: nextMul32(Math.max(minSide, maxHeight)),
    };
  }

  const widthScale = maxWidth / sourceWidth;
  const heightScale = maxHeight / sourceHeight;
  const scale = Math.min(widthScale, heightScale);
  const safeScale = Number.isFinite(scale) && scale > 0 ? scale : 1;

  let width = nextMul32(Math.max(minSide, sourceWidth * safeScale));
  let height = nextMul32(Math.max(minSide, sourceHeight * safeScale));

  while (width > maxWidth && width > minSide) {
    width -= 32;
  }
  while (height > maxHeight && height > minSide) {
    height -= 32;
  }

  return {
    width: Math.max(minSide, width),
    height: Math.max(minSide, height),
  };
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

  async resolveVideoDimensions(tmpInputImage, options = {}) {
    const requestedHeight = options.height ?? options.height_ui ?? this.config.height ?? wanDefaults.output_height.value;
    const requestedWidth = options.width ?? options.width_ui ?? this.config.width ?? wanDefaults.output_width.value;
    const preserveInputAspect = options.preserve_input_aspect ?? this.config.preserve_input_aspect ?? true;

    if (preserveInputAspect) {
      try {
        const metadata = await sharp(tmpInputImage).metadata();
        if (metadata?.width && metadata?.height) {
          return fitDimensionsToSourceAspect({
            sourceWidth: metadata.width,
            sourceHeight: metadata.height,
            maxWidth: requestedWidth,
            maxHeight: requestedHeight,
          });
        }
      } catch (error) {
        logger.warn('Failed to read input image metadata for aspect-preserving sizing.', error?.message || error);
      }
    }

    try {
      const dimRes = await this._cli.predict('/handle_image_upload_for_dims_wan', {
        uploaded_pil_image: handle_file(tmpInputImage),
        current_h_val: requestedHeight,
        current_w_val: requestedWidth,
      });
      if (Array.isArray(dimRes?.data) && dimRes.data.length >= 2) {
        return {
          height: Number(dimRes.data[0]) || requestedHeight,
          width: Number(dimRes.data[1]) || requestedWidth,
        };
      }
    } catch (error) {
      logger.warn('Failed to resolve WAN dimensions from helper; falling back to configured defaults.', error?.message || error);
    }

    return {
      height: requestedHeight,
      width: requestedWidth,
    };
  }

  async init() {
    const token = this.config.hfToken || process.env.HF_TOKEN || process.env.HF_API_TOKEN || null;
    logger.info('Using HF token:', maskToken(token));
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
    // Resolve output dimensions using the space helper or configured WAN defaults,
    // not the tiny still-image dimensions from the input frame.
    let { height: h, width: w } = await this.resolveVideoDimensions(tmpInputImage, options);

    // Ensure multiples of 32 (common requirement for T2V models)
    h = nextMul32(h);
    w = nextMul32(w);

    const resizedInputImage = tmpInputImage.replace(/\.png$/, '-resized.png');
    await sharp(tmpInputImage)
      .resize({
        width: w,
        height: h,
        fit: 'contain',
        position: 'centre',
        background: { r: 0, g: 0, b: 0, alpha: 1 },
      })
      .png()
      .toFile(resizedInputImage);
    await fs.move(resizedInputImage, tmpInputImage, { overwrite: true });

    let durationSeconds = options.duration_seconds ?? this.config.duration_seconds;
    if (typeof durationSeconds === 'function') {
      durationSeconds = await durationSeconds();
    }


    const payload = {
      image: handle_file(tmpInputImage),
      prompt: options.prompt ?? '',
      height: h,
      width: w,
      duration_seconds: durationSeconds,
      sampling_steps: options.sampling_steps ?? this.config.sampling_steps,
      guide_scale: options.guide_scale ?? this.config.guide_scale,
      shift: options.shift ?? this.config.shift,
      seed: options.seed ?? this.config.seed,
    };

    if (logger.isDebugEnabled()) {
      logger.payload('generate_video payload', payload);
    }
    logger.netRequest({
      method: 'POST',
      url: `${SPACE}/generate_video`,
      body: payload,
      label: 'generate_video',
    });
    const result = await withTimeout(
      this._cli.predict('/generate_video', payload),
      15 * 60 * 1000,
      `${SPACE} /generate_video`
    );
    logger.netResponse({
      method: 'POST',
      url: `${SPACE}/generate_video`,
      body: result?.data,
      label: 'generate_video',
    });

    let url = null;
    const out = result?.data?.[0]?.video;
    if (typeof out === 'string') {
      url = out;
    } else if (out && typeof out === 'object') {
      url = out.url || null;
    }

    if (!url) {
      logger.payload('generate_video response (unparsed)', result?.data, { maxLength: 2000 });
      throw new Error('Wan-2.2-5B: Unexpected response format from /generate_video');
    }

    const fnameVideo = `${Date.now()}-wan22-image-video.mp4`;
    const savePath = path.join(this.imageDir, fnameVideo);

    logger.debug(`Downloading video from: ${url}`);
    await downloadToFile(url, savePath, { timeoutMs: 15 * 60 * 1000 });
    logger.debug(`Saved video to: ${savePath}`);

    const json = {
      model: SPACE,
      prompt: options.prompt ?? '',
      height: h,
      width: w,
      duration_seconds: durationSeconds,
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
