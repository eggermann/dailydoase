import fs from 'fs-extra';
import path from 'path';
import { randomUUID } from 'node:crypto';

import { createLogger } from '../../logger.js';
import { downloadToFile, saveJSON } from '../../save-utils.js';
import { normalizeVideoDurationSeconds } from '../../ffmpeg-helpers.js';

const logger = createLogger('runware', { envKeys: ['RUNWARE_DEBUG', 'GENERATOR_DEBUG'] });
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

export const requestRunware = async ({ body, apiKey }) => {
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

  const response = await fetchImpl(API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const json = await response.json().catch(() => ({}));

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

export const buildRunwareImageTask = ({
  model,
  prompt,
  negativePrompt,
  width,
  height,
  steps,
  guidanceScale,
  seed,
  referenceImages = [],
  taskUUID = randomUUID(),
} = {}) => {
  const task = {
    taskType: 'imageInference',
    taskUUID,
    model,
    positivePrompt: prompt || '',
    numberResults: 1,
    outputType: 'URL',
    outputFormat: 'PNG',
    includeCost: true,
    inputs: {
      referenceImages,
    },
  };

  if (negativePrompt) task.negativePrompt = negativePrompt;
  if (Number.isFinite(Number(width)) && Number(width) > 0) task.width = Number(width);
  if (Number.isFinite(Number(height)) && Number(height) > 0) task.height = Number(height);
  if (Number.isFinite(Number(steps)) && Number(steps) > 0) task.steps = Number(steps);
  if (Number.isFinite(Number(guidanceScale))) task.CFGScale = Number(guidanceScale);
  if (Number.isFinite(Number(seed))) task.seed = Number(seed);

  return task;
};

export const submitRunwareImageTask = async ({ apiKey, ...options } = {}) => {
  const task = buildRunwareImageTask(options);
  const json = await requestRunware({ apiKey, body: [task] });
  const dataItems = Array.isArray(json?.data) ? json.data : [];
  const result = dataItems.find((item) => item?.taskUUID === task.taskUUID) || dataItems[0] || null;
  if (!result?.imageURL) {
    throw new Error('Runware image request returned no downloadable imageURL');
  }
  return { task, result };
};

export const buildRunwareVideoTask = ({
  model,
  prompt,
  durationSeconds,
  width,
  height,
  resolution,
  seed,
  frameImages = [],
  providerSettings,
  taskUUID = randomUUID(),
} = {}) => {
  const task = {
    taskType: 'videoInference',
    taskUUID,
    model,
    positivePrompt: prompt || '',
    duration: Math.min(15, Math.max(2, Number(durationSeconds) || 2)),
    numberResults: 1,
    deliveryMethod: 'async',
    includeCost: true,
    inputs: {
      frameImages,
    },
  };

  if (typeof resolution === 'string' && resolution.trim()) {
    task.resolution = resolution.trim();
  } else {
    if (Number.isFinite(Number(width)) && Number(width) > 0) task.width = Number(width);
    if (Number.isFinite(Number(height)) && Number(height) > 0) task.height = Number(height);
  }
  if (Number.isFinite(Number(seed))) task.seed = Number(seed);
  if (providerSettings && typeof providerSettings === 'object') task.providerSettings = providerSettings;

  return task;
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
  providerSettings,
  timeoutMs = 15 * 60 * 1000,
}) => {
  const task = buildRunwareVideoTask({
    model,
    prompt,
    durationSeconds,
    width,
    height,
    resolution,
    seed,
    frameImages,
    providerSettings,
  });
  const { taskUUID } = task;

  await requestRunware({
    apiKey,
    body: [task],
  });

  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    await new Promise((resolve) => setTimeout(resolve, 2_000));
    const pollJson = await requestRunware({
      apiKey,
      body: [{ taskType: 'getResponse', taskUUID }],
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

export const saveRunwareImageResult = async ({
  imageDir,
  filePrefix,
  model,
  payload,
  result,
  metadata = {},
}) => {
  const url = typeof result?.imageURL === 'string' ? result.imageURL : '';
  if (!url) {
    throw new Error('Runware image response returned no downloadable imageURL');
  }

  const savePath = path.join(imageDir, `${filePrefix}.png`);
  await downloadToFile(url, savePath, { timeoutMs: 15 * 60 * 1000 });
  const json = await saveJSON(savePath, {
    provider: 'runware',
    model,
    url,
    sourceUrl: url,
    payload,
    raw: result,
    ...metadata,
  });
  return { image: { path: savePath }, imagePath: savePath, file: savePath, json };
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
  buildRunwareImageTask,
  submitRunwareImageTask,
  saveRunwareImageResult,
  buildRunwareVideoTask,
  submitRunwareVideoJob,
  saveRunwareVideoResult,
};
