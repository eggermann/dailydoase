import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, readdir, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { isRetryableHttpStatus, isRetryableNetworkError, retryDelayMs, retryTransient } from '../news-scene/provider-resilience.mjs';

const { values: options } = parseArgs({ options: {
  run: { type: 'string' }, iterations: { type: 'string', default: '5' },
  'output-dir': { type: 'string' }, model: { type: 'string', default: 'prunaai:p-video@2-pro' },
  resolution: { type: 'string', default: '480p' }, 'settings-mode': { type: 'string', default: 'cost' },
  duration: { type: 'string', default: '5' }, concurrency: { type: 'string', default: '4' },
  'poll-timeout-seconds': { type: 'string', default: '600' }, help: { type: 'boolean', default: false },
} });

if (options.help) {
  console.log('node --env-file=.env eu-reski-news/scripts/generate-scene-glue-videos.mjs --run=PATH [--iterations=5] [--output-dir=PATH]');
  process.exit(0);
}

if (!options.run) throw new Error('--run=PATH is required');
if (options.model !== 'prunaai:p-video@2-pro') throw new Error('Only prunaai:p-video@2-pro supports this first/last-frame workflow');
if (options.resolution !== '480p') throw new Error('--resolution must be 480p to match the source clips');
if (options['settings-mode'] !== 'cost') throw new Error('--settings-mode must be cost');

const iterationLimit = Number(options.iterations);
const duration = Number(options.duration);
const concurrency = Number(options.concurrency);
const pollTimeoutSeconds = Number(options['poll-timeout-seconds']);
if (!Number.isInteger(iterationLimit) || iterationLimit < 1) throw new Error('--iterations must be a positive integer');
if (duration !== 5) throw new Error('P-Video-2-Pro minimum duration is 5 seconds; keep --duration=5 for short bridges');
if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 8) throw new Error('--concurrency must be an integer from 1 to 8');
if (!Number.isInteger(pollTimeoutSeconds) || pollTimeoutSeconds < 10 || pollTimeoutSeconds > 1800) {
  throw new Error('--poll-timeout-seconds must be an integer from 10 to 1800');
}

const apiKey = process.env.RUNWARE_API_KEY || process.env.RUNWARE_KEY;
if (!apiKey) throw new Error('Set RUNWARE_API_KEY or RUNWARE_KEY in .env');

const runDirectory = resolve(options.run);
const outputDirectory = resolve(options['output-dir'] || join(runDirectory, 'glue-vids'));
const ffmpeg = process.env.FFMPEG_BIN || 'ffmpeg';
const dataUrl = async (path) => `data:image/jpeg;base64,${(await readFile(path)).toString('base64')}`;
const json = async (path) => JSON.parse(await readFile(path, 'utf8'));
const exists = async (path) => {
  try { await stat(path); return true; } catch (error) { if (error.code === 'ENOENT') return false; throw error; }
};
const save = async (path, value) => {
  const temporary = `${path}.${randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`);
  await rename(temporary, path);
};
const pad = (value) => String(value).padStart(3, '0');

function runFfmpeg(args) {
  try {
    execFileSync(ffmpeg, args, { stdio: 'inherit' });
  } catch (error) {
    if (error.code === 'ENOENT') throw new Error(`FFmpeg not found: ${ffmpeg}`);
    throw error;
  }
}

async function getIterations() {
  const runManifest = await json(join(runDirectory, 'run.json'));
  const iterations = runManifest.iterations?.map((entry) => entry.directory).filter(Boolean) || [];
  if (iterations.length < iterationLimit) throw new Error(`Run has ${iterations.length} completed iterations; requested ${iterationLimit}`);
  return iterations.slice(0, iterationLimit);
}

async function extractFrame(videoPath, outputPath, endFrame) {
  if (await exists(outputPath)) return;
  await mkdir(dirname(outputPath), { recursive: true });
  const args = ['-hide_banner', '-loglevel', 'error', '-y', '-i', videoPath];
  if (endFrame) args.push('-vf', 'reverse');
  args.push('-frames:v', '1', '-q:v', '2', outputPath);
  runFfmpeg(args);
}

async function prepareTransition(iterationDirectory, previousScene, nextScene) {
  const iterationNumber = Number(iterationDirectory.match(/iteration-(\d+)/)?.[1]);
  const previousNumber = Number(previousScene.index);
  const nextNumber = Number(nextScene.index);
  if (!Number.isInteger(iterationNumber) || nextNumber !== previousNumber + 1) {
    throw new Error(`Invalid scene boundary: ${iterationDirectory} ${previousScene.index} -> ${nextScene.index}`);
  }

  const iterationId = `iteration-${pad(iterationNumber)}`;
  const directory = join(outputDirectory, iterationId);
  const transitionId = `scene-${pad(previousNumber)}-to-${pad(nextNumber)}`;
  const previousVideo = join(runDirectory, iterationDirectory, 'media', `scene-${previousNumber}-video.mp4`);
  const nextVideo = join(runDirectory, iterationDirectory, 'media', `scene-${nextNumber}-video.mp4`);
  const firstFramePath = join(directory, `${transitionId}-first.jpg`);
  const lastFramePath = join(directory, `${transitionId}-last.jpg`);
  await extractFrame(previousVideo, firstFramePath, true);
  await extractFrame(nextVideo, lastFramePath, false);

  const before = previousScene.storyBeat || previousScene.title || '';
  const after = nextScene.storyBeat || nextScene.title || '';
  const articleTitle = (await json(join(runDirectory, iterationDirectory, 'record.json'))).article.title;
  const prompt = [
    `Create a single continuous ${duration}-second bridge shot for the article story "${articleTitle}".`,
    'The supplied first frame is the exact last frame of scene before. The supplied last frame is the exact first frame of the next scene.',
    'Begin on the first frame and finish on the last frame. Let movement connect the two compositions naturally; no cut, fade, title, or new scene.',
    'Preserve the existing dark, nearly monochrome cubist mural style, charcoal, chalk-white and ash-gray palette, rough brushwork and shallow space.',
    'Keep the same people and visual motifs recognizable. Do not add readable text, logos, photorealism, or new characters.',
    `Previous scene: ${before}`,
    `Next scene: ${after}`,
    'Audio: quiet, non-verbal atmospheric sound; no speech and no music.',
  ].join('\n');

  const taskDirectory = directory;
  const requestPath = join(taskDirectory, `${transitionId}-request.json`);
  const pendingPath = join(taskDirectory, `${transitionId}-pending.json`);
  const submissionPath = join(taskDirectory, `${transitionId}-submission.json`);
  const responsePath = join(taskDirectory, `${transitionId}-response.json`);
  const videoPath = join(taskDirectory, `${transitionId}.mp4`);
  const savedRequest = await exists(requestPath) ? await json(requestPath) : null;
  const taskUUID = savedRequest?.taskUUID || randomUUID();
  const task = {
    taskType: 'videoInference',
    taskUUID,
    model: options.model,
    positivePrompt: prompt,
    inputs: {
      frameImages: [
        { image: await dataUrl(firstFramePath), frame: 'first' },
        { image: await dataUrl(lastFramePath), frame: 'last' },
      ],
    },
    resolution: options.resolution,
    duration,
    numberResults: 1,
    deliveryMethod: 'async',
    includeCost: true,
    settings: { mode: options['settings-mode'] },
  };

  if (!savedRequest) await save(requestPath, {
    ...task,
    taskUUID,
    renderStartedAt: new Date().toISOString(),
    inputs: { frameImages: [
      { image: firstFramePath, frame: 'first' },
      { image: lastFramePath, frame: 'last' },
    ] },
  });

  return { task, taskUUID, requestPath, pendingPath, submissionPath, responsePath, videoPath, firstFramePath, lastFramePath };
}

async function apiRequest(body, timeoutMs = 240_000) {
  const response = await fetch('https://api.runware.ai/v1', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(`Runware HTTP ${response.status}: ${JSON.stringify(result).slice(0, 1200)}`);
    error.status = response.status;
    throw error;
  }
  return result;
}

async function getTaskDetails(taskUUID) {
  const response = await retryTransient(() => apiRequest([{ taskType: 'getTaskDetails', taskUUID }], 60_000), {
    attempts: 5,
    shouldRetry: (error) => isRetryableNetworkError(error) || isRetryableHttpStatus(error.status),
  });
  const task = response.data?.find((item) => item.taskUUID === taskUUID);
  if (task) return task.response || null;
  if (response.errors?.some((error) => error.code === 'taskNotFound')) return null;
  if (response.errors?.length) throw new Error(`Runware task lookup failed: ${JSON.stringify(response.errors).slice(0, 1000)}`);
  return null;
}

async function submitOrRecover(job) {
  if (await exists(job.submissionPath)) return json(job.submissionPath);

  if (await exists(job.pendingPath)) {
    const recovered = await getTaskDetails(job.taskUUID);
    if (recovered) {
      await save(job.submissionPath, recovered);
      return recovered;
    }
  } else {
    await writeFile(job.pendingPath, `${JSON.stringify({ taskUUID: job.taskUUID, startedAt: new Date().toISOString() })}\n`, { flag: 'wx' });
  }

  try {
    const submission = await retryTransient(() => apiRequest([job.task]), {
      attempts: 5,
      shouldRetry: (error) => isRetryableNetworkError(error) || isRetryableHttpStatus(error.status),
      onRetry: ({ nextAttempt, delay }) => console.warn(`Submit retry ${nextAttempt}/5 in ${delay}ms`),
    });
    await save(job.submissionPath, submission);
    return submission;
  } catch (error) {
    if (isRetryableNetworkError(error) || isRetryableHttpStatus(error.status)) {
      const recovered = await getTaskDetails(job.taskUUID);
      if (recovered) {
        await save(job.submissionPath, recovered);
        return recovered;
      }
    }
    throw error;
  }
}

async function getResult(job, submission) {
  const immediate = submission.data?.find((item) => item.taskUUID === job.taskUUID) || submission;
  if (immediate.videoURL) return immediate;

  const startedAt = Date.now();
  const timeoutMs = pollTimeoutSeconds * 1000;
  while (Date.now() - startedAt < timeoutMs) {
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 2000));
    const remainingMs = timeoutMs - (Date.now() - startedAt);
    if (remainingMs <= 0) break;
    const response = await retryTransient(() => apiRequest([{ taskType: 'getResponse', taskUUID: job.taskUUID }], remainingMs), {
      attempts: 5,
      shouldRetry: (error) => isRetryableNetworkError(error) || isRetryableHttpStatus(error.status),
      onRetry: ({ nextAttempt, delay }) => console.warn(`Poll retry ${nextAttempt}/5 in ${delay}ms`),
    });
    if (response.errors?.length) throw new Error(`Runware poll failed: ${JSON.stringify(response.errors).slice(0, 1200)}`);
    const result = response.data?.find((item) => item.taskUUID === job.taskUUID);
    if (result?.videoURL) return result;
    if (result?.status && result.status !== 'processing') {
      throw new Error(`Runware ${job.taskUUID} failed: ${JSON.stringify(result).slice(0, 1200)}`);
    }
  }

  const error = new Error(`Runware ${job.taskUUID} still processing; rerun the command to resume without resubmitting`);
  error.code = 'VIDEO_STILL_PROCESSING';
  throw error;
}

async function downloadVideo(url, outputPath) {
  const response = await fetch(url, { signal: AbortSignal.timeout(120_000) });
  if (!response.ok) throw new Error(`Video download failed with HTTP ${response.status}`);
  await writeFile(outputPath, Buffer.from(await response.arrayBuffer()));
}

async function processJob(job) {
  if (await exists(job.videoPath)) {
    console.log(`GLUE_EXISTS ${job.videoPath}`);
    return;
  }

  const savedResponse = await exists(job.responsePath) ? await json(job.responsePath) : null;
  let result = savedResponse;
  if (!result?.videoURL) {
    const submission = await submitOrRecover(job);
    if (submission.errors?.length || submission.error) throw new Error(`Runware submit failed: ${JSON.stringify(submission.errors || submission.error).slice(0, 1200)}`);
    result = await getResult(job, submission);
    await save(job.responsePath, result);
  }

  await downloadVideo(result.videoURL, job.videoPath);
  await save(job.responsePath, {
    ...result,
    downloadedAt: new Date().toISOString(),
    localPath: job.videoPath,
    firstFrame: job.firstFramePath,
    lastFrame: job.lastFramePath,
  });
  if (await exists(job.pendingPath)) await unlink(job.pendingPath);
  console.log(`GLUE_READY ${job.videoPath} · $${Number(result.cost || 0).toFixed(4)}`);
}

const iterations = await getIterations();
const jobs = [];
for (const iterationDirectory of iterations) {
  const iterationRecord = await json(join(runDirectory, iterationDirectory, 'record.json'));
  const scenes = iterationRecord.plan?.scenes || [];
  if (scenes.length < 2) throw new Error(`${iterationDirectory} has fewer than two planned scenes`);
  for (let index = 0; index < scenes.length - 1; index += 1) {
    jobs.push(await prepareTransition(iterationDirectory, scenes[index], scenes[index + 1]));
  }
}

await mkdir(outputDirectory, { recursive: true });
const failures = [];
let nextJob = 0;
async function worker() {
  while (nextJob < jobs.length) {
    const job = jobs[nextJob];
    nextJob += 1;
    try { await processJob(job); } catch (error) {
      failures.push({ path: job.videoPath, message: error.message });
      console.error(`GLUE_FAILED ${job.videoPath}: ${error.message}`);
    }
  }
}

await Promise.all(Array.from({ length: Math.min(concurrency, jobs.length) }, () => worker()));
const summary = {
  runDirectory,
  outputDirectory,
  model: options.model,
  resolution: options.resolution,
  settingsMode: options['settings-mode'],
  requestedDurationSeconds: duration,
  iterationCount: iterations.length,
  transitionCount: jobs.length,
  transitionsPerIteration: jobs.length / iterations.length,
  completedAt: new Date().toISOString(),
  actualVideoCostUsd: (await Promise.all(jobs.map(async (job) => {
    if (!await exists(job.responsePath)) return 0;
    const response = await json(job.responsePath);
    return Number(response.cost || 0);
  }))).reduce((total, cost) => total + cost, 0),
  failures,
};
await save(join(outputDirectory, 'glue-run.json'), summary);
if (failures.length) throw new Error(`${failures.length} transition(s) failed; inspect glue-run.json and rerun to resume`);
console.log(`Generated ${jobs.length} transitions in ${outputDirectory}`);
