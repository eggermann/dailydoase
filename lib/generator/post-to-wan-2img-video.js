import fs from 'fs-extra';
import path from 'path';
import { Client, handle_file } from '@gradio/client';
import dotenv from 'dotenv';
import PostTo from './PostTo.js';
import store from '../store.cjs';
import sharp from 'sharp';

//***failed of no space//

/** Helper – encode local file -> base64 data URI */
const toB64 = (filePath) =>
  `data:image/${path.extname(filePath).slice(1)};base64,${fs.readFileSync(filePath, 'base64')}`;

/** PostTo subclass that hits the WAN key-frame Space */
class PostToWANVideo extends PostTo {
  constructor(modelConfig = {}) {
    super(modelConfig);

    this.config = modelConfig;
    this.config.space = modelConfig.space ?? 'fffiloni/Wan2.1-VACE-1.3B';
    this.config.folderName = modelConfig.folderName ?? 'hunYuanVideos';
    this.config.guidance = modelConfig.guidance ?? 7.5;
    this.config.numFrames = modelConfig.numFrames ?? 49;
    this.config.steps = modelConfig.steps ?? 50;
    this.config.resolution = modelConfig.resolution ?? '720x1280';
    // ---- VACE‑WAN 1.3B defaults ----
    this.config.negativePrompt = modelConfig.negativePrompt ?? 'Bright and saturated tones, overexposed, static, unclear details, subtitles, style, work, painting, frame, still, overall grayish, worst quality, low quality, JPEG compression artifacts, ugly, deformed, extra fingers, poorly drawn hands, poorly drawn face, deformed, disfigured, misshapen limbs, fused fingers, motionless frame, cluttered background, three legs, crowded background, walking backwards.';
    this.config.shiftScale   = modelConfig.shiftScale   ?? 16;
    this.config.sampleSteps  = modelConfig.sampleSteps  ?? 25;
    this.config.contextScale = modelConfig.contextScale ?? 1;
    this.config.guideScale   = modelConfig.guideScale   ?? 5;
    this.config.inferSeed    = modelConfig.inferSeed    ?? -1;
    this.config.outputHeight = modelConfig.outputHeight ?? '480';
    this.config.outputWidth  = modelConfig.outputWidth  ?? '832';
    this.config.frameRate    = modelConfig.frameRate    ?? '16';
    // numFrames and steps are already defined above and will be reused
    // No fallbacks: always connect to eggman-poff/wan-api
    this._cli = null;                   // will hold @gradio/client

    // Logging config for debugging
    console.log('[PostToWANVideo] Initialized with config:', this.config);
  }

  async init() {
    await store.initCache(this.imageDir);             // (re-use PostTo helper)
    this._cli = await Client.connect(this.config.space, {
      hf_token: process.env.HF_TOKEN ?? process.env.HF_API_TOKEN
    });
    this.config.spaceActive = this.config.space;
    return this;
  }

  /** Core generator — accepts two Sharp streams *or* absolute file‑paths */
  async prompt(streams, options = {}) {
    await this.checkSignature();                      // from PostTo


    // Normalise inputs: turn plain file paths into Sharp objects
    const inputs = streams.map(s => (typeof s === 'string' ? sharp(s) : s));

    // 1  write incoming Sharp streams to temp PNGs
    const [tmp0, tmp1] = [0, 1].map(i => path.join(this.imageDir, `kf${Date.now()}-${i}.png`));
    await Promise.all([
      inputs[0].png().toFile(tmp0),
      inputs[1].png().toFile(tmp1)
    ]);

    // 2  choose endpoint & payload based on active space
    const activeSpace = this.config.spaceActive ?? this.config.space;
    let endpoint, payload;

    if (
      activeSpace.includes('svd_keyframe_interpolation') ||
      activeSpace.includes('video-keyframe-interp') ||
      activeSpace.includes('svd_keyframe_api')
    ) {
      // SVD research fork: just two file inputs
      endpoint = 0;
      payload  = [[handle_file(tmp0), handle_file(tmp1)]];  // single list arg
    } else if (activeSpace.includes('DynamiCrafter_interp_loop')) {
      // DynamiCrafter: eight‑arg signature (start, prompt, steps, cfg, eta, fs, seed, end)
      endpoint = 0; // use fn_index 0
      payload  = [
        handle_file(tmp0),             // image
        options.prompt ?? '',          // prompt
        this.config.steps,             // steps
        this.config.guidance,          // cfg_scale
        1.0,                           // eta
        3,                             // fs
        123,                           // seed  (could randomise)
        handle_file(tmp1)              // image2
      ];
    } else if (activeSpace.includes('Wan2.1-VACE')) {
      // VACE‑WAN 1.3B demo — object‑style payload
      endpoint = '/generate';
      payload  = {
        output_gallery: [],
        src_video: null,            // optional in demo
        src_mask: null,             // optional in demo
        src_ref_image_1: handle_file(tmp0),
        src_ref_image_2: handle_file(tmp1),
        src_ref_image_3: handle_file(tmp1), // duplicate second key‑frame
        prompt: options.prompt ?? '',
        negative_prompt: options.negativePrompt ?? this.config.negativePrompt,
        shift_scale: this.config.shiftScale,
        sample_steps: this.config.sampleSteps ?? this.config.steps,
        context_scale: this.config.contextScale,
        guide_scale: this.config.guideScale ?? this.config.guidance,
        infer_seed: this.config.inferSeed,
        output_height: this.config.outputHeight,
        output_width: this.config.outputWidth,
        frame_rate: this.config.frameRate,
        num_frames: this.config.numFrames
      };
    } else { // WAN ‑ default
      endpoint = '/generate_video';
      payload  = [
        options.prompt ?? '',
        toB64(tmp0),
        toB64(tmp1),
        this.config.resolution,
        this.config.guidance,
        this.config.numFrames,
        this.config.steps
      ];
    }

    let result;
    try {
      result = await this._cli.predict(endpoint, payload);

      // Handle VACE‑WAN gallery output
      if (!mp4b64 && activeSpace.includes('Wan2.1-VACE') && Array.isArray(result.data)) {
        const first = result.data[0];
        if (first?.image?.path) {
          const remotePath = first.image.path;
          const fname      = `${Date.now()}-vaceWan.mp4`;
          const localPath  = path.join(this.imageDir, fname);
          const res        = await fetch(remotePath);
          await fs.writeFile(localPath, Buffer.from(await res.arrayBuffer()));
          store.addFile(path.basename(this.imageDir), fname);
          console.log(`✅  Video saved via "${activeSpace}" → ${localPath}`);
          return localPath;
        }
      }
    } catch (err) {
      // If DynamiCrafter complains about argument count, fall back to SVD.
      if (
        activeSpace.includes('DynamiCrafter') &&
        /arguments/i.test(err.message ?? '') &&
        !activeSpace.includes('svd_keyframe_interpolation')
      ) {
        console.warn('⚠️  DynamiCrafter signature mismatch, switching to SVD fallback…');
        // reconnect to SVD space (if not already)
        if (!this.config.spaceActive.includes('svd_keyframe_interpolation')) {
          this._cli = await Client.connect('jeanne-wang/svd_keyframe_interpolation', {
            hf_token: process.env.HF_TOKEN ?? process.env.HF_API_TOKEN ?? undefined
          });
          this.config.spaceActive = 'jeanne-wang/svd_keyframe_interpolation';
        }
        endpoint = 0;
        payload  = [[handle_file(tmp0), handle_file(tmp1)]];
        result   = await this._cli.predict(endpoint, payload);
      } else {
        throw err;
      }
    }

    // --- normalise Gradio return shapes for <gr.Video> ---
    let mp4b64;
    if (Array.isArray(result.data)) {
      // 1) [ "data:video/..." ] or [ { data:"data:video/...", name:"out.mp4" } ]
      const first = result.data[0];
      if (typeof first === 'string' && first.startsWith('data:')) {
        mp4b64 = first.split(',')[1];
      } else if (typeof first === 'object' && first.data?.startsWith('data:')) {
        mp4b64 = first.data.split(',')[1];
      }
    } else if (typeof result.data === 'string' && result.data.startsWith('data:')) {
      // 2) plain string
      mp4b64 = result.data.split(',')[1];
    }

    if (!mp4b64) throw new Error('Space returned no base64 video.');

    // 3  persist MP4 + metadata
    const fnameVideo = `${Date.now()}-wan2img.mp4`;
    const pathVideo = path.join(this.imageDir, fnameVideo);
    await fs.writeFile(pathVideo, Buffer.from(mp4b64, 'base64'));
    store.addFile(path.basename(this.imageDir), fnameVideo);

    await fs.writeJson(`${pathVideo}.json`, {
      prompt: options.prompt ?? '',
      guidance: this.config.guidance,
      frames: this.config.numFrames,
      steps: this.config.steps,
      timestamp: new Date().toISOString()
    }, { spaces: 2 });

    console.log(`✅  Video saved via "${activeSpace}" → ${pathVideo}`);
    return pathVideo;
  }
}

/* --- Common singleton wrapper, matching your other generators --- */
let cachedInstance = null;

export default {
  init: async (config = {}) => {
    if (!cachedInstance) {
      cachedInstance = await (new PostToWANVideo(config)).init();
    }
    return cachedInstance;
  }
};