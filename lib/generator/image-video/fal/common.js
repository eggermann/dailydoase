import fs from 'fs-extra';
import path from 'path';

import { createLogger } from '../../logger.js';
import { downloadToFile, saveJSON } from '../../save-utils.js';
import { normalizeVideoDurationSeconds } from '../../ffmpeg-helpers.js';
import {
  buildVideoRunMetrics,
  estimateFalWanCostUsd,
  formatVideoRunSummary,
} from '../../video-run-metrics.js';

const logger = createLogger('fal:video', { envKeys: ['FAL_DEBUG', 'GENERATOR_DEBUG'] });

const MIME_BY_EXT = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

const isHttpUrl = (value) => typeof value === 'string' && /^https?:\/\//i.test(value);

const extractText = (value) => {
  if (!value) return '';
  if (typeof value === 'string') return value.trim();
  if (Array.isArray(value)) return value.map((item) => extractText(item)).filter(Boolean).join(' ').trim();
  if (Array.isArray(value?.detail)) return value.detail.map((item) => extractText(item)).filter(Boolean).join(' ').trim();
  if (typeof value?.message === 'string') return value.message.trim();
  if (typeof value?.detail === 'string') return value.detail.trim();
  if (typeof value?.error === 'string') return value.error.trim();
  if (typeof value?.status === 'string') return value.status.trim();
  if (typeof value?.msg === 'string') return value.msg.trim();
  return '';
};

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
    if (typeof value.video_url === 'string') out.push(value.video_url);
    if (typeof value.video === 'string') out.push(value.video);
    if (value.video && typeof value.video === 'object') collectVideoRefs(value.video, out);
    if (Array.isArray(value.videos)) collectVideoRefs(value.videos, out);
    for (const nested of Object.values(value)) collectVideoRefs(nested, out);
  }
  return out;
};

const normalizeModelPath = (value) => String(value || '').replace(/^\/+|\/+$/g, '');

let fetchImplPromise = null;

const getFetch = async () => {
  if (typeof globalThis.fetch === 'function') {
    return globalThis.fetch.bind(globalThis);
  }
  if (!fetchImplPromise) {
    fetchImplPromise = import('node-fetch').then((mod) => mod.default || mod);
  }
  const resolved = await fetchImplPromise;
  if (typeof resolved !== 'function') {
    throw new Error('Fetch is not available for fal.ai requests');
  }
  return resolved;
};

export const resolveFalKey = (env = process.env) => env.FAL_KEY || env.FAL_API_KEY || env.FAL_AI_API_KEY || '';

export const normalizeFalAspectRatio = (value, fallback = 'auto') => {
  const normalized = String(value || '').trim();
  if (['auto', '16:9', '9:16', '1:1'].includes(normalized)) {
    return normalized;
  }
  return fallback;
};

const resolvePositiveNumber = (...values) => {
  for (const value of values) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return null;
};

export const resolveFalResolution = ({
  resolution,
  width,
  height,
  fallback = '720p',
} = {}) => {
  const normalizedResolution = String(resolution || '').trim();
  if (normalizedResolution) {
    return normalizedResolution;
  }

  const resolvedWidth = resolvePositiveNumber(width);
  const resolvedHeight = resolvePositiveNumber(height);
  if (!resolvedWidth || !resolvedHeight) {
    return fallback;
  }

  const maxDimension = Math.max(resolvedWidth, resolvedHeight);
  const area = resolvedWidth * resolvedHeight;

  if (maxDimension <= 854 && area <= 854 * 480) {
    return '480p';
  }
  if (maxDimension <= 1280 && area <= 1280 * 720) {
    return '720p';
  }
  if (maxDimension <= 1920 && area <= 1920 * 1080) {
    return '1080p';
  }
  return fallback;
};

export const imagePathToDataUrl = async (imagePath) => {
  const resolvedPath = path.resolve(String(imagePath));
  const ext = path.extname(resolvedPath).toLowerCase();
  const mimeType = MIME_BY_EXT[ext] || 'application/octet-stream';
  const buffer = await fs.readFile(resolvedPath);
  return `data:${mimeType};base64,${buffer.toString('base64')}`;
};

export const submitFalJob = async ({ model, payload, falKey, timeoutMs = 15 * 60 * 1000 }) => {
  const fetchImpl = await getFetch();
  if (!falKey) {
    throw new Error('Missing fal.ai API key');
  }

  const modelPath = normalizeModelPath(model);
  const submitUrl = `https://queue.fal.run/${modelPath}`;
  const headers = {
    Authorization: `Key ${falKey}`,
    'Content-Type': 'application/json',
  };

  logger.netRequest({
    method: 'POST',
    url: submitUrl,
    body: payload,
    headers,
    label: 'fal-submit',
  });

  const submitRes = await fetchImpl(submitUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
  const submitJson = await submitRes.json().catch(() => ({}));
  logger.netResponse({
    method: 'POST',
    url: submitUrl,
    status: submitRes.status,
    statusText: submitRes.statusText,
    body: submitJson,
    label: 'fal-submit',
  });

  if (!submitRes.ok) {
    throw new Error(`fal.ai submit failed: ${submitRes.status} ${submitRes.statusText} ${extractText(submitJson)}`.trim());
  }

  const requestId = submitJson?.request_id || submitJson?.requestId || '';
  const statusUrl = submitJson?.status_url || submitJson?.statusUrl || (requestId ? `https://queue.fal.run/${modelPath}/requests/${requestId}/status` : '');
  const responseUrl = submitJson?.response_url || submitJson?.responseUrl || (requestId ? `https://queue.fal.run/${modelPath}/requests/${requestId}` : '');

  if (!requestId && !responseUrl) {
    return submitJson;
  }

  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const currentUrl = statusUrl || responseUrl;
    const statusRes = await fetchImpl(currentUrl, { headers });
    const statusJson = await statusRes.json().catch(() => ({}));

    if (!statusRes.ok) {
      throw new Error(`fal.ai status failed: ${statusRes.status} ${statusRes.statusText} ${extractText(statusJson)}`.trim());
    }

    const status = String(
      statusJson?.status
      || statusJson?.state
      || statusJson?.request?.status
      || ''
    ).toUpperCase();

    if (status.includes('COMPLETED')) {
      const resultUrl = responseUrl || currentUrl.replace(/\/status$/, '');
      const resultRes = await fetchImpl(resultUrl, { headers });
      const resultJson = await resultRes.json().catch(() => ({}));
      if (!resultRes.ok) {
        throw new Error(`fal.ai result failed: ${resultRes.status} ${resultRes.statusText} ${extractText(resultJson)}`.trim());
      }
      return resultJson?.response || resultJson;
    }

    if (status.includes('FAILED') || status.includes('ERROR') || status.includes('CANCEL')) {
      throw new Error(`fal.ai video request failed: ${extractText(statusJson) || status}`);
    }

    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }

  throw new Error(`fal.ai video request timed out after ${timeoutMs}ms`);
};

export const saveFalVideoResult = async ({
  imageDir,
  filePrefix,
  model,
  payload,
  result,
  targetDurationSeconds = null,
  targetFps = 24,
  elapsedMs = null,
  provider = 'fal-ai',
  runtime = 'fal-api',
}) => {
  const refs = collectVideoRefs(result);
  const url = refs.find(isHttpUrl) || '';
  if (!url) {
    throw new Error('fal.ai video response returned no downloadable video url');
  }

  const savePath = path.join(imageDir, `${filePrefix}.mp4`);
  await downloadToFile(url, savePath, { timeoutMs: 15 * 60 * 1000 });
  if (Number.isFinite(Number(targetDurationSeconds)) && Number(targetDurationSeconds) > 0) {
    await normalizeVideoDurationSeconds(savePath, Number(targetDurationSeconds), { targetFps });
  }
  const metrics = buildVideoRunMetrics({
    runtime,
    provider,
    model,
    elapsedMs,
    outputDurationSeconds: targetDurationSeconds,
    estimatedCostUsd: estimateFalWanCostUsd({
      model,
      resolution: payload?.resolution,
      width: payload?.width ?? payload?.target_size?.width,
      height: payload?.height ?? payload?.target_size?.height,
      numFrames: payload?.num_frames,
      durationSeconds: targetDurationSeconds,
    }),
    resolution: payload?.resolution,
    width: payload?.width ?? payload?.target_size?.width,
    height: payload?.height ?? payload?.target_size?.height,
    numFrames: payload?.num_frames,
    costSource: 'fal-wan-public-pricing-estimate',
  });
  logger.info(formatVideoRunSummary(metrics));
  const json = await saveJSON(savePath, {
    provider,
    model,
    url,
    sourceUrl: url,
    payload,
    raw: result,
    metrics,
  });
  return { file: savePath, json };
};

export default {
  resolveFalKey,
  imagePathToDataUrl,
  submitFalJob,
  saveFalVideoResult,
};
