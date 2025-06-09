import fs from 'fs-extra';
import path from 'path';
import { Client, handle_file } from '@gradio/client';
import PostTo from './PostTo.js';
import store from '../store.cjs';

/** PostTo subclass that hits the HunYuan key-frame Space */
class PostToHunYuanVideo extends PostTo {
  constructor(modelConfig = {}) {
    super(modelConfig);

    this.config = modelConfig;
    this.config.space = modelConfig.space ?? 'eggman-poff/wan-api';
    this.config.folderName = modelConfig.folderName ?? 'hunYuanVideos';
    this.config.guidance = modelConfig.guidance ?? 7.5;
    this.config.numFrames = modelConfig.numFrames ?? 49;
    this.config.steps = modelConfig.steps ?? 50;
    this.config.resolution = modelConfig.resolution ?? '720x1280';
    this._cli = null;                   // will hold @gradio/client
  }

  async init() {
    await store.initCache(this.imageDir);             // (re-use PostTo helper)
    this._cli = await Client.connect(this.config.space, {
      hf_token: process.env.HF_API_TOKEN 
    });
    this.config.spaceActive = this.config.space;
    return this;
  }

  /** Core generator — accepts two Sharp streams *or* absolute file‑paths */
  async prompt(streams, options = {}) {
    await this.checkSignature();                      // from PostTo


    // Normalise inputs: turn plain file paths into Sharp objects
    const inputs = streams.map(s => (typeof s === 'string' ? s : s));

    // 1  write incoming Sharp streams to temp PNGs
    const [tmp0, tmp1] = [0, 1].map(i => path.join(this.imageDir, `kf${Date.now()}-${i}.png`));
    await Promise.all([
      inputs[0].png().toFile(tmp0),
      inputs[1].png().toFile(tmp1)
    ]);

    // Only the Wan-API: two image files + prompt + guidance + frames
    const endpoint = 0;
    const payload = [
      handle_file(tmp0),               // first image
      handle_file(tmp1),               // second image
      options.prompt ?? '',            // prompt text
      this.config.guidance,            // guidance scale
      this.config.numFrames            // number of frames
    ];
    let result = await this._cli.predict(endpoint, payload);

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
    const fnameVideo = `${Date.now()}-hunYuan.mp4`;
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

    console.log(`✅  Video saved via "${this.config.spaceActive}" → ${pathVideo}`);
    return { imagePath: pathVideo };
  }
}

/* --- Common singleton wrapper, matching your other generators --- */
let cachedInstance = null;

export default {
  init: async (config = {}) => {
    if (!cachedInstance) {
      cachedInstance = await (new PostToHunYuanVideo(config)).init();
    }
    return cachedInstance;
  }
};