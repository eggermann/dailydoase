import fs from 'fs-extra';
import path from 'path';
import { randomUUID } from 'node:crypto';

import { createLogger } from '../../logger.js';
import { downloadToFile, saveJSON } from '../../save-utils.js';
import { normalizeVideoDurationSeconds } from '../../ffmpeg-helpers.js';

const logger = createLogger('runware:video', { envKeys: ['RUNWARE_DEBUG', 'GENERATOR_DEBUG'] });
const API_URL = 'https://api.runware.ai/v1';
const MIME_BY_EXT = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

const extractText = (value) => {
  if (!value) return '';
  if (typeof value === 'string') return value.trim();
  if (Array.isArray(value)) return value.map((item) => extractText(item)).filter(Boolean).join(' ').trim();
  if (typeof value?.message === 'string') return value.message.trim();
  if (typeof value?.code === 'string') return value.code.trim();
  if (typeof value?.status === 'string') return value.status.trim();
  if (value?.errors) return extractText(value.errors);
  if (value?.error) return extractText(value.error);
  if (value?.data) return extractText(value.data);
  return '';
};

const getFetch = () => globalThis.fetch;

export const resolveRunwareKey = (env = process.env) => (
  env.RUNWARE_API_KEY || env.RUNWARE_KEY || ''
);

export const imagePathToDataUrl = async (imagePath) => {
  const resolvedPath = path.resolve(String(imagePath));
  const ext = path.extname(resolvedPath).toLowerCase();
  const mimeType = MIME_BY_EXT[ext] || 'application/octet-stream';
  const buffer = await fs.readFile(resolvedPath);
  return `data:${mimeType};base64,${buffer.toString('base64')}`;
};

export const normalizeRunwareFrameImages = (frameImages = []) => frameImages.map((entry) => {
  if (typeof entry === 'string') return entry;
  const image = entry?.image || entry?.inputImage || '';
  return {
    image,
    ...(entry?.frame !== undefined ? { frame: entry.frame } : {}),
    ...(entry?.timestamp !== undefined ? { timestamp: entry.timestamp } : {}),
  };
});

const isWan27Model = (model) => String(model || '').startsWith('alibaba:wan@2.7');

export const buildRunwareVideoTask = ({
  model,
  prompt,
  durationSeconds,
  width,
  height,
  resolution,
  seed,
  frameImages,
  taskUUID = randomUUID(),
}) => {
  const normalizedFrameImages = normalizeRunwareFrameImages(frameImages);
  const usesWan27 = isWan27Model(model);
  const task = {
    taskType: 'videoInference',
    taskUUID,
    model,
    positivePrompt: prompt || '',
    duration: Number(durationSeconds) || 1,
    numberResults: 1,
    deliveryMethod: 'async',
    includeCost: true,
    inputs: {
      frameImages: normalizedFrameImages,
    },
    ...(usesWan27
      ? {
          settings: {
            audio: false,
            promptExtend: false,
          },
        }
      : {
          providerSettings: {
            alibaba: {
              audio: false,
              promptExtend: false,
              shotType: 'single',
            },
          },
        }),
  };

  // Wan 2.7 requires frameImages instead of width/height. Resolution may still
  // select 720p or 1080p while image aspect ratio determines final dimensions.
  if (!usesWan27 || normalizedFrameImages.length === 0) {
    if (Number.isFinite(Number(width)) && Number(width) > 0) task.width = Number(width);
    if (Number.isFinite(Number(height)) && Number(height) > 0) task.height = Number(height);
  }
  if (!task.width && !task.height && typeof resolution === 'string' && resolution.trim()) {
    task.resolution = resolution.trim();
  }
  if (Number.isFinite(Number(seed))) task.seed = Number(seed);

  return task;
};

export const requestRunware = async ({ body, apiKey, timeoutMs = 0 }) => {
  const fetchImpl = getFetch();
  if (typeof fetchImpl !== 'function') {
    throw new Error('Fetch is not available for Runware requests');
  }
  if (!apiKey) {
    throw new Error('Missing Runware API key');
  }

  logger.netRequest({
    method: 'POST',
    url: API_URL,
    body,
    headers: { Authorization: 'Bearer ***', 'Content-Type': 'application/json' },
    label: 'runware-request',
  });

  const requestTimeoutMs = Number.isFinite(Number(timeoutMs)) && Number(timeoutMs) > 0
    ? Number(timeoutMs)
    : 0;
  const controller = requestTimeoutMs > 0 ? new AbortController() : null;
  const timeout = controller
    ? setTimeout(() => controller.abort(), requestTimeoutMs)
    : null;

  let response;
  let json;
  try {
    response = await fetchImpl(API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      ...(controller ? { signal: controller.signal } : {}),
    });
    json = await response.json().catch(() => ({}));
  } catch (error) {
    if (controller?.signal.aborted) {
      throw new Error(`Runware request timed out after ${requestTimeoutMs}ms`);
    }
    throw error;
  } finally {
    if (timeout) clearTimeout(timeout);
  }

  logger.netResponse({
    method: 'POST',
    url: API_URL,
    status: response.status,
    statusText: response.statusText,
    body: json,
    label: 'runware-request',
  });

  if (!response.ok) {
    throw new Error(`Runware request failed: ${response.status} ${response.statusText} ${extractText(json)}`.trim());
  }

  if (Array.isArray(json?.errors) && json.errors.length > 0) {
    throw new Error(`Runware request failed: ${json.errors.map((item) => extractText(item)).filter(Boolean).join(' | ')}`.trim());
  }

  return json;
};

export const submitRunwareVideoJob = async ({
  apiKey,
  model,
  prompt,
  durationSeconds,
  width,
  height,
  resolution,
  seed,
  frameImages,
  timeoutMs = 15 * 60 * 1000,
  requestTimeoutMs = 90 * 1000,
}) => {
  const taskUUID = randomUUID();
  const task = buildRunwareVideoTask({
    model,
    prompt,
    durationSeconds,
    width,
    height,
    resolution,
    seed,
    frameImages,
    taskUUID,
  });

  await requestRunware({
    apiKey,
    body: [task],
    timeoutMs: requestTimeoutMs,
  });

  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    await new Promise((resolve) => setTimeout(resolve, 2_000));
    const pollJson = await requestRunware({
      apiKey,
      body: [{ taskType: 'getResponse', taskUUID }],
      timeoutMs: requestTimeoutMs,
    });
    const dataItems = Array.isArray(pollJson?.data) ? pollJson.data : [];
    const match = dataItems.find((item) => item?.taskUUID === taskUUID) || null;
    if (match?.status === 'processing' || !match) {
      continue;
    }
    if (match?.status === 'success' && typeof match?.videoURL === 'string' && match.videoURL) {
      return match;
    }

    const errorMatch = Array.isArray(pollJson?.errors)
      ? pollJson.errors.find((item) => item?.taskUUID === taskUUID) || pollJson.errors[0]
      : null;
    if (errorMatch) {
      throw new Error(`Runware video request failed: ${extractText(errorMatch)}`.trim());
    }
  }

  throw new Error(`Runware video request timed out after ${timeoutMs}ms`);
};

export const saveRunwareVideoResult = async ({
  imageDir,
  filePrefix,
  model,
  payload,
  result,
  targetDurationSeconds = null,
  targetFps = 24,
}) => {
  const url = typeof result?.videoURL === 'string' ? result.videoURL : '';
  if (!url) {
    throw new Error('Runware video response returned no downloadable videoURL');
  }

  const savePath = path.join(imageDir, `${filePrefix}.mp4`);
  await downloadToFile(url, savePath, { timeoutMs: 15 * 60 * 1000 });
  if (Number.isFinite(Number(targetDurationSeconds)) && Number(targetDurationSeconds) > 0) {
    await normalizeVideoDurationSeconds(savePath, Number(targetDurationSeconds), { targetFps });
  }
  const json = await saveJSON(savePath, {
    provider: 'runware',
    model,
    url,
    sourceUrl: url,
    payload,
    raw: result,
  });
  return { file: savePath, json };
};

export default {
  resolveRunwareKey,
  imagePathToDataUrl,
  requestRunware,
  normalizeRunwareFrameImages,
  buildRunwareVideoTask,
  submitRunwareVideoJob,
  saveRunwareVideoResult,
};
