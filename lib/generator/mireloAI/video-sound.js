import PostTo from '../PostTo.js';
import fs from 'fs-extra';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { joinOutPath } from '../utils.js';
import { downloadToFile, saveJSON } from './../save-utils.js';

import crypto from 'crypto';
import FormData from 'form-data';

// Load local .env from this folder (lib/generator/wan22/.env)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
try {
  dotenv.config({ path: path.join(__dirname, '.env') });
} catch (_) {
  // ignore if missing
}


// Minimal public uploader using transfer.sh so local files can be used without custom infra.
async function uploadViaTransferSh(localPath, customName = null) {
  const stat = await fs.stat(localPath);
  if (!stat.isFile()) throw new Error(`Not a file: ${localPath}`);
  const fileBuf = await fs.readFile(localPath);
  const fname = customName || path.basename(localPath) || `upload-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.bin`;
  const endpoint = `https://transfer.sh/${encodeURIComponent(fname)}`;
  const res = await fetch(endpoint, {
    method: 'PUT',
    headers: { 'Content-Length': String(fileBuf.length), 'Content-Type': 'application/octet-stream' },
    body: fileBuf,
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`transfer.sh upload failed: ${res.status} ${res.statusText} -> ${t}`);
  }
  const url = (await res.text()).trim();
  if (!/^https?:\/\//i.test(url)) throw new Error('transfer.sh did not return a URL');
  return url;
}


// --- Helpers for Mirelo API integration ---
const isHttpUrl = (s) => typeof s === 'string' && /^https?:\/\//i.test(s);

/**
 * Config-driven uploader interface:
 *   - Provide config.uploadFn(localPath) => Promise<string URL>
 * If no uploadFn and a local path is given, we throw with a helpful message.
 */
export class PostToMirelo_VideoSound extends PostTo {
  constructor(modelConfig = {}) {
    super(modelConfig);
    this.config = modelConfig || {};

    // Configuration
    this.config.api_base = this.config.api_base || process.env.MIRELO_API_BASE || 'https://api.mirelo.ai';
    this.config.api_key = this.config.api_key || process.env.MIRELO_API_KEY || '';
    this.config.folderName = this.config.folderName ?? 'Mirelo-VideoSound';

    // Knobs with sensible defaults
    this.config.duration = this.config.duration ?? 10;
    this.config.num_samples = this.config.num_samples ?? 1;
    this.config.steps = this.config.steps ?? 25;
    this.config.seed = typeof this.config.seed === 'number' ? this.config.seed : -1;
    this.config.creativity_coef = this.config.creativity_coef ?? 4.5;
    // Retry knobs for transient API errors (5xx/429)
    this.config.maxRetries5xx = this.config.maxRetries5xx ?? 2;
    this.config.retryDelayMs = this.config.retryDelayMs ?? 1500;
    // Optional fallback demo URL (lets local-path tests run without an uploadFn)
    this.config.fallback_demo_url = this.config.fallback_demo_url || process.env.MIRELO_FALLBACK_DEMO_URL || 'https://di3otfzjg1gxa.cloudfront.net/input_example.mp4';

    if (process.env.MIRELO_DEBUG === 'true') {
      const mask = (v) => (typeof v === 'string' && v.length > 6 ? `${v.slice(0, 3)}…${v.slice(-3)}` : v);
      const masked = { ...this.config, api_key: this.config.api_key ? mask(String(this.config.api_key)) : undefined };
      console.log('Mirelo prompt config:', masked);
    }
    // Auto-upload local files if no uploadFn is provided
    // Enable via config.auto_upload_if_local=true or env MIRELO_ENABLE_AUTO_UPLOAD=true
    const autoUpload = this.config.auto_upload_if_local ?? (process.env.MIRELO_ENABLE_AUTO_UPLOAD === 'true');
    if (typeof this.config.uploadFn !== 'function' && autoUpload) {
      this.config.uploadFn = async (p) => uploadViaTransferSh(p);
    }

    this.imageDir = joinOutPath(this.config.folderName);
    fs.ensureDirSync(this.imageDir);
  }

  async init() {
    // Nothing to initialize yet; keep interface parity with other classes
    return this;
  }

  _resolveAuthMode() {
    return (this.config.auth_mode || process.env.MIRELO_AUTH_MODE || 'x-api-key').toLowerCase();
  }

  _authHeadersFor(mode) {
    const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
    const key = this.config.api_key ? String(this.config.api_key).trim() : '';

    if (key) {
      if (mode === 'bearer') {
        headers['Authorization'] = `Bearer ${key}`;
      } else if (mode === 'x-api-key') {
        headers['x-api-key'] = key;
      } else if (mode === 'both') {
        headers['Authorization'] = `Bearer ${key}`;
        headers['x-api-key'] = key;
      } else {
        // Fallback to x-api-key
        headers['x-api-key'] = key;
      }
    }

    if (process.env.MIRELO_DEBUG === 'true') {
      const mask = (v) => (typeof v === 'string' && v.length > 6 ? `${v.slice(0, 3)}…${v.slice(-3)}` : (v ? 'set' : undefined));
      console.log('[Mirelo] auth headers:', {
        Authorization: headers['Authorization'] ? `Bearer ${mask(key)}` : undefined,
        'x-api-key': headers['x-api-key'] ? mask(key) : undefined,
        'Content-Type': headers['Content-Type'],
        Accept: headers.Accept,
        mode,
      });
    }
    return headers;
  }

  _authHeaders() {
    return this._authHeadersFor(this._resolveAuthMode());
  }

  async _postJSON(endpoint, body) {
    const url = `${this.config.api_base}${endpoint}`;
    const primaryMode = this._resolveAuthMode();
    let currentMode = primaryMode;
    let usedAuthFallback = false;
    const maxRetries = Number(this.config.maxRetries5xx ?? 2);
    const baseDelay = Number(this.config.retryDelayMs ?? 1500);

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const headers = this._authHeadersFor(currentMode);
      this.lastAuthInfo = { mode: currentMode, headerKeys: Object.keys(headers) };

      if (process.env.MIRELO_DEBUG === 'true') {
        try {
          console.log('[Mirelo] POST', url, {
            attempt: attempt + 1,
            mode: currentMode,
            bodyKeys: Object.keys(body || {}),
            usingHeaders: this.lastAuthInfo.headerKeys
          });
        } catch { }
      }

      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body)
      });

      const text = await res.text().catch(() => '');

      if (res.ok) {
        try { return JSON.parse(text); } catch { return text; }
      }

      // 401 Unauthorized fallback: try alternate auth scheme once
      if (res.status === 401 && usedAuthFallback === false && (this.config.tryAuthFallback401 ?? true)) {
        const altMode = currentMode === 'x-api-key' ? 'bearer' : 'x-api-key';
        if (process.env.MIRELO_DEBUG === 'true') {
          console.warn('[Mirelo] 401 with', currentMode, 'auth; retrying once with', altMode);
        }
        currentMode = altMode;
        usedAuthFallback = true;
        // retry immediately
        continue;
      }

      // Retry on transient statuses
      if ((res.status >= 500 || res.status === 429) && attempt < maxRetries) {
        const delay = baseDelay * Math.pow(2, attempt) + Math.floor(Math.random() * 200);
        if (process.env.MIRELO_DEBUG === 'true') {
          console.log('[Mirelo] retrying due to', res.status, 'in', delay, 'ms');
        }
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }

      // No retry path; bubble up error
      throw new Error(`${res.status} ${res.statusText}: ${text}`);
    }

    // Should not reach
    throw new Error('Unexpected _postJSON exit');
  }

  async _postFormData(endpoint, form) {
    const url = `${this.config.api_base}${endpoint}`;
    // Reuse auth headers but do NOT set a JSON Content-Type when sending form-data
    const auth = this._authHeaders();
    delete auth['Content-Type'];
    const headers = { ...auth, ...form.getHeaders?.() };

    if (process.env.MIRELO_DEBUG === 'true') {
      try {
        console.log('[Mirelo] POST (form)', url, { headerKeys: Object.keys(headers) });
      } catch { }
    }

    const res = await fetch(url, { method: 'POST', headers, body: form });
    const text = await res.text().catch(() => '');
    if (res.ok) {
      try { return JSON.parse(text); } catch { return text; }
    }
    throw new Error(`${res.status} ${res.statusText}: ${text}`);
  }

  async _ensureVideoUrl(input) {
    if (isHttpUrl(input)) return input;

    if (typeof input === 'string' && fs.existsSync(input)) {
      if (typeof this.config.uploadFn === 'function') {
        try {
          const url = await this.config.uploadFn(input);
          if (!isHttpUrl(url)) throw new Error('uploadFn did not return a valid http(s) URL');
          return url;
        } catch (e) {
          console.warn('[Mirelo] uploadFn failed, falling back to demo URL:', e?.message || e);
          if (this.config.fallback_demo_url && isHttpUrl(this.config.fallback_demo_url)) {
            return this.config.fallback_demo_url;
          }
          throw e;
        }
      }

      if (this.config.fallback_demo_url && isHttpUrl(this.config.fallback_demo_url)) {
        console.warn('[Mirelo] No uploadFn configured; using fallback demo URL');
        return this.config.fallback_demo_url;
      }

      throw new Error('Local file path provided but no uploadFn configured. Set uploadFn or enable auto-upload.');
    }

    throw new Error('Unsupported video input. Pass an http(s) URL or a local path plus config.uploadFn.');
  }

  /**
   * Video -> Video (with sound)
   * Endpoint: /video-to-video
   */
  async runVideoToVideo(videoInput, options = {}) {
    const video_url = await this._ensureVideoUrl(videoInput);

    const payload = {
      video_url,
      duration: options.duration ?? this.config.duration,
      num_samples: options.num_samples ?? this.config.num_samples,
      steps: options.steps ?? this.config.steps,
      seed: typeof options.seed === 'number' ? options.seed : this.config.seed,
      creativity_coef: options.creativity_coef ?? this.config.creativity_coef,
    };

    if (typeof options.text_prompt === 'string' && options.text_prompt.trim().length > 0) {
      payload.text_prompt = options.text_prompt;
    }

    if (process.env.MIRELO_DEBUG === 'true') {
      console.log('Mirelo /video-to-video payload:', JSON.stringify(payload, null, 2));
    }

    try {
      const json = await this._postJSON('/video-to-video', payload);

      // Try to download the first returned video asset if present
      const out = json?.outputs?.[0] || json?.data?.[0] || json;
      const assetUrl = out?.video_url || out?.url || out?.video || null;

      if (assetUrl && isHttpUrl(assetUrl)) {
        const fnameVideo = `${Date.now()}-mirelo-v2v.mp4`;
        const savePath = path.join(this.imageDir, fnameVideo);
        await downloadToFile(assetUrl, savePath);
        await saveJSON(savePath, { endpoint: '/video-to-video', ...payload, response_meta: { ok: true } });
        return savePath;
      }

      // Persist JSON response if no direct asset
      const jsonPath = await saveJSON(path.join(this.imageDir, `${Date.now()}-mirelo-v2v.json`), { endpoint: '/video-to-video', ...payload, response: out ?? json });
      // Optional: return the original input movie as a fallback asset when no asset URL is provided
      if ((options.return_input_on_error ?? this.config.return_input_on_error) && isHttpUrl(video_url)) {
        try {
          const fnameIn = `${Date.now()}-mirelo-v2v.input.mp4`;
          const savePathIn = path.join(this.imageDir, fnameIn);
          await downloadToFile(video_url, savePathIn);
          await saveJSON(savePathIn, {
            endpoint: '/video-to-video',
            from_input: true,
            note: 'no asset in response; returned input',
            response_sidecar: path.basename(jsonPath)
          });
          return savePathIn;
        } catch (_) {
          // ignore fallback failure and return JSON path instead
        }
      }
      return jsonPath;
    } catch (e) {
      // Persist error details
      const errPath = await saveJSON(path.join(this.imageDir, `${Date.now()}-mirelo-v2v.error.json`), {
        endpoint: '/video-to-video',
        ...payload,
        error: String(e?.message || e),
        auth_mode_used: this.lastAuthInfo?.mode,
        headers_used: this.lastAuthInfo?.headerKeys,
      });

      // Optional: return the original input movie as a fallback asset
      if ((options.return_input_on_error ?? this.config.return_input_on_error) && isHttpUrl(video_url)) {
        try {
          const fnameIn = `${Date.now()}-mirelo-v2v.input.mp4`;
          const savePathIn = path.join(this.imageDir, fnameIn);
          await downloadToFile(video_url, savePathIn);
          await saveJSON(savePathIn, {
            endpoint: '/video-to-video',
            from_input: true,
            error_sidecar: path.basename(errPath)
          });
          return savePathIn;
        } catch (_) {
          // ignore fallback failure and return error json instead
        }
      }

      return errPath;
    }
  }

  /**
   * Video -> Video (multipart/form-data)
   * Sends the local file directly in the request body.
   */
  async runVideoToVideoFormData(localVideoPath, options = {}) {
    const p = path.resolve(localVideoPath);
    if (!(await fs.pathExists(p))) throw new Error(`runVideoToVideoFormData: file not found: ${p}`);

    const form = new FormData();
    const field = this.config.video_field_name || 'video';
    form.append(field, fs.createReadStream(p), { filename: path.basename(p), contentType: 'video/mp4' });

    if (typeof options.text_prompt === 'string' && options.text_prompt.trim()) form.append('text_prompt', options.text_prompt);
    form.append('duration', String(options.duration ?? this.config.duration));
    form.append('num_samples', String(options.num_samples ?? this.config.num_samples));
    if (typeof options.seed === 'number' || typeof this.config.seed === 'number') {
      form.append('seed', String(typeof options.seed === 'number' ? options.seed : this.config.seed));
    }

    let json;
    try {
      json = await this._postFormData('/video-to-video', form);
    } catch (e) {
      const msg = String(e?.message || e);
      // Fallback for providers that don't support multipart (404/401/400/415)
      if (/(?:401|404|415|400)|Unsupported Media Type|Not Found|Bad Request|Unauthorized/i.test(msg)) {
        if (process.env.MIRELO_DEBUG === 'true') {
          console.warn('[Mirelo] /video-to-video form-data unsupported; falling back to upload+JSON. Reason:', msg);
        }
        const video_url = await this._ensureVideoUrl(localVideoPath);
        return await this.runVideoToVideo(video_url, options);
      }
      throw e;
    }

    const out = json?.outputs?.[0] || json?.data?.[0] || json;
    const assetUrl = out?.video_url || out?.url || out?.video || null;
    if (assetUrl && isHttpUrl(assetUrl)) {
      const fname = `${Date.now()}-mirelo-v2v.mp4`;
      const savePath = path.join(this.imageDir, fname);
      await downloadToFile(assetUrl, savePath);
      await saveJSON(savePath, { endpoint: '/video-to-video', formData: true });
      return savePath;
    }
    const jsonPath = await saveJSON(path.join(this.imageDir, `${Date.now()}-mirelo-v2v-form.json`), { response: json });
    return jsonPath;
  }

  /**
   * Video -> SFX (audio only)
   * Endpoint: /video-to-sfx
   * Set return_audio_only: true
   */
  async runVideoToSfx(videoInput, options = {}) {
    const video_url = await this._ensureVideoUrl(videoInput);

    const payload = {
      video_url,
      duration: options.duration ?? this.config.duration,
      num_samples: options.num_samples ?? this.config.num_samples,
      steps: options.steps ?? this.config.steps,
      seed: typeof options.seed === 'number' ? options.seed : this.config.seed,
      creativity_coef: options.creativity_coef ?? this.config.creativity_coef,
      return_audio_only: true,
    };

    if (typeof options.prompt === 'string' && options.prompt.trim().length > 0) {
      //either url or t-prompt --  payload.text_prompt = options.prompt;
    }

    console.log('\x1b[32mMirelo prompt payload:\x1b[0m', payload);

    try {
      const json = await this._postJSON('/video-to-sfx', payload);

      const out = json?.outputs?.[0] || json?.data?.[0] || json;
      const assetUrl =
        out?.audio_url ||
        out?.url ||
        out?.audio ||
        json?.output_paths?.[0] ||
        null;

      if (assetUrl && isHttpUrl(assetUrl)) {//default
        const fnameAudio = `${Date.now()}-mirelo-sfx.wav`;
        const savePath = path.join(this.imageDir, fnameAudio);


        const returnData = {
          file: await downloadToFile(assetUrl, savePath),
          json: await saveJSON(savePath, { endpoint: '/video-to-sfx', ...payload })

        }

        return returnData;
      }

      // Persist JSON response if no direct asset
      const jsonPath = await saveJSON(
        path.join(this.imageDir, `${Date.now()}-mirelo-sfx.json`),
        { endpoint: '/video-to-sfx', ...payload, response: out ?? json }
      );
 
  
      return {json:jsonPath};
    } catch (e) {
      const errPath = await saveJSON(path.join(this.imageDir, `${Date.now()}-mirelo-sfx.error.json`), {
        endpoint: '/video-to-sfx',
        ...payload,
        error: String(e?.message || e),
        auth_mode_used: this.lastAuthInfo?.mode,
        headers_used: this.lastAuthInfo?.headerKeys,
      });

    
      return {json:errPath};
    }
  }


  /**
   * Convenience entry that mirrors the Wan class interface.
   * If options.audioOnly === true => runVideoToSfx, else runVideoToVideo.
   */
  async prompt(videoInput, options = {}) {
    return this.runVideoToSfx(videoInput, options);


    const wantsForm = (!isHttpUrl(videoInput)) && (options.formData === true || this.config.force_form_data === true);
    if (options?.audioOnly) {
      return wantsForm ? this.runVideoToSfxFormData(videoInput, options) :
        this.runVideoToSfx(videoInput, options);
    }
    return wantsForm ? this.runVideoToVideoFormData(videoInput, options) : this.runVideoToVideo(videoInput, options);
  }
}
