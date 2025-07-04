// Hugging Face ACE‑Step Space client for text‑to‑music
// Space:  ACE‑Step/ACE‑Step   (https://huggingface.co/spaces/ACE-Step/ACE-Step)
import fs from 'fs-extra';
import path from 'path';
import { Client, handle_file } from '@gradio/client';
import PostTo from './PostTo.js';
import os from 'os';
  import ffmpeg from 'fluent-ffmpeg';
/**
 * Default configuration that matches the public ACE‑Step Space UI.
 * Every key here maps 1‑to‑1 to a field in the Space’s `/__call__` API.
 * Change a value only when the Space updates its own default so that
 * generated results remain predictable across runs.
 */
const DEFAULTS = {
  audio_duration: -1,         // –1 = random duration chosen by model
  lyrics: '[inst]',           // empty placeholder
  infer_step: 60,             // quality vs speed (ACE docs: 27‑60)
  guidance_scale: 15,          // CFG strength (↑ = closer to prompt)
  scheduler_type: 'euler',    // see README.md for other schedulers
  cfg_type: 'apg',            // approximate pretrained guidance
  omega_scale: 10,            // granularity for APG guidance
  guidance_interval: 0.5,     // fraction of steps between injections
  guidance_interval_decay: 0, // multiplier applied each interval
  min_guidance_scale: 3,      // floor when guidance decays
  oss_steps: null,            // optional timestep overrides
  use_erg_tag: true,          // apply ERG post‑processing to tags
  use_erg_lyric: false,       // apply ERG to lyrics
  use_erg_diffusion: true,    // ERG during diffusion
  guidance_scale_text: 0,     // extra CFG on text prompt
  guidance_scale_lyric: 0,    // extra CFG on lyric prompt
  audio2audio_enable: false,  // toggle Audio2Audio mode
  ref_audio_strength: 0.5,    // blend amount for reference
  ref_audio_input: null,      // filepath of reference audio
  lora_name_or_path: 'none',  // LoRA checkpoint
  manual_seeds: '42',                // explicit seed list (string)
};

/**
 * Configurable ACE‑Step client  (mirrors PostToFLUX style)
 */
class PostToACE extends PostTo {
  /**
   * @param {object} modelConfig  – optional overrides
   */
  constructor(modelConfig = {}) {
    super(modelConfig);

    this.config = modelConfig;
    this.config.folderName = this.config.folderName || 'ACE';

    // Each instance gets its own gradio client
    this._cli = null;

    // Ensure output dir exists
    if (!fs.existsSync(this.imageDir)) {
      fs.ensureDirSync(this.imageDir);
    }
  }

  /**
   * Connect to the Space (lazy)
   */
  async init() {
//console.log('[PostToACE] Initializing ACE client...',process.env.HF_TOKEN, process.env.HF_API_TOKEN);
//process.exit(0);

    if (!this._cli) {
      this._cli = await Client.connect('ACE-Step/ACE-Step', {
        hf_token: process.env.HF_TOKEN || process.env.HF_API_TOKEN
      });
    }
    return this;
  }

  /**
   * Save the generated audio as MP3 and write metadata.
   * Converts to MP3 with ffmpeg if the original buffer is not already MP3.
   * @param {ArrayBuffer} buf            – original audio bytes (any codec)
   * @param {string} prompt
   * @param {number} seedUsed
   * @param {string} [srcExt='.wav']     – original file extension hint
   */
  async _saveAudio(buf, prompt, seedUsed, srcExt = '.wav') {
    const item = Date.now();
    const fileBase = `${item}-ace`;
    const mp3Path = path.join(this.imageDir, `${fileBase}.mp3`);
    const jsonPath = path.join(this.imageDir, `${fileBase}.json`);

    // --- If buffer already looks like MP3, skip conversion -----------
    if (srcExt === '.mp3' || buf.slice(0, 3).toString() === 'ID3') {
      await fs.writeFile(mp3Path, Buffer.from(buf));
    } else {
      // Write temp source file
      const tmpSrc = path.join(os.tmpdir(), `${fileBase}${srcExt}`);
      await fs.writeFile(tmpSrc, Buffer.from(buf));

      // Convert with ffmpeg → libmp3lame, VBR q2
      // Use node-ffmpeg for conversion
      try {
      
        await new Promise((resolve, reject) => {
          ffmpeg(tmpSrc)
            .audioCodec('libmp3lame')
            .audioQuality(2)
            .on('end', async () => {
              await fs.unlink(tmpSrc);
              resolve();
            })
            .on('error', async (err) => {
              console.warn('[PostToACE] node-ffmpeg failed, saving original audio instead →', err.message);
              await fs.rename(tmpSrc, mp3Path); // fall‑back (may not be playable)
              resolve();
            })
            .save(mp3Path);
        });
      } catch (err) {
        console.warn('[PostToACE] node-ffmpeg unexpected error:', err.message);
        await fs.rename(tmpSrc, mp3Path); // fall‑back (may not be playable)
      }
    }

    await fs.writeJson(jsonPath, {
      prompt,
      seed: seedUsed,
      timestamp: new Date().toISOString()
    }, { spaces: 2 });

    console.log(`[PostToACE] Saved ${mp3Path}`);
    return { audioPath: mp3Path, jsonPath };
  }

  /**
   * Generate music from text / tags / lyrics
   * @param {string} prompt            – main text prompt (tags or description)
   * @param {object} [options]         – per‑call overrides
   * @returns {{audioPath:string,jsonPath:string}}
   */
  async prompt(prompt = '', options = {}) {
    await this.checkSignature();
    await this.init();


    // Randomise seed if requested
    if (options.randomize_seed) {
      options.manual_seeds = String(Math.floor(Math.random() * 2_147_483_647));
      delete options.randomize_seed;
    }

    // Build payload for ACE‑Step `/__call__` using DEFAULTS
    const payload = {
      ...DEFAULTS,
      ...options,
      prompt,
    };

    console.log('[PostToACE] Sending payload:', payload);

    // Call the Space – returns [audio, seed]
    let result;
    try {
      /* eslint camelcase:0 */
      result = await this._cli.predict('/__call__', payload);
    } catch (err) {
      console.error('[PostToACE] Gradio error:', err);
      throw err;
    }

    const [audioFile, returnedSeed] = result?.data ?? result;
    if (!audioFile) {
      throw new Error('ACE-Step returned empty response');
    }

    // `audioFile` can be a string URL or a Gradio FileData object
    const fileUrl = typeof audioFile === 'string'
      ? audioFile
      : (audioFile?.url ?? audioFile?.path ?? '');
    if (!fileUrl) throw new Error('ACE-Step response missing file URL');

    const response = await fetch(fileUrl);                // Node ≥18 has fetch built‑in
    const audioBuffer = await response.arrayBuffer();
    if (!audioBuffer || audioBuffer.byteLength === 0) {
      throw new Error('ACE-Step returned empty audio buffer');
    }

    const extMatch = /\.(\w+)(?:\?|$)/.exec(audioFile);
    const srcExt = extMatch ? `.${extMatch[1]}`.toLowerCase() : '.wav';

    return this._saveAudio(audioBuffer, prompt,
                           returnedSeed ?? payload.manual_seeds, srcExt);
  }
}

export default {
  init: async (config) => {
    const inst = new PostToACE(config);
    return inst.init();
  }
};
