// Tencent SongGeneration Space client for text‑to‑music
// Space: tencent/SongGeneration   (https://huggingface.co/spaces/tencent/SongGeneration)
import fs from 'fs-extra';
import path from 'path';
import { Client, handle_file } from '@gradio/client';
import PostTo from './PostTo.js';
import os from 'os';
import ffmpeg from 'fluent-ffmpeg';

/**
 * Default configuration mirroring the public SongGeneration UI.
 * Each key maps 1‑to‑1 to a field expected by the Space’s `/generate_song` API.
 */
const DEFAULTS = {
  lyrics: '',            // main lyrics prompt
  description: '',       // optional song description
  prompt_audio: null,    // optional reference audio filepath
  genre: 'Pop',          // default genre
  cfg_coef: 1.0,         // CFG coefficient (0.1‑3.0)
  temperature: 0.7,      // sampling temperature (0.1‑2.0)
  top_k: 20              // Top‑K (1‑100)
};

/**
 * Configurable SongGeneration client (modeled after PostToACE)
 */
class PostToLeo extends PostTo {
  /**
   * @param {object} modelConfig – optional overrides
   */
  constructor(modelConfig = {}) {
    super(modelConfig);

    this.config = modelConfig;
    this.config.folderName = this.config.folderName || 'LEO';

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
    if (!this._cli) {
      this._cli = await Client.connect('tencent/SongGeneration', {
        hf_token: process.env.HF_TOKEN || process.env.HF_API_TOKEN
      });
    }
    return this;
  }

  /**
   * Save the generated audio as MP3 and write metadata.
   * Converts to MP3 with ffmpeg if the original buffer is not already MP3.
   * @param {ArrayBuffer} buf          – original audio bytes (any codec)
   * @param {object}      meta         – metadata to store alongside the file
   * @param {string}      [srcExt='.wav'] – original file extension hint
   * @returns {{audioPath:string,jsonPath:string}}
   */
  async _saveAudio(buf, meta = {}, srcExt = '.wav') {
    const item = Date.now();
    const fileBase = `${item}-leo`;
    const mp3Path = path.join(this.imageDir, `${fileBase}.mp3`);
    const jsonPath = path.join(this.imageDir, `${fileBase}.json`);

    // If buffer already looks like MP3, skip conversion
    if (srcExt === '.mp3' || Buffer.from(buf).slice(0, 3).toString() === 'ID3') {
      await fs.writeFile(mp3Path, Buffer.from(buf));
    } else {
      // Write temp source file
      const tmpSrc = path.join(os.tmpdir(), `${fileBase}${srcExt}`);
      await fs.writeFile(tmpSrc, Buffer.from(buf));

      // Convert with ffmpeg → libmp3lame, VBR q2
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
              console.warn('[PostToLeo] node-ffmpeg failed, saving original audio instead →', err.message);
              await fs.rename(tmpSrc, mp3Path); // fall‑back (may not be playable)
              resolve();
            })
            .save(mp3Path);
        });
      } catch (err) {
        console.warn('[PostToLeo] node-ffmpeg unexpected error:', err.message);
        await fs.rename(tmpSrc, mp3Path); // fall‑back
      }
    }

    await fs.writeJson(
      jsonPath,
      { ...meta, timestamp: new Date().toISOString() },
      { spaces: 2 }
    );

    console.log(`[PostToLeo] Saved ${mp3Path}`);
    return { audioPath: mp3Path, jsonPath };
  }

  /**
   * Generate music from lyrics / description / reference audio.
   * @param {string} lyrics        – required lyrics prompt
   * @param {object} [options]     – per‑call overrides
   * @returns {{audioPath:string,jsonPath:string}}
   */
  async prompt(lyrics = '', options = {}) {
    await this.checkSignature();
    await this.init();

    // Merge with defaults
    const cfg = {
      ...DEFAULTS,
      ...options,
      lyrics
    };

    // Ensure lyrics start with one of the required structure tags
    // If not, wrap them in a default [verse] section so the model accepts the input.
    // Valid tags per API docs: [verse], [chorus], [bridge], [intro‑short], [intro‑medium],
    // [intro‑long], [outro‑short], [outro‑medium], [outro‑long], [inst‑short],
    // [inst‑medium], [inst‑long], [silence]
    const tagRegex = /^\s*\[[a-z]+/i;
    if (!tagRegex.test(cfg.lyrics)) {
      cfg.lyrics = `[verse]\n${cfg.lyrics}`;
    }

    // --- Trim lyrics that appear inside instrumental‑only segments -----------------
    // SongGeneration requires that [intro*], [inst*] and [outro*] blocks remain empty.
    // We therefore keep the tag line itself but drop every subsequent line until
    // the next segment tag.
    const instrumentalTags = new Set([
      'intro', 'intro-short', 'intro-medium', 'intro-long',
      'inst',  'inst-short',  'inst-medium', 'inst-long',
      'outro', 'outro-short', 'outro-medium', 'outro-long'
    ]);

    const cleaned = [];
    let skip = false;
    for (const line of cfg.lyrics.split('\n')) {
      const tagMatch = line.match(/^\s*\[([a-z-]+)\]/i);
      if (tagMatch) {
        // Start of a new segment
        const tag = tagMatch[1].toLowerCase();
        skip = instrumentalTags.has(tag);
        cleaned.push(line.trim());
      } else if (!skip && line.trim() !== '') {
        cleaned.push(line.trim());
      }
      // If skip==true we ignore lyric lines until the next segment tag
    }
    cfg.lyrics = cleaned.join('\n');

    // Build payload for /generate_song
    // Order is fixed: [lyrics, description, prompt_audio, genre, cfg_coef, temperature, top_k]
    const payload = [
      cfg.lyrics,
      cfg.description,
      null,                   // placeholder for prompt audio (may remain null)
      cfg.genre,
      cfg.cfg_coef,
      cfg.temperature,
      cfg.top_k
    ];

    if (cfg.prompt_audio) {
      try {
        payload[2] = await handle_file(cfg.prompt_audio);
      } catch (err) {
        console.warn('[PostToLeo] Could not load prompt_audio →', err.message);
      }
    }

    console.log('[PostToLeo] Sending payload:', payload);

    let result;
    try {
      result = await this._cli.predict('/generate_song', payload, (evt) => {
        console.log('[PostToLeo] progress:', evt);
      });

      console.log('[PostToLeo] raw result →', result);
    } catch (err) {
      console.error('[PostToLeo] Gradio error:', err);
      throw err;
    }

    const [audioFile, infoJson] = result?.data ?? result;
    if (!audioFile) {
      throw new Error('SongGeneration returned empty response');
    }

    // `audioFile` can be a string URL or a Gradio FileData object
    const fileUrl = typeof audioFile === 'string'
      ? audioFile
      : (audioFile?.url ?? audioFile?.path ?? '');
    if (!fileUrl) throw new Error('SongGeneration response missing file URL');

    const response = await fetch(fileUrl);
    const audioBuffer = await response.arrayBuffer();
    if (!audioBuffer || audioBuffer.byteLength === 0) {
      throw new Error('SongGeneration returned empty audio buffer');
    }

    const extMatch = /\.(\w+)(?:\?|$)/.exec(audioFile);
    const srcExt = extMatch ? `.${extMatch[1]}`.toLowerCase() : '.wav';

    return this._saveAudio(audioBuffer, { lyrics: cfg.lyrics, description: cfg.description, info: infoJson }, srcExt);
  }
}

export default {
  init: async (config) => {
    const inst = new PostToLeo(config);
    return inst.init();
  }
};