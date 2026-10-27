import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile, rename, stat, unlink } from 'node:fs/promises';
import { basename, dirname, join, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { renderReport, renderRunReport } from '../news-scene/report.mjs';
import { renderTitleCard } from '../news-scene/title-card.mjs';
import { concatMp4Lossless, createBlackMp4, probeAudioStream, probeVideoStream } from '../../lib/generator/ffmpeg-helpers.js';
import { isRetryableHttpStatus, isRetryableNetworkError, retryDelayMs, retryTransient } from '../news-scene/provider-resilience.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const { values } = parseArgs({ options: {
  run: { type: 'string' }, model: { type: 'string', default: process.env.NEWS_VIDEO_MODEL || 'xai:grok-imagine@video-1.5-lite' },
  resolution: { type: 'string', default: process.env.NEWS_VIDEO_RESOLUTION || '480p' },
  iteration: { type: 'string' }, 'settings-mode': { type: 'string', default: process.env.NEWS_VIDEO_SETTINGS_MODE || '' },
  'output-quality': { type: 'string', default: process.env.NEWS_VIDEO_OUTPUT_QUALITY || '20' },
  'video-concurrency': { type: 'string', default: process.env.NEWS_VIDEO_CONCURRENCY || '4' },
  'audio-edge-fade-seconds': { type: 'string', default: process.env.NEWS_VIDEO_AUDIO_EDGE_FADE_SECONDS || '0.03' },
  'generate-title-cards': { type: 'boolean', default: false },
  'poll-timeout-seconds': { type: 'string', default: process.env.NEWS_VIDEO_POLL_TIMEOUT_SECONDS || '60' },
  help: { type: 'boolean', default: false },
} });

const apiKey = process.env.RUNWARE_API_KEY || process.env.RUNWARE_KEY;
const outputQuality = Number(values['output-quality']);
const usesPVideo2Pro = values.model === 'prunaai:p-video@2-pro';
const settingsMode = values['settings-mode'];
const videoConcurrency = Number(values['video-concurrency']);
const audioEdgeFadeSeconds = Number(values['audio-edge-fade-seconds']);
const pollTimeoutSeconds = Number(values['poll-timeout-seconds']);
const pollTimeoutMs = pollTimeoutSeconds * 1000;
if (values.help) {
  console.log('node --env-file=.env eu-reski-news/scripts/generate-news-scene-videos.mjs --run=PATH [--iteration=iteration-001] [--model=prunaai:p-video@2-pro] [--resolution=480p] [--settings-mode=cost] [--generate-title-cards] [--video-concurrency=4] [--audio-edge-fade-seconds=0.03] [--poll-timeout-seconds=300]');
  process.exit(0);
}
if (!values.run) throw new Error('Pass --run=PATH to an image-generation run directory');
if (!apiKey) throw new Error('Set RUNWARE_API_KEY in the environment');
if (usesPVideo2Pro && !['cost', 'speed', 'quality'].includes(settingsMode)) throw new Error('--settings-mode must be cost, speed, or quality for P-Video-2-Pro');
if (!usesPVideo2Pro && settingsMode) throw new Error('--settings-mode is supported here only for P-Video-2-Pro');
if (!usesPVideo2Pro && (!Number.isInteger(outputQuality) || outputQuality < 20 || outputQuality > 99)) throw new Error('--output-quality must be an integer from 20 to 99');
if (!Number.isInteger(pollTimeoutSeconds) || pollTimeoutSeconds < 10 || pollTimeoutSeconds > 600) throw new Error('--poll-timeout-seconds must be an integer from 10 to 600');
if (!Number.isInteger(videoConcurrency) || videoConcurrency < 1 || videoConcurrency > 12) throw new Error('--video-concurrency must be an integer from 1 to 12');
if (!Number.isFinite(audioEdgeFadeSeconds) || audioEdgeFadeSeconds < 0 || audioEdgeFadeSeconds > 0.5) throw new Error('--audio-edge-fade-seconds must be from 0 to 0.5');
if (values.resolution !== '480p') throw new Error('This low-quality test starter only allows --resolution=480p');

const runDirectory = resolve(values.run);
const safeSave = async (path, value) => {
  const temporary = `${path}.${randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`);
  await rename(temporary, path);
};
const json = async (path) => JSON.parse(await readFile(path, 'utf8'));
const exists = async (path) => { try { await stat(path); return true; } catch (error) { if (error.code === 'ENOENT') return false; throw error; } };
const dataUrl = async (path) => {
  const extension = path.split('.').at(-1).toLowerCase();
  const mime = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }[extension];
  if (!mime) throw new Error(`Unsupported video start-frame format: ${extension}`);
  return `data:${mime};base64,${(await readFile(path)).toString('base64')}`;
};
const saveHtml = async (directory, record) => {
  await safeSave(join(directory, 'record.json'), record);
  await writeFile(join(directory, 'index.html'), renderReport(record));
};

async function request(body, timeoutMs = 240_000) {
  const response = await fetch('https://api.runware.ai/v1', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(`Runware video API HTTP ${response.status}: ${JSON.stringify(result).slice(0, 1200)}`);
    error.payload = result;
    error.status = response.status;
    throw error;
  }
  return result;
}

async function getResult(taskUUID, submission) {
  const immediate = submission.data?.find((item) => item.taskUUID === taskUUID);
  if (immediate?.videoURL) return immediate;
  const startedAt = Date.now();
  while (Date.now() - startedAt < pollTimeoutMs) {
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 2000));
    const remainingMs = pollTimeoutMs - (Date.now() - startedAt);
    if (remainingMs <= 0) break;
    let response;
    try {
      response = await retryTransient(() => request([{ taskType: 'getResponse', taskUUID }], remainingMs), {
        attempts: 5,
        shouldRetry: (error) => isRetryableNetworkError(error) || isRetryableHttpStatus(error.status),
        onRetry: ({ nextAttempt, delay }) => console.warn(`Video task poll retry ${nextAttempt}/5 in ${delay}ms`),
      });
    } catch (error) {
      if (error.name === 'TimeoutError' || error.name === 'AbortError') break;
      throw error;
    }
    const result = response.data?.find((item) => item.taskUUID === taskUUID);
    if (result?.status === 'processing' || !result) continue;
    if (result.videoURL) return result;
    const error = new Error(`Video task ${taskUUID} returned no video: ${JSON.stringify(response).slice(0, 1200)}`);
    error.payload = response;
    throw error;
  }
  const error = new Error(`Video task ${taskUUID} is still processing after ${pollTimeoutSeconds}s; rerun the same command to resume polling without resubmitting`);
  error.code = 'VIDEO_STILL_PROCESSING';
  throw error;
}

async function getTaskDetails(taskUUID) {
  const response = await retryTransient(() => fetch('https://api.runware.ai/v1', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify([{ taskType: 'getTaskDetails', taskUUID }]),
    signal: AbortSignal.timeout(60000),
  }), {
    attempts: 5,
    onRetry: ({ nextAttempt, delay }) => console.warn(`Video task lookup retry ${nextAttempt}/5 in ${delay}ms`),
  });
  const body = await response.json();
  const task = body.data?.find((item) => item.taskUUID === taskUUID);
  if (task) return task.response || null;
  if (body.errors?.some((error) => error.code === 'taskNotFound')) return null;
  if (!response.ok || body.errors?.length) throw new Error(`Runware video task lookup failed: ${JSON.stringify(body.errors || body).slice(0, 1000)}`);
  return null;
}

async function submitOrRecover(task, requestPath, submissionPath, pendingPath, taskUUID, renderStartedAt) {
  const pendingAtStart = await exists(pendingPath);
  let inspectHistory = pendingAtStart;
  let lastError;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    if (inspectHistory) {
      const recovered = await getTaskDetails(taskUUID);
      if (recovered) {
        await safeSave(submissionPath, recovered);
        return recovered;
      }
    }
    try {
      if (!await exists(pendingPath)) {
        await writeFile(pendingPath, `${JSON.stringify({ taskUUID, startedAt: renderStartedAt })}\n`, { flag: 'wx' });
      }
      const submission = await request([task]);
      await safeSave(submissionPath, submission);
      return submission;
    } catch (error) {
      if (!(isRetryableNetworkError(error) || isRetryableHttpStatus(error.status))) throw error;
      lastError = error;
      inspectHistory = true;
      if (attempt === 5) break;
      const delay = retryDelayMs(attempt);
      console.warn(`Video submit uncertain; checking task ${taskUUID} and retrying ${attempt + 1}/5 in ${delay}ms`);
      await new Promise((resolvePromise) => setTimeout(resolvePromise, delay));
    }
  }
  throw new Error(`Video task ${taskUUID} remains pending after retries: ${lastError?.message || 'unknown provider outcome'}`);
}

async function generateScene(directory, record, scene, index) {
  if (record.videoResults?.[index]?.path && await exists(join(directory, record.videoResults[index].path))) return;
  if (scene.videoMode === 'first_last_frame') {
    record.videoResults ||= [];
    record.videoResults[index] = {
      provider: 'Runware', model: values.model, status: 'skipped_requires_first_and_last_frame',
      reason: 'GPT selected first_last_frame for this scene, but the current video request sends only one start frame. No API request was made.',
      skippedAt: new Date().toISOString(),
    };
    console.log(`VIDEO_SKIPPED ${directory} · scene ${scene.index} requires an end frame; no API request sent`);
    return;
  }
  const imagePath = record.results?.[index]?.path;
  if (!imagePath || !scene.videoPrompt) throw new Error(`Scene ${scene.index} needs a saved start image and video prompt`);
  const plannedDuration = Number(scene.durationSeconds);
  const duration = plannedDuration;
  const minimumDuration = usesPVideo2Pro ? 5 : 2;
  const maximumPlannedDuration = usesPVideo2Pro ? 15 : 7;
  if (!Number.isInteger(plannedDuration) || plannedDuration < minimumDuration || plannedDuration > maximumPlannedDuration) throw new Error(`Scene ${scene.index} duration ${scene.durationSeconds} is outside ${minimumDuration}–${maximumPlannedDuration} seconds`);

  const name = `scene-${scene.index}-video`;
  const requestPath = join(directory, `${name}-request.json`);
  const submissionPath = join(directory, `${name}-submission.json`);
  const responsePath = join(directory, `${name}-response.json`);
  const pendingPath = join(directory, `${name}-pending.json`);
  const taskUUID = await exists(requestPath) ? (await json(requestPath)).taskUUID : randomUUID();
  const savedRequest = await exists(requestPath) ? await json(requestPath) : null;
  const renderStartedAt = savedRequest?.renderStartedAt || new Date().toISOString();
  const task = {
    taskType: 'videoInference', taskUUID, model: values.model,
    positivePrompt: scene.videoPrompt,
    inputs: { frameImages: [{ image: await dataUrl(join(directory, imagePath)), frame: 'first' }] },
    resolution: values.resolution, duration, numberResults: 1,
    deliveryMethod: 'async', includeCost: true,
  };
  if (usesPVideo2Pro) task.settings = { mode: settingsMode };
  else task.outputQuality = outputQuality;
  if (!await exists(requestPath)) await safeSave(requestPath, {
    ...task,
    renderStartedAt,
    inputs: { frameImages: [{ image: imagePath, frame: 'first' }] },
  });

  let submission;
  if (await exists(responsePath)) {
    const savedResponse = await json(responsePath);
    if (savedResponse.error?.includes('timed out') && await exists(submissionPath)) {
      submission = await json(submissionPath);
      await unlink(responsePath);
      if (!await exists(pendingPath)) {
        await writeFile(pendingPath, `${JSON.stringify({ taskUUID, startedAt: renderStartedAt })}\n`, { flag: 'wx' });
      }
    } else {
      submission = savedResponse;
    }
  }
  else {
    if (await exists(pendingPath) && await exists(submissionPath)) {
      submission = await json(submissionPath);
    } else {
      submission = await submitOrRecover(task, requestPath, submissionPath, pendingPath, taskUUID, renderStartedAt);
    }
  }
  if (submission.errors?.length || submission.error) {
    const moderationError = submission.errors?.find((error) => error.code === 'invalidProviderContent');
    if (moderationError) {
      record.videoResults ||= [];
      record.videoResults[index] = {
        provider: 'Runware', model: values.model, status: 'rejected_by_provider_moderation',
        taskUUID, errorCode: moderationError.code, reason: moderationError.message,
        rejectedAt: new Date().toISOString(),
      };
      console.warn(`VIDEO_REJECTED ${directory} · scene ${scene.index} · ${moderationError.code}; continuing with remaining scenes`);
      return;
    }
    throw new Error(`Saved provider response for ${name} has no video; no retry submitted.`);
  }
  let result;
  try {
    result = submission.videoURL ? submission : await getResult(taskUUID, submission);
  } catch (error) {
    if (error.code !== 'VIDEO_STILL_PROCESSING') {
      await safeSave(responsePath, error.payload || { taskUUID, error: error.message });
      await unlink(pendingPath).catch(() => {});
    }
    record.videoResults ||= [];
    record.videoResults[index] = {
      provider: 'Runware', model: values.model,
      status: error.code === 'VIDEO_STILL_PROCESSING' ? 'still_processing_resumable' : 'pending_provider_timeout',
      taskUUID, error: error.message,
    };
    throw error;
  }
  const renderedAt = new Date().toISOString();
  await safeSave(responsePath, result);
  const downloadStartedAt = new Date();
  const bytes = await retryTransient(async () => {
    const response = await fetch(result.videoURL, { signal: AbortSignal.timeout(pollTimeoutMs) });
    if (!response.ok) {
      const error = new Error(`Video download failed: HTTP ${response.status}`);
      error.status = response.status;
      throw error;
    }
    return response;
  }, {
    attempts: 5,
    shouldRetry: (error) => isRetryableNetworkError(error) || isRetryableHttpStatus(error.status),
    onRetry: ({ nextAttempt, delay }) => console.warn(`Video download retry ${nextAttempt}/5 in ${delay}ms`),
  });
  const buffer = Buffer.from(await bytes.arrayBuffer());
  if (!buffer.length) throw new Error('Video download was empty');
  const localPath = `media/scene-${scene.index}-video.mp4`;
  await writeFile(join(directory, localPath), buffer);
  const savedAt = new Date();
  const videoStream = await probeVideoStream(join(directory, localPath));
  record.videoResults ||= [];
  record.videoResults[index] = {
    provider: 'Runware', model: values.model, path: localPath,
    durationSeconds: videoStream.duration, requestedDurationSeconds: duration,
    ...(plannedDuration !== duration ? { plannedDurationSeconds: plannedDuration } : {}),
    resolution: values.resolution,
    ...(usesPVideo2Pro ? { settings: { mode: settingsMode } } : { outputQuality }),
    renderStartedAt, renderedAt, savedAt: savedAt.toISOString(),
    renderSeconds: Number(((Date.parse(renderedAt) - Date.parse(renderStartedAt)) / 1000).toFixed(1)),
    downloadSeconds: Number(((savedAt.getTime() - downloadStartedAt.getTime()) / 1000).toFixed(1)),
    totalSeconds: Number(((savedAt.getTime() - Date.parse(renderStartedAt)) / 1000).toFixed(1)),
    cost: result.cost ?? null, seed: result.seed ?? null,
    taskUUID, sourceUrl: result.videoURL, bytes: buffer.length,
    audioStream: await probeAudioStream(join(directory, localPath)),
  };
  record.filmPlan.scenePlan[index].generatedVideoPath = resolve(directory, localPath);
  record.filmPlan.scenePlan[index].videoTaskUUID = taskUUID;
  await unlink(pendingPath).catch(() => {});
  console.log(`VIDEO_READY ${resolve(directory, localPath)} · ${duration}s P-Video${plannedDuration !== duration ? ` (plan ${plannedDuration}s)` : ''} · ${values.resolution} · cost=${result.cost ?? 'n/a'}`);
}

async function concatenateIteration(directory, record) {
  const scenes = record.filmPlan?.scenePlan || [];
  const videos = scenes.map((scene, index) => record.videoResults?.[index]);
  if (!scenes.length) return;
  const gaps = [];
  const segments = [];
  for (const [index, scene] of scenes.entries()) {
    const video = videos[index];
    if (video?.path) {
      const videoPath = join(directory, video.path);
      if (!await exists(videoPath)) return;
      segments.push(videoPath);
      continue;
    }
    if (video?.status !== 'rejected_by_provider_moderation') return;
    const gap = {
      sceneIndex: scene.sceneIndex ?? scene.index ?? index + 1,
      durationSeconds: Number(scene.durationSeconds),
      visual: 'black',
      reason: 'Video provider rejected the scene; preserve its planned timeline as a black gap.',
    };
    gaps.push(gap);
    segments.push({ gap, path: null });
  }

  const runDirectory = dirname(directory);
  const mergedDirectory = join(runDirectory, 'merged');
  const outputPath = join(mergedDirectory, `${basename(directory)}.mp4`);
  const iterationRelativePath = relative(directory, outputPath);
  const runRelativePath = relative(runDirectory, outputPath);
  await mkdir(mergedDirectory, { recursive: true });
  const segmentPaths = [];
  for (const [index, segment] of segments.entries()) {
    if (typeof segment === 'string') {
      segmentPaths.push(segment);
      continue;
    }
    const gapPath = join(mergedDirectory, `${basename(directory)}-gap-scene-${segment.gap.sceneIndex}.mp4`);
    await createBlackMp4(gapPath, segment.gap.durationSeconds);
    segmentPaths.push(gapPath);
  }
  const sourceTasks = videos.map((video, index) => video?.taskUUID || `gap:scene-${index + 1}:${scenes[index].durationSeconds}s:black`);
  if ((record.concatenatedVideo?.sourcePath || record.concatenatedVideo?.path) === iterationRelativePath
    && JSON.stringify(record.concatenatedVideo.sourceTasks) === JSON.stringify(sourceTasks)
    && await exists(outputPath)) return;

  await concatMp4Lossless(segmentPaths, outputPath, mergedDirectory, { audioFadeSeconds: audioEdgeFadeSeconds });
  const mergedVideo = await probeVideoStream(outputPath);
  record.concatenatedVideo = {
    path: iterationRelativePath,
    runPath: runRelativePath,
    scenes: scenes.length,
    generatedVideos: videos.filter((video) => video?.path).length,
    gaps,
    durationSeconds: mergedVideo.duration,
    requestedDurationSeconds: scenes.reduce((total, scene) => total + Number(scene.durationSeconds || 0), 0),
    sourceTasks,
    method: `Selfomat ffmpeg concat · ${audioEdgeFadeSeconds}s audio fades at scene edges · moderation gaps shown as black video`,
    audioEdgeFadeSeconds,
    audioStream: await probeAudioStream(outputPath),
    createdAt: new Date().toISOString(),
  };
  await saveHtml(directory, record);
  await safeSave(join(directory, 'film-plan.json'), record.filmPlan);
  console.log(`FILM_READY ${outputPath} · ${record.concatenatedVideo.durationSeconds}s · ${scenes.length} Szenen${gaps.length ? ` · ${gaps.length} black gap(s)` : ''}`);
}

async function normalizeIterationFilm(directory, record) {
  const filmKey = record.titleCardFilm?.path ? 'titleCardFilm' : 'concatenatedVideo';
  const film = record[filmKey];
  if (!film?.path) return;

  const inputPath = resolve(runDirectory, film.runPath || join(directory, film.path));
  const outputPath = inputPath.replace(/\.mp4$/i, '-audio-normalized.mp4');
  const outputRunPath = relative(runDirectory, outputPath);
  if (film.audioNormalization?.outputPath === outputRunPath && await exists(outputPath)) return;

  execFileSync(process.execPath, [
    join(root, 'eu-reski-news', 'scripts', 'normalize-iteration-audio.mjs'),
    `--input=${inputPath}`,
    `--output=${outputPath}`,
  ], { cwd: root, stdio: 'inherit' });

  film.sourcePath = film.path;
  film.sourceRunPath = film.runPath;
  film.path = relative(directory, outputPath);
  film.runPath = relative(runDirectory, outputPath);
  film.audioNormalization = {
    method: 'FFmpeg loudnorm after iteration film assembly',
    targetIntegratedLufs: -16,
    maximumTruePeakDbtp: -1.5,
    targetLoudnessRangeLu: 11,
    outputPath: outputRunPath,
    completedAt: new Date().toISOString(),
  };
  film.audioStream = await probeAudioStream(outputPath);
  film.durationSeconds = (await probeVideoStream(outputPath)).duration;
  delete record.iterationAudioNormalization;
  await saveHtml(directory, record);
}

async function assembleAllIterations(run, runDirectory) {
  const entries = run.iterations || [];
  if (!entries.length) return;
  const generateTitleCards = run.generationSettings?.generateTitleCards !== false;

  const sourceIterations = [];
  for (const entry of entries) {
    const record = await json(join(runDirectory, entry.directory, 'record.json'));
    const film = record.concatenatedVideo;
    if (!film?.path) {
      console.log(`ALL_ITERATIONS_FILM_WAITING · ${entry.directory} has no completed scene film yet`);
      return;
    }
    const filmPath = resolve(runDirectory, film.runPath || join(entry.directory, film.path));
    if (!await exists(filmPath)) {
      console.log(`ALL_ITERATIONS_FILM_WAITING · missing ${filmPath}`);
      return;
    }
    sourceIterations.push({
      directory: entry.directory,
      articleTitle: record.article?.title || '',
      audioEdgeFadeSeconds: film.audioEdgeFadeSeconds ?? 0,
      sourceTasks: film.sourceTasks,
    });
  }

  const mergedDirectory = join(runDirectory, 'merged');
  const outputPath = join(mergedDirectory, 'eu-reski-gesamtfilm.mp4');
  const sourceSignature = JSON.stringify(sourceIterations);
  if (run.assembledFilm?.path === relative(runDirectory, outputPath)
    && JSON.stringify(run.assembledFilm.sourceIterations) === sourceSignature
    && run.assembledFilm.audioEdgeFadeSeconds === 0.25
    && run.assembledFilm.generateTitleCards === generateTitleCards
    && await exists(outputPath)) return;

  await mkdir(mergedDirectory, { recursive: true });
  try {
    execFileSync(process.execPath, [
      join(root, 'eu-reski-news', 'scripts', 'assemble-news-film.mjs'),
      `--run-dir=${runDirectory}`,
      `--output=${outputPath}`,
      generateTitleCards ? '--generate-title-cards' : '--no-generate-title-cards',
      '--fade-seconds=0.25',
    ], { cwd: root, stdio: 'inherit' });
    const assembledVideo = await probeVideoStream(outputPath);
    run.assembledFilm = {
      path: relative(runDirectory, outputPath),
      iterations: entries.length,
      durationSeconds: assembledVideo.duration,
      sourceIterations,
      method: `FFmpeg assembler · ${generateTitleCards ? 'article title cards from record.json → article.title' : 'no title cards'} · 0.25s audio/video fades`,
      audioEdgeFadeSeconds: 0.25,
      generateTitleCards,
      audioStream: await probeAudioStream(outputPath),
      createdAt: new Date().toISOString(),
    };
    await safeSave(join(runDirectory, 'run.json'), run);
    console.log(`ALL_ITERATIONS_FILM_READY ${outputPath} · ${assembledVideo.duration}s · ${entries.length} iterations`);
  } catch (error) {
    run.assembledFilm = {
      status: 'render_failed',
      iterations: entries.length,
      sourceIterations,
      error: error.message || String(error),
      failedAt: new Date().toISOString(),
    };
    await safeSave(join(runDirectory, 'run.json'), run);
    console.error(`ALL_ITERATIONS_FILM_FAILED · ${error.message || error}; per-iteration films remain available`);
  }
}

const runManifestPath = join(runDirectory, 'run.json');
if (!await exists(runManifestPath)) throw new Error(`Missing run manifest: ${runManifestPath}`);
const run = await json(runManifestPath);
if (values['generate-title-cards']) {
  run.generationSettings ||= {};
  run.generationSettings.generateTitleCards = true;
  await safeSave(runManifestPath, run);
}
  const selectedIterations = values.iteration
    ? (run.iterations || []).filter((entry) => entry.directory === values.iteration)
    : run.iterations || [];
  if (values.iteration && selectedIterations.length !== 1) throw new Error(`Iteration ${values.iteration} is not registered in ${runDirectory}/run.json`);
  for (const entry of selectedIterations) {
  const directory = join(runDirectory, entry.directory);
  const record = await json(join(directory, 'record.json'));
  if (values['generate-title-cards']) {
    const iterationNumber = Number(entry.directory.match(/iteration-(\d+)/)?.[1]);
    record.titleCard = await renderTitleCard({
      runDirectory,
      iterationDirectory: entry.directory,
      iterationNumber,
    });
    await safeSave(join(directory, 'record.json'), record);
  }
  const filmPlanPath = join(directory, 'film-plan.json');
  record.filmPlan = await json(filmPlanPath);
  const scenes = record.filmPlan.scenePlan;
  console.log(`Generating ${scenes.length} scene videos with concurrency ${videoConcurrency}; audio edge fade ${audioEdgeFadeSeconds}s.`);
  let nextSceneIndex = 0;
  const sceneErrors = [];
  const workers = Array.from({ length: Math.min(videoConcurrency, scenes.length) }, async () => {
    while (nextSceneIndex < scenes.length) {
      const index = nextSceneIndex;
      nextSceneIndex += 1;
      try {
        await generateScene(directory, record, scenes[index], index);
      } catch (error) {
        const scene = scenes[index];
        const previousResult = record.videoResults?.[index] || {};
        const { path: ignoredPath, ...savedResult } = previousResult;
        const requestPath = join(directory, `scene-${scene.index}-video-request.json`);
        const savedRequest = await json(requestPath).catch(() => null);
        record.videoResults ||= [];
        record.videoResults[index] = {
          ...savedResult,
          provider: 'Runware',
          model: values.model,
          status: previousResult.status || 'failed',
          taskUUID: previousResult.taskUUID || savedRequest?.taskUUID || null,
          error: error.message || String(error),
          lastAttemptFailedAt: new Date().toISOString(),
        };
        sceneErrors.push({ sceneIndex: scene.index, error: error.message || String(error) });
        console.error(`VIDEO_FAILED ${directory} · scene ${scene.index} · ${error.message || error}; remaining scenes continue`);
      }
    }
  });
  const workerOutcomes = await Promise.allSettled(workers);
  for (const outcome of workerOutcomes) {
    if (outcome.status === 'rejected') sceneErrors.push({ sceneIndex: null, error: outcome.reason?.message || String(outcome.reason) });
  }
  const missingFirstLastFrames = record.filmPlan.scenePlan.filter((scene, index) =>
    scene.videoMode === 'first_last_frame' && !record.videoResults?.[index]?.path,
  );
  const failedScenes = scenes.filter((scene, index) =>
    scene.videoMode !== 'first_last_frame'
      && !record.videoResults?.[index]?.path
      && record.videoResults?.[index]?.status !== 'rejected_by_provider_moderation',
  );
  if (missingFirstLastFrames.length) {
    record.filmPlan.status = `Videos teilweise bereit · ${missingFirstLastFrames.length} First-Last-Frame-Szene(n) benötigen passende Endbilder`;
  } else if (failedScenes.length) {
    record.filmPlan.status = `Teilweise bereit · ${failedScenes.length} Szenenvideo(s) fehlgeschlagen; denselben Aufruf zum Fortsetzen wiederholen`;
  } else {
    const rejected = record.videoResults?.find((video) => video?.status === 'rejected_by_provider_moderation');
    record.filmPlan.status = rejected ? 'Video teilweise bereit · Szene vom Videodienst abgewiesen' : 'Videos per API erzeugt';
  }
  if (failedScenes.length || missingFirstLastFrames.length) record.concatenatedVideo = null;
  record.videoGeneration = {
    provider: 'Runware', model: values.model, resolution: values.resolution,
    ...(usesPVideo2Pro ? { settings: { mode: settingsMode } } : { outputQuality }),
    ...(failedScenes.length || missingFirstLastFrames.length ? {
      status: 'partial_scene_failures',
      failedScenes: sceneErrors,
      missingFirstLastFrameScenes: missingFirstLastFrames.map((scene) => scene.index),
    } :
      record.videoResults?.some((video) => video?.status === 'rejected_by_provider_moderation')
        ? { status: 'partial_provider_moderation_rejection' }
        : { completedAt: new Date().toISOString() }),
    concurrency: videoConcurrency,
    audioEdgeFadeSeconds,
  };
  await safeSave(filmPlanPath, record.filmPlan);
  await saveHtml(directory, record);
  if (!failedScenes.length && !missingFirstLastFrames.length) {
    try {
      await concatenateIteration(directory, record);
    } catch (error) {
      record.concatenatedVideo = null;
      record.filmPlan.status = `Videos fertig · FFmpeg-Montage fehlgeschlagen: ${error.message || error}`;
      record.videoGeneration.renderError = error.message || String(error);
      await saveHtml(directory, record);
      console.error(`ITERATION_RENDER_FAILED ${directory} · ${error.message || error}; videos remain saved for a render retry`);
    }
    if (record.concatenatedVideo?.path && values['generate-title-cards']) {
      try {
        const iterationFilmPath = join(runDirectory, 'merged', `${entry.directory}-with-title-card.mp4`);
        execFileSync(process.execPath, [
          join(root, 'eu-reski-news', 'scripts', 'assemble-news-film.mjs'),
          `--run-dir=${runDirectory}`,
          `--iteration=${entry.directory}`,
          '--generate-title-cards',
          `--card-seconds=${record.titleCard?.durationSeconds || 4}`,
          '--fade-seconds=0.25',
          `--output=${iterationFilmPath}`,
        ], { cwd: root, stdio: 'inherit' });
        const titledFilm = await probeVideoStream(iterationFilmPath);
        record.titleCardFilm = {
          path: relative(directory, iterationFilmPath),
          runPath: relative(runDirectory, iterationFilmPath),
          durationSeconds: titledFilm.duration,
          audioStream: await probeAudioStream(iterationFilmPath),
          fadeSeconds: 0.25,
          method: 'FFmpeg assembler · title card from record.json → article.title',
          createdAt: new Date().toISOString(),
        };
        await saveHtml(directory, record);
      } catch (error) {
        record.titleCardFilm = {
          status: 'render_failed',
          error: error.message || String(error),
          failedAt: new Date().toISOString(),
        };
        await saveHtml(directory, record);
        console.error(`TITLE_CARD_RENDER_FAILED ${directory} · ${error.message || error}; scene film remains available`);
      }
    }
  }
  if (record.concatenatedVideo?.path) {
    try {
      await normalizeIterationFilm(directory, record);
    } catch (error) {
      record.iterationAudioNormalization = {
        status: 'failed',
        error: error.message || String(error),
        failedAt: new Date().toISOString(),
      };
      await saveHtml(directory, record);
      console.error(`ITERATION_AUDIO_NORMALIZATION_FAILED ${directory} · ${error.message || error}; original film remains available`);
    }
  }
}
const iterations = [];
for (const entry of run.iterations || []) {
  const directory = join(runDirectory, entry.directory);
  const record = await json(join(directory, 'record.json'));
  for (const video of record.videoResults || []) {
    if (video?.path && !Object.hasOwn(video, 'audioStream')) {
      video.audioStream = await probeAudioStream(join(directory, video.path));
    }
  }
  if (record.concatenatedVideo?.path && !Object.hasOwn(record.concatenatedVideo, 'audioStream')) {
    record.concatenatedVideo.audioStream = await probeAudioStream(join(directory, record.concatenatedVideo.path));
  }
  await saveHtml(directory, record);
  iterations.push({ directory: entry.directory, record });
}
await assembleAllIterations(run, runDirectory);
await writeFile(join(runDirectory, 'index.html'), renderRunReport(run, iterations));
console.log(`HTML: ${join(runDirectory, 'index.html')}`);
