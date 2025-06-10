import fs from 'fs-extra';
import path from 'path';
import { Client, handle_file } from '@gradio/client';
import dotenv from 'dotenv';
import PostTo from './PostTo.js';
import store from '../store.cjs';
import sharp from 'sharp';

/** Helper – encode local file -> base64 data URI */
const toB64 = (filePath) =>
  `data:image/${path.extname(filePath).slice(1)};base64,${fs.readFileSync(filePath, 'base64')}`;

/** PostTo subclass that hits the Lightricks/ltx-video-distilled Space */
class PostToLtxVideo extends PostTo {
  constructor(modelConfig = {}) {
    super(modelConfig);

    this.config = modelConfig;
    this.config.space = modelConfig.space ?? 'Lightricks/ltx-video-distilled';
    this.config.folderName = modelConfig.folderName ?? 'ltxVideos';
    this.config.cfg = modelConfig.cfg ?? 3.0; // Corresponds to 'cfg' in the Gradio Space
    this.config.steps = modelConfig.steps ?? 25; // Corresponds to 'steps'
    this.config.motionBucketId = modelConfig.motionBucketId ?? 127; // Corresponds to 'motion_bucket_id'
    this.config.fps = modelConfig.fps ?? 6; // Corresponds to 'fps'
    this.config.seed = modelConfig.seed ?? 0; // Corresponds to 'seed'

    this._cli = null; // will hold @gradio/client
  }

  async init() {
    await store.initCache(this.imageDir); // (re-use PostTo helper)
    this._cli = await Client.connect(this.config.space, {
      hf_token: process.env.HF_TOKEN ?? process.env.HF_API_TOKEN
    });
    this.config.spaceActive = this.config.space;
    return this;
  }

  /** Core generator — accepts a Sharp stream *or* an absolute file‑path for the input image */
  async prompt(inputImageStream, options = {}) {
    await this.checkSignature(); // from PostTo

    // Normalise input: turn plain file path into Sharp object if needed
    const inputImage = typeof inputImageStream === 'string' ? sharp(inputImageStream) : inputImageStream;

    // 1  write incoming Sharp stream to a temp PNG
    const tmpInputImage = './img (1).png';
    await inputImage.png().toFile(tmpInputImage);

    // 2  choose endpoint & payload based on active space
    // The Lightricks/ltx-video-distilled space has a single endpoint (fn_index 0)
    // Use the correct endpoint and payload for the current API
    const endpoint = "/image_to_video";
    const payload = {
      prompt: options.prompt ?? '',
      negative_prompt: options.negative_prompt ?? 'worst quality, inconsistent motion, blurry, jittery, distorted',
      input_image_filepath: handle_file(tmpInputImage),
      input_video_filepath: options.input_video_filepath ?? '',
      height_ui: options.height_ui ?? 512,
      width_ui: options.width_ui ?? 704,
      mode: options.mode ?? 'image-to-video',
      duration_ui: options.duration_ui ?? 2,
      ui_frames_to_use: options.ui_frames_to_use ?? 9,
      seed_ui: options.seed_ui ?? 42,
      randomize_seed: options.randomize_seed ?? true,
      ui_guidance_scale: options.ui_guidance_scale ?? 1,
      improve_texture_flag: options.improve_texture_flag ?? true
    };

    let result;
    try {
      result = await this._cli.predict(endpoint, payload);
      console.log('Gradio API response:', JSON.stringify(result, null, 2));
    } catch (err) {
      console.error('Error calling Gradio Space:', err);
      throw err;
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

    if (!videoUrl) {
      throw new Error('Space returned no video URL. Check the Gradio Space output format.');
    }

    // Download the video from the URL and save locally
    const fnameVideo = `${Date.now()}-ltx-video.mp4`;
    const pathVideo = path.join(this.imageDir, fnameVideo);
    const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
    const response = await fetch(videoUrl);
    const buffer = await response.arrayBuffer();
    await fs.writeFile(pathVideo, Buffer.from(buffer));
    store.addFile(path.basename(this.imageDir), fnameVideo);

    await fs.writeJson(`${pathVideo}.json`, {
      prompt: options.prompt ?? '',
      cfg: this.config.cfg,
      steps: this.config.steps,
      motionBucketId: this.config.motionBucketId,
      fps: this.config.fps,
      seed: this.config.seed,
      timestamp: new Date().toISOString(),
      videoUrl
    }, { spaces: 2 });

    console.log(`✅  Video saved via "${this.config.spaceActive}" → ${pathVideo}`);
    return pathVideo;
  }
}

/* --- Common singleton wrapper, matching your other generators --- */
let cachedInstance = null;

export default {
  init: async (config = {}) => {
    if (!cachedInstance) {
      cachedInstance = await (new PostToLtxVideo(config)).init();
    }
    return cachedInstance;
  }
};