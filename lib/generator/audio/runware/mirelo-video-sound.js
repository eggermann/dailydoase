import fs from 'fs-extra';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

import { requestRunware, resolveRunwareKey } from '../../image-video/runware/common.js';
import { downloadToFile } from '../../save-utils.js';

const DEFAULT_RUNWARE_MIRELO_MODEL = 'mirelo:1@1';
const DEFAULT_RUNWARE_MIRELO_STEPS = 28;

const isPortableVideoInput = (value) => /^(?:https?:\/\/|data:video\/)/i.test(value);

export const resolveRunwareMireloVideoInput = async (videoInput) => {
  const source = String(videoInput || '').trim();
  if (!source) {
    throw new Error('Runware Mirelo fallback requires a video input.');
  }
  if (isPortableVideoInput(source)) {
    return source;
  }
  if (!(await fs.pathExists(source))) {
    throw new Error(`Runware Mirelo fallback video does not exist: ${source}`);
  }

  const extension = path.extname(source).toLowerCase();
  const mimeType = extension === '.webm' ? 'video/webm' : 'video/mp4';
  const videoBuffer = await fs.readFile(source);
  return `data:${mimeType};base64,${videoBuffer.toString('base64')}`;
};

export const buildRunwareMireloTask = ({
  model = DEFAULT_RUNWARE_MIRELO_MODEL,
  prompt = '',
  video,
  seed = 0,
  steps = DEFAULT_RUNWARE_MIRELO_STEPS,
  taskUUID = randomUUID(),
} = {}) => ({
  taskType: 'audioInference',
  taskUUID,
  model,
  positivePrompt: String(prompt || '').trim()
    || 'Synchronized cinematic room tone and physical sound effects, no speech.',
  seed: Number.isFinite(Number(seed)) ? Number(seed) : 0,
  steps: Number.isFinite(Number(steps)) && Number(steps) > 0
    ? Number(steps)
    : DEFAULT_RUNWARE_MIRELO_STEPS,
  settings: {
    startOffset: 0,
  },
  inputs: {
    video,
  },
  numberResults: 1,
  outputType: 'URL',
  deliveryMethod: 'sync',
  includeCost: true,
});

export const generateRunwareMireloFallback = async ({
  videoInput,
  prompt,
  outputDir,
  fileName,
  model = DEFAULT_RUNWARE_MIRELO_MODEL,
  seed = 0,
  steps = DEFAULT_RUNWARE_MIRELO_STEPS,
  runwareKey = resolveRunwareKey(),
} = {}) => {
  if (!runwareKey) {
    throw new Error('Missing RUNWARE_API_KEY (or RUNWARE_KEY) for Mirelo fallback.');
  }

  const portableVideoInput = await resolveRunwareMireloVideoInput(videoInput);
  const task = buildRunwareMireloTask({
    model,
    prompt,
    video: portableVideoInput,
    seed,
    steps,
  });
  const response = await requestRunware({
    apiKey: runwareKey,
    body: [task],
  });
  const results = Array.isArray(response?.data) ? response.data : [];
  const result = results.find((item) => item?.taskUUID === task.taskUUID) || results[0];
  const generatedVideoUrl = String(result?.videoURL || '').trim();
  if (!generatedVideoUrl) {
    throw new Error('Runware Mirelo fallback returned no synchronized video.');
  }

  const fallbackVideoPath = path.join(
    outputDir,
    `${fileName}-runware-mirelo-fallback.mp4`
  );
  await downloadToFile(generatedVideoUrl, fallbackVideoPath, {
    maxRetries: 2,
    retryDelayMs: 1_000,
  });

  return {
    file: fallbackVideoPath,
    model,
    cost: Number(result?.cost) || null,
    response: result,
  };
};

export default generateRunwareMireloFallback;
