import PostTo from '../PostTo.js';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { joinOutPath } from '../utils.js';
import { downloadToFile, saveJSON } from './../save-utils.js';

import crypto from 'crypto';
import FormData from 'form-data';
import { createLogger } from '../logger.js';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

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
const MIRELO_MODEL_VERSIONS = new Set(['1.0', '1.5', 'latest']);
const DEFAULT_MAX_SFX_DURATION = 7.9;
const MIN_MIRELO_SFX_DURATION = 1;

const normalizeMireloModelVersion = (value) => {
  const v = String(value ?? '').trim();
  if (MIRELO_MODEL_VERSIONS.has(v)) return v;
  return 'latest';
};

const logger = createLogger('mirelo', { envKeys: ['MIRELO_DEBUG'] });
const MEDIA_BINARY_CANDIDATES = {
  ffmpeg: ['/usr/local/bin/ffmpeg', '/opt/homebrew/bin/ffmpeg', 'ffmpeg'],
  ffprobe: ['/usr/local/bin/ffprobe', '/opt/homebrew/bin/ffprobe', 'ffprobe'],
};

const resolveMediaBinary = (cmd) => {
  const candidates = Array.isArray(MEDIA_BINARY_CANDIDATES[cmd]) ? MEDIA_BINARY_CANDIDATES[cmd] : [cmd];
  for (const candidate of candidates) {
    if (!candidate.includes('/')) {
      return candidate;
    }
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return cmd;
};

function execMedia(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const resolvedCmd = resolveMediaBinary(cmd);
    const child = spawn(resolvedCmd, args, { stdio: ['ignore', 'pipe', 'pipe'], ...opts });
    let stderr = '';
    let stdout = '';

    child.stdout?.on('data', (chunk) => {
      stdout += String(chunk);
    });
    child.stderr?.on('data', (chunk) => {
      stderr += String(chunk);
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      reject(new Error(`${resolvedCmd} exited ${code}${stderr ? `: ${stderr.trim()}` : ''}`));
    });
  });
}

async function probeDurationSeconds(inputPath) {
  const { stdout } = await execMedia('ffprobe', [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1',
    inputPath,
  ]);
  const duration = Number.parseFloat(String(stdout).trim());
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error(`Invalid duration for ${inputPath}: ${String(stdout).trim()}`);
  }
  return duration;
}

export function planMireloChunks(totalDurationSeconds, maxChunkDurationSeconds = DEFAULT_MAX_SFX_DURATION) {
  const total = Number(totalDurationSeconds);
  const maxChunk = Number(maxChunkDurationSeconds);
  if (!Number.isFinite(total) || total <= 0) {
    return [];
  }
  if (!Number.isFinite(maxChunk) || maxChunk <= 0) {
    return [{ index: 0, start: 0, duration: Number(total.toFixed(3)) }];
  }
  const totalMs = Math.round(total * 1000);
  const maxChunkMs = Math.floor(maxChunk * 1000);
  const minChunkMs = MIN_MIRELO_SFX_DURATION * 1000;
  if (totalMs <= 0) {
    return [];
  }
  if (maxChunkMs < minChunkMs || totalMs <= maxChunkMs || totalMs < minChunkMs) {
    return [{ index: 0, start: 0, duration: totalMs / 1000 }];
  }

  const chunkCount = Math.ceil(totalMs / maxChunkMs);
  const chunks = [];
  let startMs = 0;

  for (let index = 0; index < chunkCount; index += 1) {
    const remainingChunks = chunkCount - index;
    const remainingMs = totalMs - startMs;
    const durationMs = remainingChunks === 1
      ? remainingMs
      : Math.min(maxChunkMs, remainingMs - (remainingChunks - 1) * minChunkMs);

    chunks.push({
      index,
      start: startMs / 1000,
      duration: durationMs / 1000,
    });
    startMs += durationMs;
  }

  return chunks;
}

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
    this.config.max_sfx_duration = Number(this.config.max_sfx_duration ?? process.env.MIRELO_MAX_SFX_DURATION ?? DEFAULT_MAX_SFX_DURATION);
    this.config.num_samples = this.config.num_samples ?? 1;
    this.config.steps = this.config.steps ?? 25;
    this.config.seed = typeof this.config.seed === 'number' ? this.config.seed : -1;
    this.config.creativity_coef = this.config.creativity_coef ?? 4.5;
    this.config.model_version = normalizeMireloModelVersion(
      this.config.model_version ?? process.env.MIRELO_MODEL_VERSION ?? 'latest'
    );
    // Retry knobs for transient API errors (5xx/429)
    this.config.maxRetries5xx = this.config.maxRetries5xx ?? 2;
    this.config.retryDelayMs = this.config.retryDelayMs ?? 1500;
    // Fallback: if upstream returns 5xx and video_url looks ephemeral
    this.config.try_rehost_on_5xx = this.config.try_rehost_on_5xx ?? true;
    // Optional fallback demo URL (lets local-path tests run without an uploadFn)
    // Only use a demo fallback when it is explicitly configured.
    this.config.fallback_demo_url = this.config.fallback_demo_url ?? process.env.MIRELO_FALLBACK_DEMO_URL ?? '';

    const mask = (v) => (typeof v === 'string' && v.length > 6 ? `${v.slice(0, 3)}…${v.slice(-3)}` : v);
    const masked = { ...this.config, api_key: this.config.api_key ? mask(String(this.config.api_key)) : undefined };
    logger.payload('prompt config', masked);
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

    const mask = (v) => (typeof v === 'string' && v.length > 6 ? `${v.slice(0, 3)}…${v.slice(-3)}` : (v ? 'set' : undefined));
    logger.payload('auth headers', {
      Authorization: headers['Authorization'] ? `Bearer ${mask(key)}` : undefined,
      'x-api-key': headers['x-api-key'] ? mask(key) : undefined,
      'Content-Type': headers['Content-Type'],
      Accept: headers.Accept,
      mode,
    });
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

      logger.netRequest({
        method: 'POST',
        url,
        label: `${endpoint} attempt ${attempt + 1}`,
        headers: { mode: currentMode, usingHeaders: this.lastAuthInfo.headerKeys },
        body,
      });

      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body)
      });

      const text = await res.text().catch(() => '');
      logger.netResponse({
        method: 'POST',
        url,
        label: `${endpoint} attempt ${attempt + 1}`,
        status: res.status,
        statusText: res.statusText,
        body: text,
      });

      if (res.ok) {
        try { return JSON.parse(text); } catch { return text; }
      }

      // 401 Unauthorized fallback: try alternate auth scheme once
      if (res.status === 401 && usedAuthFallback === false && (this.config.tryAuthFallback401 ?? true)) {
        const altMode = currentMode === 'x-api-key' ? 'bearer' : 'x-api-key';
        logger.warn('401 with', currentMode, 'auth; retrying once with', altMode);
        currentMode = altMode;
        usedAuthFallback = true;
        // retry immediately
        continue;
      }

      // Retry on transient statuses
      if ((res.status >= 500 || res.status === 429) && attempt < maxRetries) {
        const delay = baseDelay * Math.pow(2, attempt) + Math.floor(Math.random() * 200);
        logger.warn('retrying due to', res.status, 'in', delay, 'ms');
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

    logger.netRequest({
      method: 'POST',
      url,
      label: `${endpoint} form-data`,
      headers: { headerKeys: Object.keys(headers) },
      body: { kind: 'form-data' },
    });

    const res = await fetch(url, { method: 'POST', headers, body: form });
    const text = await res.text().catch(() => '');
    logger.netResponse({
      method: 'POST',
      url,
      label: `${endpoint} form-data`,
      status: res.status,
      statusText: res.statusText,
      body: text,
    });
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
          if (this.config.fallback_demo_url && isHttpUrl(this.config.fallback_demo_url)) {
            logger.warn('uploadFn failed, falling back to demo URL:', e?.message || e);
            return this.config.fallback_demo_url;
          }
          logger.warn('uploadFn failed and no demo fallback is configured:', e?.message || e);
          throw e;
        }
      }

      if (this.config.fallback_demo_url && isHttpUrl(this.config.fallback_demo_url)) {
        logger.warn('No uploadFn configured; using fallback demo URL');
        return this.config.fallback_demo_url;
      }

      throw new Error('Local file path provided but no uploadFn configured. Set uploadFn or enable auto-upload.');
    }

    throw new Error('Unsupported video input. Pass an http(s) URL or a local path plus config.uploadFn.');
  }

  _looksEphemeralUrl(u) {
    try {
      const url = new URL(String(u));
      const host = url.hostname || '';
      const pathLower = (url.pathname + url.search).toLowerCase();
      if (/hf\.space$/i.test(host)) return true; // Hugging Face Spaces often issue temp gradio URLs
      if (pathLower.includes('/tmp/gradio')) return true;
      if (pathLower.includes('gradio_api/file=')) return true;
      return false;
    } catch {
      return false;
    }
  }

  async _rehostRemoteToStable(remoteUrl) {
    // Download remote to a temp file, then upload via transfer.sh
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mirelo-rehost-'));
    const tmpPath = path.join(tmpDir, `video-${Date.now()}.mp4`);
    await downloadToFile(remoteUrl, tmpPath);
    const stableUrl = await uploadViaTransferSh(tmpPath, path.basename(tmpPath));
    return { stableUrl, tmpPath };
  }

  async _resolveDurationOption(options = {}, inputPath = null) {
    let duration = options.duration ?? this.config.duration;
    if (typeof duration === 'function') {
      duration = await duration(inputPath, options);
    }
    const numeric = Number(duration);
    return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
  }

  _getMaxSfxDuration(options = {}) {
    const value = Number(options.max_sfx_duration ?? this.config.max_sfx_duration ?? DEFAULT_MAX_SFX_DURATION);
    return Number.isFinite(value) && value > 0 ? value : DEFAULT_MAX_SFX_DURATION;
  }

  async _ensureLocalVideoPath(input) {
    if (typeof input === 'string' && !isHttpUrl(input) && await fs.pathExists(input)) {
      return path.resolve(input);
    }
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mirelo-local-video-'));
    const ext = path.extname(String(input || '')).toLowerCase() || '.mp4';
    const tmpPath = path.join(tmpDir, `input${ext === '.json' ? '.mp4' : ext}`);
    await downloadToFile(input, tmpPath);
    return tmpPath;
  }

  async _splitVideoIntoChunks(localVideoPath, chunkPlan) {
    const chunkDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mirelo-sfx-chunks-'));
    const chunkPaths = [];

    for (const chunk of chunkPlan) {
      const chunkPath = path.join(chunkDir, `chunk-${String(chunk.index).padStart(3, '0')}.mp4`);
      await execMedia('ffmpeg', [
        '-hide_banner',
        '-loglevel', 'error',
        '-y',
        '-ss', String(chunk.start),
        '-t', String(chunk.duration),
        '-i', localVideoPath,
        '-an',
        '-c:v', 'libx264',
        '-preset', 'veryfast',
        '-pix_fmt', 'yuv420p',
        chunkPath,
      ]);
      chunkPaths.push(chunkPath);
    }

    return chunkPaths;
  }

  async _concatAudioFiles(audioPaths) {
    if (!Array.isArray(audioPaths) || audioPaths.length === 0) {
      return null;
    }
    if (audioPaths.length === 1) {
      return audioPaths[0];
    }

    const concatDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mirelo-sfx-concat-'));
    const listFile = path.join(concatDir, 'concat.txt');
    const outPath = path.join(this.imageDir, `${Date.now()}-mirelo-sfx.wav`);
    const listBody = audioPaths.map((audioPath) => `file '${audioPath.replace(/'/g, `'\\''`)}'`).join('\n');
    await fs.writeFile(listFile, listBody, 'utf8');
    await execMedia('ffmpeg', [
      '-hide_banner',
      '-loglevel', 'error',
      '-y',
      '-f', 'concat',
      '-safe', '0',
      '-i', listFile,
      '-c:a', 'pcm_s16le',
      outPath,
    ]);
    return outPath;
  }

  async _runVideoToSfxSingle(videoInput, options = {}) {
    const video_url = await this._ensureVideoUrl(videoInput);
    const resolvedDuration = await this._resolveDurationOption(options, videoInput);

    const payload = {
      video_url,
      duration: resolvedDuration,
      num_samples: options.num_samples ?? this.config.num_samples,
      steps: options.steps ?? this.config.steps,
      seed: typeof options.seed === 'number' ? options.seed : this.config.seed,
      creativity_coef: options.creativity_coef ?? this.config.creativity_coef,
      model_version: normalizeMireloModelVersion(options.model_version ?? this.config.model_version),
      return_audio_only: true,
    };

    if (!payload.duration) {
      delete payload.duration;
    }

    if (typeof options.prompt === 'string' && options.prompt.trim().length > 0) {
      //either url or t-prompt --  payload.text_prompt = options.prompt;
    }

    logger.payload('/video-to-sfx payload', payload);

    try {
      const json = await this._postJSON('/video-to-sfx', payload);

      const out = json?.outputs?.[0] || json?.data?.[0] || json;
      const assetUrl =
        out?.audio_url ||
        out?.url ||
        out?.audio ||
        json?.output_paths?.[0] ||
        null;

      if (assetUrl && isHttpUrl(assetUrl)) {
        const fnameAudio = `${Date.now()}-mirelo-sfx.wav`;
        const savePath = path.join(this.imageDir, fnameAudio);

        const returnData = {
          file: await downloadToFile(assetUrl, savePath),
          json: await saveJSON(savePath, { endpoint: '/video-to-sfx', ...payload })

        };

        return returnData;
      }

      const jsonPath = await saveJSON(
        path.join(this.imageDir, `${Date.now()}-mirelo-sfx.json`),
        { endpoint: '/video-to-sfx', ...payload, response: out ?? json }
      );

      return { json: jsonPath };
    } catch (e) {
      const errMsg = String(e?.message || e);
      const errPath = await saveJSON(path.join(this.imageDir, `${Date.now()}-mirelo-sfx.error.json`), {
        endpoint: '/video-to-sfx',
        ...payload,
        error: errMsg,
        auth_mode_used: this.lastAuthInfo?.mode,
        headers_used: this.lastAuthInfo?.headerKeys,
      });

      const looksEphemeral = this._looksEphemeralUrl(video_url);
      const is5xx = /(^|\s)(5\d\d)(\s|:)/.test(errMsg) || /Internal Server Error/i.test(errMsg);
      if (this.config.try_rehost_on_5xx && looksEphemeral && is5xx) {
        try {
          logger.warn('5xx on ephemeral URL; rehosting and retrying once.');
          const { stableUrl } = await this._rehostRemoteToStable(video_url);
          const retryPayload = { ...payload, video_url: stableUrl };
          const json = await this._postJSON('/video-to-sfx', retryPayload);
          const out = json?.outputs?.[0] || json?.data?.[0] || json;
          const assetUrl = out?.audio_url || out?.url || out?.audio || json?.output_paths?.[0] || null;
          if (assetUrl && isHttpUrl(assetUrl)) {
            const fnameAudio = `${Date.now()}-mirelo-sfx.wav`;
            const savePath = path.join(this.imageDir, fnameAudio);
            const filePath = await downloadToFile(assetUrl, savePath);
            const sidecar = await saveJSON(savePath, { endpoint: '/video-to-sfx', ...retryPayload, rehosted: true });
            return { file: filePath, json: sidecar };
          }
          const jsonPath = await saveJSON(
            path.join(this.imageDir, `${Date.now()}-mirelo-sfx.json`),
            { endpoint: '/video-to-sfx', ...retryPayload, rehosted: true, response: out ?? json }
          );
          return { json: jsonPath };
        } catch (rehostErr) {
          const rehostPath = await saveJSON(path.join(this.imageDir, `${Date.now()}-mirelo-sfx.rehost.error.json`), {
            endpoint: '/video-to-sfx',
            ...payload,
            error: String(rehostErr?.message || rehostErr),
            original_error_sidecar: path.basename(errPath),
            attempted_rehost: looksEphemeral,
          });
          return { json: rehostPath };
        }
      }

      return { json: errPath };
    }
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
      model_version: normalizeMireloModelVersion(options.model_version ?? this.config.model_version),
    };

    if (typeof options.text_prompt === 'string' && options.text_prompt.trim().length > 0) {
      payload.text_prompt = options.text_prompt;
    }

    logger.payload('/video-to-video payload', payload);

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
    // duration may be a number/string or a function (sync or async) that returns one
    let duration = options.duration ?? this.config.duration;
    if (typeof duration === 'function') {
      // allow functions to accept (localPath, options) and support async returns
      duration = duration();
    }
    form.append('duration', String(duration));

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
        logger.warn('/video-to-video form-data unsupported; falling back to upload+JSON. Reason:', msg);
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
    const maxSfxDuration = this._getMaxSfxDuration(options);
    const requestedDuration = await this._resolveDurationOption(options, videoInput);
    if (requestedDuration && requestedDuration <= maxSfxDuration) {
      return this._runVideoToSfxSingle(videoInput, { ...options, duration: requestedDuration });
    }

    const localVideoPath = await this._ensureLocalVideoPath(videoInput);
    const actualDuration = await probeDurationSeconds(localVideoPath);
    const totalDuration = requestedDuration ? Math.min(requestedDuration, actualDuration) : actualDuration;
    if (totalDuration <= maxSfxDuration) {
      return this._runVideoToSfxSingle(localVideoPath, { ...options, duration: totalDuration });
    }

    const chunkPlan = planMireloChunks(totalDuration, maxSfxDuration);
    logger.payload('mirelo sfx chunk plan', { totalDuration, maxSfxDuration, chunks: chunkPlan });
    const chunkPaths = await this._splitVideoIntoChunks(localVideoPath, chunkPlan);
    const chunkResults = [];
    const audioPaths = [];

    for (const [index, chunkPath] of chunkPaths.entries()) {
      const chunk = chunkPlan[index];
      const chunkResult = await this._runVideoToSfxSingle(chunkPath, {
        ...options,
        duration: chunk.duration,
      });
      chunkResults.push({
        index: chunk.index,
        start: chunk.start,
        duration: chunk.duration,
        file: chunkResult?.file || null,
        json: chunkResult?.json || null,
      });
      if (!chunkResult?.file) {
        const failurePath = await saveJSON(path.join(this.imageDir, `${Date.now()}-mirelo-sfx.chunks.error.json`), {
          endpoint: '/video-to-sfx',
          error: `Mirelo chunk ${chunk.index} did not return an audio file`,
          maxSfxDuration,
          requestedDuration,
          totalDuration,
          chunkPlan,
          chunkResults,
        });
        return { json: failurePath };
      }
      audioPaths.push(chunkResult.file);
    }

    const concatenatedAudioPath = await this._concatAudioFiles(audioPaths);
    const jsonPath = await saveJSON(concatenatedAudioPath, {
      endpoint: '/video-to-sfx',
      chunked: true,
      maxSfxDuration,
      requestedDuration,
      totalDuration,
      chunkPlan,
      chunkResults,
    });
    return { file: concatenatedAudioPath, json: jsonPath };
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
