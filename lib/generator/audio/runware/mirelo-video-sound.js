import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';

import { requestRunware, resolveRunwareKey } from '../../image-video/runware/common.js';
import { downloadToFile } from '../../save-utils.js';

const DEFAULT_RUNWARE_MIRELO_MODEL = 'mirelo:1@1';
const DEFAULT_RUNWARE_MIRELO_STEPS = 28;

const isHttpUrl = (value) => /^(?:https?:\/\/)/i.test(String(value || '').trim());
const isUuid = (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || '').trim());

const toVideoDataUri = async (sourcePath) => {
  const extension = path.extname(sourcePath).toLowerCase();
  const mimeType = extension === '.webm' ? 'video/webm' : 'video/mp4';
  const videoBuffer = await fs.readFile(sourcePath);
  return `data:${mimeType};base64,${videoBuffer.toString('base64')}`;
};

const uploadRunwareMedia = async (media, { runwareKey = resolveRunwareKey() } = {}) => {
  if (!runwareKey) {
    throw new Error('Missing RUNWARE_API_KEY (or RUNWARE_KEY) for Runware media upload.');
  }

  const task = {
    taskType: 'mediaStorage',
    taskUUID: randomUUID(),
    operation: 'upload',
    media,
  };

  const response = await requestRunware({
    apiKey: runwareKey,
    body: [task],
  });
  const results = Array.isArray(response?.data) ? response.data : [];
  const result = results.find((item) => item?.taskUUID === task.taskUUID) || results[0];
  const mediaURL = String(result?.mediaURL || result?.url || '').trim();
  const mediaUUID = String(result?.mediaUUID || '').trim();

  if (mediaURL) {
    return mediaURL;
  }
  if (mediaUUID) {
    return mediaUUID;
  }

  throw new Error('Runware media upload returned no reusable media reference.');
};

const resolveMediaBinary = (cmd) => {
  const candidates = cmd === 'ffmpeg'
    ? ['/usr/local/bin/ffmpeg', '/opt/homebrew/bin/ffmpeg', 'ffmpeg']
    : ['/usr/local/bin/ffprobe', '/opt/homebrew/bin/ffprobe', 'ffprobe'];
  for (const candidate of candidates) {
    if (!candidate.includes('/')) {
      return candidate;
    }
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return cmd;
};

const execMedia = (cmd, args, opts = {}) => new Promise((resolve, reject) => {
  const resolvedCmd = resolveMediaBinary(cmd);
  const child = spawn(resolvedCmd, args, { stdio: ['ignore', 'pipe', 'pipe'], ...opts });
  let stderr = '';
  child.stderr?.on('data', (chunk) => {
    stderr += String(chunk);
  });
  child.on('error', reject);
  child.on('exit', (code) => {
    if (code === 0) {
      resolve();
      return;
    }
    reject(new Error(`${resolvedCmd} exited ${code}${stderr ? `: ${stderr.trim()}` : ''}`));
  });
});

const probeDurationSeconds = async (inputPath) => {
  const resolvedCmd = resolveMediaBinary('ffprobe');
  const child = spawn(resolvedCmd, [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1',
    inputPath,
  ], { stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '';
  let stderr = '';
  child.stdout?.on('data', (chunk) => {
    stdout += String(chunk);
  });
  child.stderr?.on('data', (chunk) => {
    stderr += String(chunk);
  });
  const code = await new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('exit', resolve);
  });
  if (code !== 0) {
    throw new Error(`${resolvedCmd} exited ${code}${stderr ? `: ${stderr.trim()}` : ''}`);
  }
  const duration = Number.parseFloat(stdout.trim());
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error(`Invalid duration for ${inputPath}: ${stdout.trim() || stderr.trim()}`);
  }
  return duration;
};

const ensureLocalVideoPath = async (input) => {
  if (typeof input === 'string' && await fs.pathExists(input)) {
    return path.resolve(input);
  }
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'runware-mirelo-video-'));
  const ext = path.extname(String(input || '')).toLowerCase() || '.mp4';
  const tmpPath = path.join(tmpDir, `input${ext}`);
  await downloadToFile(input, tmpPath);
  return tmpPath;
};

const splitVideoIntoChunks = async (localVideoPath, chunkPlan) => {
  const chunkDir = await fs.mkdtemp(path.join(os.tmpdir(), 'runware-mirelo-chunks-'));
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
};

const concatAudioFiles = async (audioPaths, outputDir) => {
  if (!Array.isArray(audioPaths) || audioPaths.length === 0) {
    return null;
  }
  if (audioPaths.length === 1) {
    return audioPaths[0];
  }

  const concatDir = await fs.mkdtemp(path.join(os.tmpdir(), 'runware-mirelo-audio-'));
  const listFile = path.join(concatDir, 'concat.txt');
  const outPath = path.join(outputDir, `${Date.now()}-runware-mirelo.wav`);
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
};

const saveRunwareAudioAsset = async (asset, savePath) => {
  const assetUrl = String(
    asset?.audioURL
    || asset?.audio_url
    || asset?.videoURL
    || asset?.video_url
    || asset?.url
    || asset?.audio
    || asset?.video
    || ''
  ).trim();
  const assetDataURI = String(asset?.audioDataURI || asset?.audioDataUri || '').trim();
  const assetBase64 = String(asset?.audioBase64Data || asset?.audioBase64 || '').trim();

  if (assetUrl) {
    return await downloadToFile(assetUrl, savePath);
  }

  if (assetDataURI.startsWith('data:')) {
    const base64 = assetDataURI.split(',')[1] || '';
    await fs.writeFile(savePath, Buffer.from(base64, 'base64'));
    return savePath;
  }

  if (assetBase64) {
    await fs.writeFile(savePath, Buffer.from(assetBase64, 'base64'));
    return savePath;
  }

  throw new Error('Runware Mirelo fallback returned no downloadable audio asset.');
};

const runRunwareMireloAudioForVideo = async ({
  videoInput,
  prompt,
  outputDir,
  fileName,
  model,
  seed,
  steps,
  runwareKey,
}) => {
  const portableVideoInput = await resolveRunwareMireloVideoInput(videoInput, { runwareKey });
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
  const savePath = path.join(outputDir, `${fileName}-runware-mirelo.wav`);
  const audioFile = await saveRunwareAudioAsset(result, savePath);
  return {
    file: audioFile,
    model,
    cost: Number(result?.cost) || null,
    response: result,
  };
};

export const resolveRunwareMireloVideoInput = async (videoInput, options = {}) => {
  const source = String(videoInput || '').trim();
  if (!source) {
    throw new Error('Runware Mirelo fallback requires a video input.');
  }
  if (isHttpUrl(source) || isUuid(source)) {
    return source;
  }
  if (/^data:video\//i.test(source)) {
    return await uploadRunwareMedia(source, options);
  }
  if (!(await fs.pathExists(source))) {
    return await uploadRunwareMedia(source, options);
  }

  return await uploadRunwareMedia(await toVideoDataUri(source), options);
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
  ...(String(prompt || '').trim() && !video ? {
    positivePrompt: String(prompt || '').trim(),
  } : {}),
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

  const sourceVideoPath = await ensureLocalVideoPath(videoInput);
  const totalDuration = await probeDurationSeconds(sourceVideoPath);
  const maxChunkDuration = 7.9;

  if (totalDuration <= 10) {
    return await runRunwareMireloAudioForVideo({
      videoInput: sourceVideoPath,
      prompt,
      outputDir,
      fileName,
      model,
      seed,
      steps,
      runwareKey,
    });
  }

  const totalMs = Math.round(totalDuration * 1000);
  const maxChunkMs = Math.floor(maxChunkDuration * 1000);
  const minChunkMs = 1000;
  const chunkCount = Math.ceil(totalMs / maxChunkMs);
  const chunkPlan = [];
  let startMs = 0;
  for (let index = 0; index < chunkCount; index += 1) {
    const remainingChunks = chunkCount - index;
    const remainingMs = totalMs - startMs;
    const durationMs = remainingChunks === 1
      ? remainingMs
      : Math.min(maxChunkMs, remainingMs - (remainingChunks - 1) * minChunkMs);
    chunkPlan.push({
      index,
      start: startMs / 1000,
      duration: durationMs / 1000,
    });
    startMs += durationMs;
  }

  const chunkPaths = await splitVideoIntoChunks(sourceVideoPath, chunkPlan);
  const audioPaths = [];
  let totalCost = 0;
  const chunkResponses = [];

  for (const [index, chunkPath] of chunkPaths.entries()) {
    const chunkResult = await runRunwareMireloAudioForVideo({
      videoInput: chunkPath,
      prompt,
      outputDir,
      fileName: `${fileName}-chunk-${String(index).padStart(3, '0')}`,
      model,
      seed,
      steps,
      runwareKey,
    });
    chunkResponses.push({
      index,
      start: chunkPlan[index].start,
      duration: chunkPlan[index].duration,
      cost: chunkResult.cost,
      file: chunkResult.file,
      response: chunkResult.response,
    });
    totalCost += Number(chunkResult.cost) || 0;
    audioPaths.push(chunkResult.file);
  }

  const concatenatedAudioPath = await concatAudioFiles(audioPaths, outputDir);
  return {
    file: concatenatedAudioPath,
    model,
    cost: totalCost || null,
    response: {
      chunked: true,
      totalDuration,
      maxChunkDuration,
      chunkPlan,
      chunkResponses,
    },
  };
};

export default generateRunwareMireloFallback;
