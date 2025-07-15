import fs from 'fs-extra';
import path from 'path';
import { Client, handle_file } from '@gradio/client';
import PostTo from './PostTo.js';
import sharp from 'sharp';

/** Helper – encode local file -> base64 data URI */
const toB64 = (filePath) =>
  `data:image/${path.extname(filePath).slice(1)};base64,${fs.readFileSync(filePath, 'base64')}`;

/** PostTo subclass that hits the Lightricks/ltx-video-distilled Space */
class PostToLtxVideo extends PostTo {
  constructor(modelConfig = {}) {
    super(modelConfig);

    this.config = modelConfig;
    this.config.space = modelConfig.space ?? 'multimodalart/wan2-1-fast';//--> 'rahul7star/Wan-fusionX-Lora-T2V';//Heartsync/wan2-1-fast-security';
    this.config.folderName = modelConfig.folderName ?? 'wan21FastVideos';
    this.config.guidance_scale = modelConfig.guidance_scale ?? 1.0; // Corresponds to Wan2.1 guidance_scale
    this.config.steps = modelConfig.steps ?? 4;
    this.config.seed = modelConfig.seed ?? 0; // Corresponds to 'seed'

    this._cli = null; // will hold @gradio/client
  }

  async init() {
    this._cli = await Client.connect(this.config.space, {
      hf_token: process.env.HF_API_TOKEN ?? process.env.HF_TOKEN
    });
    this.config.spaceActive = this.config.space;
    await this.checkSignature(); // from PostTo
    return this;
  }

  /** Core generator — accepts a Sharp stream *or* an absolute file‑path for the input image */
  async prompt(inputImageStream, options = {}) {


    // Normalise input: turn plain file path into Sharp object if needed
    const inputImage = typeof inputImageStream === 'string' ? sharp(inputImageStream) : inputImageStream;

    // 1  write incoming Sharp stream to a temp PNG
    const tmpInputImage = './img (1).png';
    await inputImage.png().toFile(tmpInputImage);

    // 2  choose endpoint & payload based on active space
    // The Lightricks/ltx-video-distilled space has a single endpoint (fn_index 0)
    // Use the correct endpoint and payload for the current API
    const endpoint = "/generate_video";
    const payload = {
      input_image: handle_file(tmpInputImage),
      prompt: options.prompt ?? '',
      negative_prompt: options.negative_prompt ?? 'Bright tones, overexposed, static, blurred details, worst quality, low quality',
      height: options.height ?? options.height_ui ?? 512,
      width: options.width ?? options.width_ui ?? 896,
      duration_seconds: options.duration_seconds ?? options.duration_ui ?? 2,
      guidance_scale: options.guidance_scale ?? this.config.guidance_scale,
      steps: options.steps ?? this.config.steps,
      seed: options.seed ?? this.config.seed ?? 42,
      randomize_seed: options.randomize_seed ?? true
    };
    console.log('Gradio payload:', JSON.stringify(payload, null, 2));
    console.log('Gradio token:', process.env.HF_API_TOKEN);

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
    const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
    const response = await fetch(videoUrl);
    const buffer = await response.arrayBuffer();
    await fs.writeFile(pathVideo, Buffer.from(buffer));

    await fs.writeJson(`${pathVideo}.json`, {
      prompt: options.prompt ?? '',
      guidance_scale: this.config.guidance_scale,
      steps: this.config.steps,
      duration_seconds: options.duration_seconds ?? options.duration_ui ?? 2,
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
    const instance = await (new PostToLtxVideo(config)).init();

    return instance;
  }
};