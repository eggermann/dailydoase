import { createHash, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdir, readFile, readdir, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';
import { findRankedNewsCollections } from '../news-scene/news-ranking.mjs';
import { renderRunReport } from '../news-scene/report.mjs';
import { resolveAutoModeSetting } from '../news-scene/auto-director.mjs';
import { loadSceneSequence, resolveParallelSceneSchedule } from '../news-scene/scene-sequence.mjs';
import { mergeRunnerArguments } from '../news-scene/runner-arguments.mjs';
import { getReadyIterations } from '../news-scene/exhibition-readiness.mjs';
import { withDirectoryLock } from '../news-scene/directory-lock.mjs';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const settingsPath = join(repositoryRoot, 'eu-reski-news', 'default-exhibition-settings.json');
const defaultSettings = JSON.parse(readFileSync(settingsPath, 'utf8'));
if (!Number.isInteger(defaultSettings.version) || defaultSettings.version < 1) {
  throw new Error(`Invalid exhibition settings version in ${settingsPath}`);
}
const settingsFingerprint = createHash('sha256').update(JSON.stringify(defaultSettings)).digest('hex');
const defaultExhibition = defaultSettings.exhibition;
const defaultGeneration = defaultSettings.generation;
const newsDirectory = resolve(repositoryRoot, process.env.NEWS_NEWS_DIR || defaultSettings.paths.newsDirectory);
const outputDirectory = resolve(repositoryRoot, process.env.NEWS_OUTPUT_DIR || defaultSettings.paths.outputDirectory);
const statePath = join(outputDirectory, 'exhibition-state.json');
const lockPath = join(outputDirectory, '.exhibition-runner.lock');
const refreshIntervalMs = positiveInteger(process.env.NEWS_REFRESH_INTERVAL_MS, defaultExhibition.newsRefreshIntervalMs);
const refreshCheckMs = positiveInteger(process.env.NEWS_REFRESH_CHECK_MS, defaultExhibition.newsRefreshCheckMs);
const refreshRetryMs = positiveInteger(process.env.NEWS_REFRESH_RETRY_MS, defaultExhibition.newsRefreshRetryMs);
const mergeCheckMs = positiveInteger(process.env.EXHIBITION_MERGE_CHECK_MS, defaultExhibition.mergeCheckMs);
const mergeRetryMs = positiveInteger(process.env.EXHIBITION_MERGE_RETRY_MS, defaultExhibition.mergeRetryMs);
let glueEnabled = process.env.EXHIBITION_FIRST_LAST_GLUE === undefined
  ? defaultExhibition.firstLastGlue
  : process.env.EXHIBITION_FIRST_LAST_GLUE !== '0';
let gluePattern = process.env.EXHIBITION_GLUE_DURATION_PATTERN || defaultExhibition.glueDurationPattern.join(',');
let glueWaitPattern = process.env.EXHIBITION_GLUE_WAIT_PATTERN || defaultExhibition.glueWaitPattern;
let glueFrameOffset = process.env.EXHIBITION_FRAME_OFFSET_SECONDS || String(defaultExhibition.frameOffsetSeconds);
let fadeSeconds = process.env.EXHIBITION_FADE_SECONDS || String(defaultExhibition.fadeSeconds);
let randomThreshold = Number(process.env.EXHIBITION_RANDOM_BRIDGE_THRESHOLD ?? defaultExhibition.randomBridgeThreshold);
const runnerScript = join(scriptDirectory, 'run-news-scene-image-iteration.mjs');
const fetchScript = join(scriptDirectory, 'fetch-eu-news-today.mjs');
const classifyScript = join(scriptDirectory, 'classify-eu-news-with-jev.mjs');
const glueScript = join(scriptDirectory, 'generate-scene-glue-videos.mjs');
const assembleScript = join(scriptDirectory, 'assemble-news-film.mjs');

function positiveInteger(value, fallback) {
  const number = Number(value ?? fallback);
  if (!Number.isSafeInteger(number) || number < 1) throw new Error(`Expected positive integer, got ${value}`);
  return number;
}

function log(message) {
  console.log(`[exhibition ${new Date().toISOString()}] ${message}`);
}

let wakeForStop;
const stopSignal = new Promise((resolveStop) => { wakeForStop = resolveStop; });
const delayOrStop = (milliseconds) => new Promise((resolveDelay) => {
  const timeout = setTimeout(resolveDelay, milliseconds);
  stopSignal.then(() => {
    clearTimeout(timeout);
    resolveDelay();
  });
});
const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'));

async function inspectSavedSceneWorkers(savedWorkers = {}) {
  const resumableStatuses = new Set(['running', 'pending_media', 'interrupted', 'completed']);
  let hasResumableWorker = false;
  for (const [workerKey, worker] of Object.entries(savedWorkers)) {
    if (!worker.runDirectory) {
      if (worker.status === 'starting') {
        throw new Error(`Worker ${workerKey} has no saved Run directory; state is ambiguous. Inspect its output before restarting.`);
      }
      continue;
    }
    const manifestPath = join(worker.runDirectory, 'run.json');
    const manifest = await readJson(manifestPath).catch((error) => {
      if (error.code === 'ENOENT') throw new Error(`Worker ${workerKey} points to a missing run.json: ${manifestPath}`);
      throw error;
    });
    if (!['running', 'pending_media', 'completed', 'failed', 'interrupted'].includes(manifest.status)) {
      throw new Error(`Worker ${workerKey} has an unknown Run status "${manifest.status ?? '(missing)'}" in ${manifestPath}`);
    }
    worker.status = manifest.status;
    worker.iteratorPlanFingerprint = manifest.iteratorPlanFingerprint || null;
    worker.runManifestUpdatedAt = manifest.finishedAt || manifest.startedAt || null;
    if (manifest.status === 'failed') throw new Error(`Worker ${workerKey} has a failed Run; inspect ${manifestPath} before starting again.`);
    if (resumableStatuses.has(manifest.status)) hasResumableWorker = true;
  }
  return hasResumableWorker;
}

async function saveJson(path, value) {
  const temporaryPath = `${path}.${randomUUID()}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await rename(temporaryPath, path);
}

let stateSaveQueue = Promise.resolve();
function saveState() {
  const snapshot = structuredClone(state);
  stateSaveQueue = stateSaveQueue.then(() => saveJson(statePath, snapshot));
  return stateSaveQueue;
}

async function listAggregateFiles() {
  let directoryEntries;
  try {
    directoryEntries = await readdir(newsDirectory);
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
  return directoryEntries
    .filter((name) => /^all-.*\.json$/.test(name))
    .sort()
    .reverse();
}

function isNewsJsonFile(name) {
  return /^all-.*\.json$/.test(name)
    || /^eu-relevance-.*\.json$/.test(name)
    || /^[a-z]{2}-.*\.json$/.test(name);
}

function europeanTimestamp(date = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(date).map(({ type, value }) => [type, value]));
  const milliseconds = String(date.getMilliseconds()).padStart(3, '0');
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}-${parts.minute}-${parts.second}-${milliseconds}`;
}

async function archivePreviousNewsJsons(activeCollection) {
  const activeAggregateFile = basename(activeCollection.aggregatePath);
  const sourceTag = activeAggregateFile.replace(/^all-/, '').replace(/\.json$/, '');
  const activeFiles = new Set([
    activeAggregateFile,
    basename(activeCollection.relevancePath),
  ]);
  let entries;
  try {
    entries = await readdir(newsDirectory, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return;
    throw error;
  }
  const previousFiles = entries
    .filter((entry) => entry.isFile() && isNewsJsonFile(entry.name))
    .filter((entry) => !activeFiles.has(entry.name) && !entry.name.endsWith(`-${sourceTag}.json`))
    .map((entry) => entry.name);
  if (!previousFiles.length) return;

  const backupDirectory = join(newsDirectory, '_bak', europeanTimestamp());
  await mkdir(backupDirectory, { recursive: true });
  let archived = 0;
  for (const file of previousFiles) {
    try {
      await rename(join(newsDirectory, file), join(backupDirectory, file));
      archived += 1;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  if (archived) log(`Archivierte ${archived} ältere News-/Ranking-JSONs nach ${backupDirectory}.`);
}

function runCommand(label, command, args, { onLine = null, inheritStdin = false } = {}) {
  return new Promise((resolveCommand, rejectCommand) => {
    const child = spawn(command, args, {
      cwd: repositoryRoot,
      env: process.env,
      stdio: [inheritStdin ? 'inherit' : 'ignore', 'pipe', 'pipe'],
    });
    children.add(child);
    const output = (stream, destination) => {
      const lines = createInterface({ input: stream, crlfDelay: Infinity });
      lines.on('line', (line) => {
        destination(line);
        onLine?.(line);
      });
    };
    output(child.stdout, (line) => console.log(line));
    output(child.stderr, (line) => console.error(line));
    child.once('error', (error) => {
      children.delete(child);
      rejectCommand(error);
    });
    child.once('close', (code, signal) => {
      children.delete(child);
      if (code === 0) resolveCommand({ code, signal });
      else rejectCommand(new Error(`${label} ended with ${signal || `exit ${code}`}`));
    });
  });
}

async function runAtomicMp4Command(label, argumentsList, outputPath) {
  await mkdir(dirname(outputPath), { recursive: true });
  const temporaryPath = join(dirname(outputPath), `${basename(outputPath, '.mp4')}.partial-${randomUUID()}.mp4`);
  const temporaryArguments = argumentsList.map((argument) =>
    argument === `--output=${outputPath}` ? `--output=${temporaryPath}` : argument);
  try {
    await runCommand(label, process.execPath, temporaryArguments);
    const result = await stat(temporaryPath);
    if (!result.isFile() || result.size < 1) throw new Error(`${label} did not produce a non-empty MP4`);
    await rename(temporaryPath, outputPath);
  } finally {
    await unlink(temporaryPath).catch((error) => { if (error.code !== 'ENOENT') throw error; });
  }
}

function flagName(argument) {
  return argument.startsWith('--') ? argument.split('=', 1)[0] : null;
}

function defaultsFromExhibitionSettings(generation = defaultGeneration) {
  const { sceneCount, sceneLength, visualControls } = generation;
  const defaults = [
    `--story-model=${generation.storyModel}`,
    generation.includeSourceCodeContext === false ? '--no-source-code-context' : '--include-source-code-context',
    ...(generation.sourceCodeSummaryFile ? [`--source-code-summary-file=${generation.sourceCodeSummaryFile}`] : []),
    `--scene-count-mode=${sceneCount.mode}`,
    ...(sceneCount.mode === 'fixed' && Number.isInteger(sceneCount.count) ? [`--scenes=${sceneCount.count}`] : []),
    `--scene-count-takt=${sceneCount.takt}`,
    `--scene-count-numerator=${sceneCount.numerator}`,
    `--scene-count-denominator=${sceneCount.denominator}`,
    `--scene-count-type=${sceneCount.type}`,
    `--scene-count-bias=${sceneCount.bias}`,
    `--min-scenes=${sceneCount.minimum}`,
    `--max-scenes=${sceneCount.maximum}`,
    `--scene-length-takt=${sceneLength.takt}`,
    `--scene-length-type=${sceneLength.type}`,
    `--scene-length-multiplier=${sceneLength.multiplier}`,
    `--scene-length-bias=${sceneLength.bias}`,
    `--min-scene-seconds=${sceneLength.minimum}`,
    `--max-scene-seconds=${sceneLength.maximum}`,
    `--image-provider=${generation.imageProvider}`,
    `--video-model=${generation.videoModel}`,
    `--video-resolution=${generation.videoResolution}`,
    `--video-settings-mode=${generation.videoSettingsMode}`,
    `--video-mode=${generation.videoMode}`,
    `--video-direction=${generation.videoDirection}`,
    `--story-clou=${generation.storyClou}`,
    `--video-vision=${generation.videoVision}`,
    `--video-audio-direction=${generation.videoAudioDirection}`,
    generation.noDialogueNarration ? '--no-dialogue-narration' : '--allow-dialogue-narration',
    `--video-max-zoom=${generation.videoMaxZoom}`,
    `--layering=${visualControls.layering}`,
    `--iterations=${generation.iterations}`,
    `--pause-ms=${generation.pauseMs}`,
    `--article-order=${generation.articleOrder}`,
    generation.legacyGuernicaStyleReferencePrompt ? '--legacy-guernica-style-reference-prompt' : '--no-legacy-guernica-style-reference-prompt',
  ];
  defaults.push(generation.autoMode ? '--auto-mode' : '--no-auto-mode');
  defaults.push(visualControls.symbolic ? '--symbolic' : '--no-symbolic');
  defaults.push(visualControls.roomDeepness ? '--room-deepness' : '--no-room-deepness');
  defaults.push(visualControls.mode === 'scene-specific' ? '--scene-visual-controls' : '--fixed-visual-controls');
  defaults.push(generation.articleImageReference ? '--article-image-reference' : '--no-article-image-reference');
  defaults.push(generation.styleReference === false ? '--no-style-reference' : '--use-style-reference');
  defaults.push(generation.guernicaFigureReference === false ? '--no-guernica-figure-reference' : '--use-guernica-figure-reference');
  defaults.push(generation.guernicaLocationReference ? '--guernica-location-reference' : '--no-guernica-location-reference');
  defaults.push(generation.landscapePrompt ? '--landscape-prompt' : '--no-landscape-prompt');
  defaults.push(generation.preserveCubistVideoStyle ? '--preserve-cubist-video-style' : '--no-preserve-cubist-video-style');
  defaults.push(generation.videosAfterEachIteration ? '--videos-after-each-iteration' : '--no-videos-after-each-iteration');
  defaults.push(generation['generate-title-cards'] ? '--generate-title-cards' : '--no-generate-title-cards');
  defaults.push(generation.stopOmitSimilar === false ? '--no-stop-omit-similar' : '--stop-omit-similar');

  return {
    args: defaults,
    storyModel: generation.storyModel,
    source: `${settingsPath} (version ${defaultSettings.version})`,
  };
}

function argumentValue(argumentsList, flag, fallback) {
  const index = argumentsList.findIndex((argument) => flagName(argument) === flag);
  if (index < 0) return fallback;
  const argument = argumentsList[index];
  return argument.includes('=') ? argument.slice(flag.length + 1) : argumentsList[index + 1] ?? fallback;
}

async function newestAggregate() {
  const files = await listAggregateFiles();
  if (!files.length) return null;
  const file = files[0];
  const path = join(newsDirectory, file);
  const aggregate = await readJson(path);
  return { file, path, aggregate };
}

async function refreshNewsIfNeeded() {
  const newest = await newestAggregate();
  const fetchedAtMs = newest ? Date.parse(newest.aggregate.fetchedAt || '') : NaN;
  const ageMs = Number.isFinite(fetchedAtMs) ? Date.now() - fetchedAtMs : Infinity;
  const rankedCollections = await findRankedNewsCollections(newsDirectory);
  const isFullyClassified = (collection) => collection
    && Number(collection.relevance.completedCount) >= Number(collection.relevance.articleCount)
    && Number(collection.relevance.failedCount || 0) === 0
    && Number(collection.relevance.unresolvedCount || 0) === 0;
  const latestIsRanked = rankedCollections[0]?.aggregateFile === newest?.file && isFullyClassified(rankedCollections[0]);

  if (!newest || ageMs >= refreshIntervalMs) {
    log(newest ? `News-Collection ist ${(ageMs / 3_600_000).toFixed(1)} h alt; Fetch startet.` : 'Keine News-Collection vorhanden; Fetch startet.');
    await runCommand('News-Fetch', process.execPath, [fetchScript]);
  }

  const afterFetch = await newestAggregate();
  const afterRanked = await findRankedNewsCollections(newsDirectory);
  const afterLatestIsRanked = afterRanked[0]?.aggregateFile === afterFetch?.file && isFullyClassified(afterRanked[0]);
  if (!afterLatestIsRanked) {
    log(`Jev bewertet neue Collection ${afterFetch?.file || '(fehlend)'}.`);
    await runCommand('Jev-EU-Bewertung', process.execPath, [classifyScript]);
  } else if (latestIsRanked && ageMs < refreshIntervalMs) {
    log(`News aktuell (${(ageMs / 3_600_000).toFixed(1)} h); Jev-Ranking vorhanden.`);
  }

  const completedRankings = await findRankedNewsCollections(newsDirectory);
  const completedLatest = completedRankings[0];
  if (completedLatest?.aggregateFile === afterFetch?.file && isFullyClassified(completedLatest)) {
    await archivePreviousNewsJsons(completedLatest);
  }
}

async function readState() {
  try { return await readJson(statePath); } catch (error) {
    if (error.code === 'ENOENT') return {};
    throw error;
  }
}

async function rankedCollectionAvailable() {
  return (await findRankedNewsCollections(newsDirectory)).length > 0;
}

async function runRefreshLoop() {
  while (!stopping) {
    try {
      await refreshNewsIfNeeded();
      await delayOrStop(refreshCheckMs);
    } catch (error) {
      console.error(`[exhibition] News refresh failed: ${error.message}`);
      await delayOrStop(refreshRetryMs);
    }
  }
}

async function updateFilms(runDirectory, readyIterations, videoSettings, generateTitleCards, workerKey = null) {
  if (!glueEnabled || !readyIterations.length) return;
  const glueDirectory = join(runDirectory, 'glue-vids');
  const iterationCount = readyIterations.length;
  if (await hasCompleteFilmSet(runDirectory, readyIterations)) {
    if (workerKey) {
      state.sceneWorkers ||= {};
      state.sceneWorkers[workerKey] ||= {};
      Object.assign(state.sceneWorkers[workerKey], { runDirectory, gluedThroughIteration: iterationCount });
    } else {
      state.runDirectory = runDirectory;
      state.gluedThroughRunDirectory = runDirectory;
      state.gluedThroughIteration = iterationCount;
    }
    await saveState();
    return;
  }
  log(`Generate/resume First-Last-Frame bridges through iteration ${iterationCount}; wait source ${glueWaitPattern || 'Taktmuster 2/4/4 classic'}.`);
  await runCommand('First-Last-Frame-Glue', process.execPath, [
    glueScript,
    `--run=${runDirectory}`,
    `--iterations=${iterationCount}`,
    `--model=${videoSettings.model}`,
    `--resolution=${videoSettings.resolution}`,
    `--settings-mode=${videoSettings.settingsMode}`,
    `--duration-pattern=${gluePattern}`,
    `--transition-wait-pattern=${glueWaitPattern}`,
    `--frame-offset-seconds=${glueFrameOffset}`,
    `--output-dir=${glueDirectory}`,
  ]);

  const normalizedIterationDirectory = join(glueDirectory, 'normalized-iterations');
  const normalizeAudioScript = join(scriptDirectory, 'normalize-iteration-audio.mjs');
  const stableSeed = createHash('sha256').update(runDirectory).digest('hex').slice(0, 16);
  const iterationFilmVariants = [
    { name: 'full', bridgeArguments: [] },
    {
      name: 'random-bridges',
      bridgeArguments: [`--bridge-random-threshold=${randomThreshold}`, `--bridge-random-seed=${stableSeed}`],
    },
  ];
  for (const variant of iterationFilmVariants) {
    for (const entry of readyIterations) {
      const record = await readJson(join(runDirectory, entry.directory, 'record.json'));
      const variantDirectory = join(normalizedIterationDirectory, variant.name);
      const intermediatePath = join(variantDirectory, `${entry.directory}-before-audio-normalization.mp4`);
      const normalizedPath = join(variantDirectory, `${entry.directory}-audio-normalized.mp4`);
      await runAtomicMp4Command(`Assemble ${entry.directory} (${variant.name})`, [
        assembleScript,
        `--run-dir=${runDirectory}`,
        `--iteration=${entry.directory}`,
        `--scene-glue-dir=${glueDirectory}`,
        '--existing-bridges-only',
        `--frame-offset-seconds=${glueFrameOffset}`,
        `--fade-seconds=${fadeSeconds}`,
        ...(generateTitleCards ? ['--generate-title-cards'] : ['--no-generate-title-cards']),
        ...variant.bridgeArguments,
        `--output=${intermediatePath}`,
      ], intermediatePath);
      await runAtomicMp4Command(`Normalize ${entry.directory} audio (${variant.name})`, [
        normalizeAudioScript,
        `--input=${intermediatePath}`,
        `--output=${normalizedPath}`,
      ], normalizedPath);
    }
  }

  const baseArguments = [
    assembleScript,
    `--run-dir=${runDirectory}`,
    `--iteration-film-dir=${join(normalizedIterationDirectory, 'full')}`,
    `--limit=${iterationCount}`,
    '--no-generate-title-cards',
    `--fade-seconds=${fadeSeconds}`,
  ];
  await runAtomicMp4Command('Full exhibition film', [
    ...baseArguments,
    `--output=${join(glueDirectory, 'eu-reski-live-full.mp4')}`,
  ], join(glueDirectory, 'eu-reski-live-full.mp4'));
  await runAtomicMp4Command('Sparse random-bridge film', [
    assembleScript,
    `--run-dir=${runDirectory}`,
    `--iteration-film-dir=${join(normalizedIterationDirectory, 'random-bridges')}`,
    `--limit=${iterationCount}`,
    '--no-generate-title-cards',
    `--fade-seconds=${fadeSeconds}`,
    `--output=${join(glueDirectory, 'eu-reski-live-random-bridges.mp4')}`,
  ], join(glueDirectory, 'eu-reski-live-random-bridges.mp4'));

  const runManifestPath = join(runDirectory, 'run.json');
  const runManifest = await readJson(runManifestPath);
  const glueSummary = await readJson(join(glueDirectory, 'glue-run.json'));
  runManifest.assembledFilm = {
    status: 'ready',
    path: 'glue-vids/eu-reski-live-full.mp4',
    iterations: iterationCount,
    transitionCount: glueSummary.transitionCount,
    transitionWaitPattern: glueSummary.transitionWaitPattern,
    method: `First/Last-Frame-Glue · ${glueSummary.transitionCount} Übergänge · ${glueSummary.transitionWaitPattern} · Audio je Iteration normalisiert`,
    audioNormalization: {
      method: 'FFmpeg loudnorm after assembling each iteration with its bridges',
      targetIntegratedLufs: -16,
      maximumTruePeakDbtp: -1.5,
      targetLoudnessRangeLu: 11,
      iterationFilmsDirectory: 'glue-vids/normalized-iterations',
    },
  };
  await saveJson(runManifestPath, runManifest);
  const reportIterations = await Promise.all((runManifest.iterations || []).map(async (entry) => ({
    directory: entry.directory,
    record: await readJson(join(runDirectory, entry.directory, 'record.json')),
  })));
  await writeFile(join(runDirectory, 'index.html'), renderRunReport(runManifest, reportIterations));

  if (workerKey) {
    state.sceneWorkers ||= {};
    state.sceneWorkers[workerKey] ||= {};
    Object.assign(state.sceneWorkers[workerKey], {
      runDirectory,
      gluedThroughIteration: iterationCount,
      lastFilmBuildAt: new Date().toISOString(),
    });
  } else {
    state.runDirectory = runDirectory;
    state.gluedThroughRunDirectory = runDirectory;
    state.gluedThroughIteration = iterationCount;
    state.lastFilmBuildAt = new Date().toISOString();
  }
  await saveState();
}

async function hasCompleteFilmSet(runDirectory, readyIterations) {
  if (!readyIterations.length) return false;
  const runManifest = await readJson(join(runDirectory, 'run.json'));
  if (runManifest.assembledFilm?.status !== 'ready'
    || Number(runManifest.assembledFilm.iterations) !== readyIterations.length) return false;
  const glueDirectory = join(runDirectory, 'glue-vids');
  const expectedFiles = [
    join(glueDirectory, 'glue-run.json'),
    join(glueDirectory, 'eu-reski-live-full.mp4'),
    join(glueDirectory, 'eu-reski-live-random-bridges.mp4'),
    ...readyIterations.flatMap(({ directory }) => [
      join(glueDirectory, 'normalized-iterations', 'full', `${directory}-audio-normalized.mp4`),
      join(glueDirectory, 'normalized-iterations', 'random-bridges', `${directory}-audio-normalized.mp4`),
    ]),
  ];
  for (const path of expectedFiles) {
    const details = await stat(path).catch((error) => {
      if (error.code === 'ENOENT') return null;
      throw error;
    });
    if (!details?.isFile() || details.size < 1) return false;
  }
  return true;
}

async function runMergeLoop(runDirectory, videoSettings, generateTitleCards, workerKey = null) {
  while (!stopping) {
    if (mergeRunning) {
      await delayOrStop(mergeCheckMs);
      continue;
    }
    mergeRunning = true;
    try {
      const ready = await getReadyIterations(runDirectory);
      const savedState = await readState();
      const workerState = workerKey ? savedState.sceneWorkers?.[workerKey] : null;
      const gluedThroughIteration = workerKey
        ? workerState?.runDirectory === runDirectory ? Number(workerState.gluedThroughIteration || 0) : 0
        : savedState.gluedThroughRunDirectory === runDirectory ? Number(savedState.gluedThroughIteration || 0)
        : 0;
      if (ready.length) {
        if (await hasCompleteFilmSet(runDirectory, ready)) {
          if (gluedThroughIteration < ready.length) {
            if (workerKey) {
              state.sceneWorkers ||= {};
              state.sceneWorkers[workerKey] ||= {};
              Object.assign(state.sceneWorkers[workerKey], { runDirectory, gluedThroughIteration: ready.length });
            } else {
              state.runDirectory = runDirectory;
              state.gluedThroughRunDirectory = runDirectory;
              state.gluedThroughIteration = ready.length;
            }
            await saveState();
          }
        } else {
          await updateFilms(runDirectory, ready, videoSettings, generateTitleCards, workerKey);
        }
      }
      await delayOrStop(mergeCheckMs);
    } catch (error) {
      console.error(`[exhibition] Film merge failed: ${error.message}`);
      await delayOrStop(mergeRetryMs);
    } finally {
      mergeRunning = false;
    }
  }
}

let stopping = false;
let runnerChild = null;
let mergeRunning = false;
let state = {};
const children = new Set();

function requestStop(signal) {
  if (stopping) return;
  stopping = true;
  wakeForStop();
  log(`${signal} received; stopping child processes.`);
  for (const child of children) child.kill(signal);
  runnerChild?.kill(signal);
}

process.once('SIGINT', () => requestStop('SIGINT'));
process.once('SIGTERM', () => requestStop('SIGTERM'));

async function withLock(task) {
  await mkdir(outputDirectory, { recursive: true });
  return withDirectoryLock(lockPath, task);
}

function startRunner(argumentsList, runDirectory, onRunDirectory, workerKey = null) {
  let resolveClosed;
  let rejectClosed;
  const closed = new Promise((resolveRunner, rejectRunner) => {
    resolveClosed = resolveRunner;
    rejectClosed = rejectRunner;
  });
  try {
    let globalArticleQueueExhausted = false;
    const args = [runnerScript, ...argumentsList];
    if (runDirectory && !args.some((argument) => flagName(argument) === '--resume-run')) args.push(`--resume-run=${runDirectory}`);
    const child = spawn(process.execPath, args, { cwd: repositoryRoot, env: process.env, stdio: ['inherit', 'pipe', 'pipe'] });
    runnerChild = child;
    children.add(child);
    const onLine = (line) => {
      console.log(line);
      const match = /^Run folder: (.+)$/.exec(line);
      if (!match) return;
      if (workerKey) {
        state.sceneWorkers ||= {};
        state.sceneWorkers[workerKey] ||= {};
        state.sceneWorkers[workerKey].runDirectory = match[1];
      } else {
        state.runDirectory = match[1];
      }
      saveState().catch((error) => console.error(`[exhibition] Could not save run pointer: ${error.message}`));
      onRunDirectory?.(match[1]);
    };
    const stdoutLines = createInterface({ input: child.stdout, crlfDelay: Infinity });
    const stderrLines = createInterface({ input: child.stderr, crlfDelay: Infinity });
    stdoutLines.on('line', onLine);
    stderrLines.on('line', (line) => {
      console.error(line);
      if (line.includes('Global article queue exhausted:')) globalArticleQueueExhausted = true;
    });
    child.once('error', (error) => {
      children.delete(child);
      runnerChild = null;
      rejectClosed(error);
    });
    child.once('close', (code, signal) => {
      children.delete(child);
      runnerChild = null;
      resolveClosed({ code, signal, globalArticleQueueExhausted });
    });
    return { child, closed };
  } catch (error) {
    rejectClosed(error);
    return { child: null, closed };
  }
}

async function runParallelSceneWorkers(workers, finiteIterationLimit) {
  const refreshTask = runRefreshLoop();
  const mergeTasks = new Map();
  const retryAttempts = new Map();
  const pendingMediaAttempts = new Map();
  const maxWorkerRetries = positiveInteger(process.env.EXHIBITION_WORKER_MAX_RETRIES, 5);
  const startMergeLoop = (worker) => {
    if (!glueEnabled || mergeTasks.has(worker.key)) return;
    const runDirectory = worker.completedRunDirectory
      || worker.savedRunDirectory
      || state.sceneWorkers?.[worker.key]?.runDirectory;
    if (!runDirectory) return;
    mergeTasks.set(worker.key, runMergeLoop(runDirectory, worker.videoSettings, worker.generateTitleCards, worker.key));
  };
  const workerTasks = workers.map(async (worker) => {
    if (worker.completedRunDirectory) {
      startMergeLoop(worker);
      if (glueEnabled) {
        while (!stopping) {
          const savedState = await readState();
          if (savedState.sceneWorkers?.[worker.key]?.runDirectory === worker.completedRunDirectory
            && Number(savedState.sceneWorkers[worker.key].gluedThroughIteration || 0)
              >= Number((await readJson(join(worker.completedRunDirectory, 'run.json'))).iterations?.length || 0)) break;
          await delayOrStop(mergeCheckMs);
        }
      }
      return;
    }
    if (state.sceneWorkers?.[worker.key]?.runDirectory) startMergeLoop(worker);
    while (!stopping) {
      const savedRunDirectory = worker.savedRunDirectory || state.sceneWorkers?.[worker.key]?.runDirectory || null;
      state.sceneWorkers ||= {};
      state.sceneWorkers[worker.key] ||= {};
      state.sceneWorkers[worker.key].status = 'running';
      await saveState();
      const running = startRunner(worker.arguments, savedRunDirectory, (runDirectory) => {
        state.sceneWorkers ||= {};
        state.sceneWorkers[worker.key] ||= {};
        state.sceneWorkers[worker.key].runDirectory = runDirectory;
        state.sceneWorkers[worker.key].status = 'running';
        state.sceneWorkers[worker.key].iteratorPlanFingerprint = createHash('sha256').update(JSON.stringify(worker.plan)).digest('hex');
        startMergeLoop(worker);
      }, worker.key);
      const result = await running.closed;
      const runDirectory = state.sceneWorkers?.[worker.key]?.runDirectory || savedRunDirectory;
      const runManifest = runDirectory ? await readJson(join(runDirectory, 'run.json')).catch(() => null) : null;
      if (stopping) {
        if (runManifest?.status === 'running') {
          runManifest.status = 'interrupted';
          runManifest.interruptedAt = new Date().toISOString();
          await saveJson(join(runDirectory, 'run.json'), runManifest);
          state.sceneWorkers[worker.key].status = 'interrupted';
        }
        await saveState();
        return;
      }

      if (!runManifest || !['running', 'pending_media', 'completed', 'failed', 'interrupted'].includes(runManifest.status)) {
        state.sceneWorkers[worker.key].status = 'failed';
        await saveState();
        throw new Error(`${worker.name} ended with an unknown saved Run status; inspect ${runDirectory || 'its Run directory'}.`);
      }
      state.sceneWorkers[worker.key].status = runManifest.status;
      state.sceneWorkers[worker.key].iteratorPlanFingerprint = runManifest.iteratorPlanFingerprint || null;
      await saveState();
      if (runManifest.status === 'failed') {
        throw new Error(`${worker.name} saved a failed Run; refusing automatic resume of ${runDirectory}.`);
      }

      if (runManifest.status === 'completed') {
        if (finiteIterationLimit === null) {
          state.sceneWorkers[worker.key].status = 'failed';
          await saveState();
          throw new Error(`${worker.name} ended a continuous Run unexpectedly; it will not be restarted as a completed Run.`);
        }
        if (glueEnabled) {
          while (!stopping) {
            const savedState = await readState();
            if (savedState.sceneWorkers?.[worker.key]?.runDirectory === runDirectory
              && Number(savedState.sceneWorkers[worker.key].gluedThroughIteration || 0) >= finiteIterationLimit) break;
            await delayOrStop(mergeCheckMs);
          }
        }
        return;
      }

      if (runManifest.status === 'pending_media') {
        const attempt = (pendingMediaAttempts.get(worker.key) || 0) + 1;
        pendingMediaAttempts.set(worker.key, attempt);
        const retryDelay = Math.min(30_000 * (2 ** Math.min(attempt - 1, 4)), 300_000);
        retryAttempts.set(worker.key, 0);
        log(`${worker.name}: Run ${runDirectory} still has pending media; poll saved task IDs again in ${retryDelay / 1000} s (attempt ${attempt}).`);
        await delayOrStop(retryDelay);
      } else if (result.globalArticleQueueExhausted) {
        retryAttempts.set(worker.key, 0);
        log(`${worker.name}: global article queue exhausted; wait ${refreshCheckMs} ms for news refresh.`);
        await delayOrStop(refreshCheckMs);
      } else {
        const attempt = (retryAttempts.get(worker.key) || 0) + 1;
        retryAttempts.set(worker.key, attempt);
        if (attempt >= maxWorkerRetries) {
          runManifest.status = 'failed';
          runManifest.failedAt = new Date().toISOString();
          runManifest.failureReason = `Worker process ended ${attempt} consecutive times without a completed or pending_media state.`;
          await saveJson(join(runDirectory, 'run.json'), runManifest);
          state.sceneWorkers[worker.key].status = 'failed';
          await saveState();
          throw new Error(`${worker.name} failed after ${attempt} consecutive retries; inspect ${runDirectory}.`);
        }
        state.sceneWorkers[worker.key].status = 'interrupted';
        await saveState();
        const retryDelay = Math.min(30_000 * (2 ** (attempt - 1)), 300_000);
        log(`${worker.name}: runner ended (${result.signal || `code ${result.code}`}) with Run state ${runManifest.status}; retry ${attempt}/${maxWorkerRetries} on same Run in ${retryDelay / 1000}s.`);
        await delayOrStop(retryDelay);
      }
      if (runManifest.status !== 'pending_media') pendingMediaAttempts.set(worker.key, 0);
      if (runManifest.status === 'completed') retryAttempts.set(worker.key, 0);
      worker.savedRunDirectory = runDirectory;
    }
  });

  try {
    await Promise.all(workerTasks);
  } finally {
    if (!stopping) {
      stopping = true;
      wakeForStop();
    }
    for (const child of children) child.kill('SIGTERM');
    await Promise.allSettled([...workerTasks, refreshTask, ...mergeTasks.values()]);
  }
}

async function exhibitionMain() {
  if (process.argv.includes('--help')) {
    console.log('Start exhibition run. News refreshes every 24 h; Jev ranks EU relevance; linear article order.');
    console.log('Use --stop-after-iterations=N for a finite run; in parallel Scene mode N applies per worker.');
    console.log('In parallel mode, two workers with N=10 can generate up to 20 iterations total.');
    console.log('Use --new-run to start fresh after an existing campaign; previous Run directories are retained.');
    console.log('Flags: --no-first-last-glue disables generated bridges; bridges are on by default.');
    console.log('Flags: --auto-mode enables per-iteration artistic direction; --no-auto-mode disables it.');
    console.log('Environment: NEWS_ENV_FILE (in start script), NEWS_REFRESH_INTERVAL_MS.');
    return;
  }
  await withLock(async () => {
    const commandArguments = process.argv.slice(2);
    const startNewRun = commandArguments.some((argument) => flagName(argument) === '--new-run');
    const resumeRequested = commandArguments.some((argument) => flagName(argument) === '--resume-run');
    if (startNewRun && resumeRequested) throw new Error('Choose either --new-run or --resume-run, not both.');
    state = await readState();
    let resumingParallelCampaign = false;
    if (startNewRun) {
      state.sceneWorkers = {};
      state.runDirectory = null;
      delete state.scenePath;
      delete state.scenePaths;
      delete state.scenePlanFingerprint;
      state.gluedThroughIteration = 0;
      delete state.lastFilmBuildAt;
      log('Starting an explicit new exhibition Run; previous Run directories are retained.');
    } else {
      resumingParallelCampaign = await inspectSavedSceneWorkers(state.sceneWorkers);
      if (resumingParallelCampaign) {
        for (const worker of Object.values(state.sceneWorkers || {})) {
          if (worker.runDirectory && !worker.iteratorPlanFingerprint) {
            const savedRun = await readJson(join(worker.runDirectory, 'run.json')).catch(() => null);
            if (savedRun?.iteratorPlanFingerprint) worker.iteratorPlanFingerprint = savedRun.iteratorPlanFingerprint;
          }
        }
      }
    }
    const resumeArgument = commandArguments.find((argument) => flagName(argument) === '--resume-run');
    const resumePath = resumeArgument ? argumentValue(commandArguments, '--resume-run', '') : '';
    if (resumeArgument && (!resumePath || resumePath.startsWith('--'))) throw new Error('Use --resume-run=PATH');
    if (resumePath) state.runDirectory = resolve(resumePath);
    const activeWorkerRunDirectory = Object.values(state.sceneWorkers || {})
      .find((worker) => ['running', 'pending_media', 'interrupted'].includes(worker.status) && worker.runDirectory)?.runDirectory;
    const trackedRunDirectory = state.runDirectory || activeWorkerRunDirectory;
    const priorRun = trackedRunDirectory
      ? await readJson(join(trackedRunDirectory, 'run.json')).catch(() => null)
      : null;
    if (resumePath && !priorRun) throw new Error(`Cannot resume: no run.json in ${state.runDirectory}`);
    const priorRunIsIncomplete = priorRun && (Boolean(resumePath) || ['running', 'pending_media'].includes(priorRun.status));
    if (state.runDirectory && !priorRunIsIncomplete) {
      state.runDirectory = null;
      delete state.scenePath;
      delete state.scenePaths;
      delete state.scenePlanFingerprint;
    }
    log(`News directory: ${newsDirectory}; output directory: ${outputDirectory}`);
    if (state.settingsFingerprint !== settingsFingerprint) {
      const savedRun = trackedRunDirectory
        ? await readJson(join(trackedRunDirectory, 'run.json')).catch(() => null)
        : null;
      const resumableRun = savedRun && (Boolean(resumePath) || ['running', 'pending_media'].includes(savedRun.status));
      if (resumableRun) {
        log(`Defaults changed, but run ${state.runDirectory} is incomplete; preserving its saved arguments and run snapshot for resume.`);
      } else {
        if (trackedRunDirectory) log(`Default settings changed; new run will use ${settingsPath} version ${defaultSettings.version}. Existing run files remain intact.`);
        state.runnerArguments = null;
        state.runDirectory = null;
        state.storyModel = null;
        state.settingsSource = null;
        state.exhibitionSettings = null;
      }
    }
    const exhibitionArguments = commandArguments;
    const sceneArgumentValues = [];
    for (let index = 0; index < exhibitionArguments.length; index += 1) {
      if (flagName(exhibitionArguments[index]) !== '--scene') continue;
      const value = exhibitionArguments[index].includes('=')
        ? exhibitionArguments[index].slice('--scene='.length)
        : exhibitionArguments[++index];
      if (!value || value.startsWith('--')) throw new Error('Use --scene=PATH; repeat --scene=PATH to schedule several scene files');
      sceneArgumentValues.push(value);
    }
    const scenePaths = sceneArgumentValues.map((scenePath) => resolve(scenePath));
    const hasSceneArgument = scenePaths.length > 0;
    const generationIntervalArgument = exhibitionArguments.findLast((argument) => flagName(argument) === '--generation-interval');
    if (generationIntervalArgument && !hasSceneArgument) {
      throw new Error('--generation-interval requires --scene=PATH');
    }
    const generationInterval = generationIntervalArgument
      ? generationIntervalArgument.includes('=')
        ? generationIntervalArgument.slice('--generation-interval='.length)
        : exhibitionArguments[exhibitionArguments.indexOf(generationIntervalArgument) + 1]
      : undefined;
    if (generationIntervalArgument) {
      if (!generationInterval || generationInterval.startsWith('--')) throw new Error('Use --generation-interval=1h');
    }
    const loadedSceneSequences = scenePaths.length
      ? await Promise.all(scenePaths.map((scenePath) => loadSceneSequence(scenePath, defaultGeneration, {
        scheduleEnabled: Boolean(generationIntervalArgument),
        generationInterval,
      })))
      : null;
    if (loadedSceneSequences?.length > 1) {
      const firstSequence = loadedSceneSequences[0];
      for (const sequence of loadedSceneSequences.slice(1)) {
        if (sequence.scheduleEnabled !== firstSequence.scheduleEnabled
          || sequence.intervalMs !== firstSequence.intervalMs
          || sequence.biasMode !== firstSequence.biasMode) {
          throw new Error('Scheduled scene files must use the same interval and bias mode; set --generation-interval=... to share one interval.');
        }
      }
    }
    const sceneSequence = loadedSceneSequences?.length ? {
      path: scenePaths.length === 1 ? scenePaths[0] : scenePaths.join(' | '),
      paths: scenePaths,
      scheduleEnabled: loadedSceneSequences[0].scheduleEnabled,
      generationInterval: loadedSceneSequences[0].generationInterval,
      intervalMs: loadedSceneSequences[0].intervalMs,
      biasMode: loadedSceneSequences[0].biasMode,
      iterators: loadedSceneSequences.flatMap((sequence, sequenceIndex) => sequence.iterators.map((iterator) => ({
        ...iterator,
        name: loadedSceneSequences.length === 1 ? iterator.name : `${basename(scenePaths[sequenceIndex])} · ${iterator.name}`,
      }))),
    } : null;
    const activeScenePaths = resumingParallelCampaign ? state.scenePaths || [] : (state.scenePath ? [state.scenePath] : []);
    const hasActiveSceneWorkers = resumingParallelCampaign;
    const hasActiveSceneSequence = Boolean(state.runDirectory || hasActiveSceneWorkers);
    if (hasActiveSceneSequence && activeScenePaths.length && !sceneSequence) {
      throw new Error(`Resume the active scene sequence with ${activeScenePaths.map((scenePath) => `--scene=${scenePath}`).join(' ')}`);
    }
    if (hasActiveSceneSequence && activeScenePaths.length
      && JSON.stringify(sceneSequence?.paths || [sceneSequence?.path]) !== JSON.stringify(activeScenePaths)) {
      throw new Error(`Active scene sequence uses ${activeScenePaths.join(', ')}; resume with the same --scene files before selecting another sequence`);
    }
    const parallelSceneMode = Boolean(sceneSequence && sceneSequence.iterators.length > 1);
    if (parallelSceneMode) {
      const schedules = loadedSceneSequences.map((sequence) => resolveParallelSceneSchedule({
        requestedInterval: generationIntervalArgument ? generationInterval : undefined,
        configuredInterval: sequence.configuredGenerationInterval,
        configuredBiasMode: sequence.configuredBiasMode,
      }));
      if (schedules.some((schedule) => JSON.stringify(schedule) !== JSON.stringify(schedules[0]))) {
        throw new Error('Parallel Scene files must use the same generation interval and bias mode.');
      }
      Object.assign(sceneSequence, schedules[0]);
    }
    if (parallelSceneMode && state.runDirectory && priorRunIsIncomplete) {
      throw new Error('An active sequential scene run cannot be resumed as parallel workers; preserve it and start parallel workers in a new output directory.');
    }
    const stopAfterArgument = exhibitionArguments.find((argument) => flagName(argument) === '--stop-after-iterations');
    let stopAfterIterations = null;
    if (stopAfterArgument) {
      const value = stopAfterArgument.includes('=')
        ? stopAfterArgument.slice('--stop-after-iterations='.length)
        : exhibitionArguments[exhibitionArguments.indexOf(stopAfterArgument) + 1];
      stopAfterIterations = Number(value);
      if (!Number.isSafeInteger(stopAfterIterations) || stopAfterIterations < 1) {
        throw new Error('--stop-after-iterations must be a positive integer');
      }
    }
    if (exhibitionArguments.includes('--first-last-glue') && exhibitionArguments.includes('--no-first-last-glue')) {
      throw new Error('Choose either --first-last-glue or --no-first-last-glue');
    }
    if (exhibitionArguments.includes('--auto-mode') && exhibitionArguments.includes('--no-auto-mode')) {
      throw new Error('Choose either --auto-mode or --no-auto-mode');
    }
    if (exhibitionArguments.includes('--first-last-glue')) glueEnabled = true;
    if (exhibitionArguments.includes('--no-first-last-glue')) glueEnabled = false;
    if (!exhibitionArguments.includes('--first-last-glue') && !exhibitionArguments.includes('--no-first-last-glue')
      && process.env.EXHIBITION_FIRST_LAST_GLUE === undefined && state.exhibitionSettings) {
      glueEnabled = state.exhibitionSettings.glueEnabled;
    }
    if (state.exhibitionSettings) {
      if (process.env.EXHIBITION_GLUE_DURATION_PATTERN === undefined) gluePattern = state.exhibitionSettings.gluePattern;
      if (process.env.EXHIBITION_GLUE_WAIT_PATTERN === undefined) glueWaitPattern = state.exhibitionSettings.glueWaitPattern || glueWaitPattern;
      if (process.env.EXHIBITION_FRAME_OFFSET_SECONDS === undefined) glueFrameOffset = state.exhibitionSettings.glueFrameOffset;
      if (process.env.EXHIBITION_FADE_SECONDS === undefined) fadeSeconds = state.exhibitionSettings.fadeSeconds;
      if (process.env.EXHIBITION_RANDOM_BRIDGE_THRESHOLD === undefined) randomThreshold = state.exhibitionSettings.randomThreshold;
    }
    const requestedTransitionWaitPattern = argumentValue(exhibitionArguments, '--transition-wait-pattern', undefined);
    if (requestedTransitionWaitPattern !== undefined) glueWaitPattern = requestedTransitionWaitPattern;
    if (!(randomThreshold >= 0 && randomThreshold < 1)) throw new Error('EXHIBITION_RANDOM_BRIDGE_THRESHOLD must be from 0 to below 1');
    const glueDurations = gluePattern.split(',').map((value) => Number(value.trim()));
    if (!glueDurations.length || glueDurations.some((value) => !Number.isInteger(value) || value < 5 || value > 15)) {
      throw new Error('EXHIBITION_GLUE_DURATION_PATTERN must contain integer seconds from 5 through 15');
    }
    const frameOffset = Number(glueFrameOffset);
    if (!Number.isFinite(frameOffset) || frameOffset <= 0 || frameOffset > 1) throw new Error('EXHIBITION_FRAME_OFFSET_SECONDS must be greater than 0 and no more than 1');
    const fadeLength = Number(fadeSeconds);
    if (!Number.isFinite(fadeLength) || fadeLength < 0 || fadeLength > 2) throw new Error('EXHIBITION_FADE_SECONDS must be from 0 through 2');
    const userArguments = [];
    for (let index = 0; index < exhibitionArguments.length; index += 1) {
      const argument = exhibitionArguments[index];
      if (['--first-last-glue', '--no-first-last-glue', '--stop-after-iterations', '--transition-wait-pattern', '--scene', '--generation-interval', '--resume-run', '--new-run'].includes(flagName(argument))) {
        if (['--stop-after-iterations', '--transition-wait-pattern', '--scene', '--generation-interval', '--resume-run'].includes(flagName(argument)) && !argument.includes('=')) index += 1;
        continue;
      }
      userArguments.push(argument);
    }
    let defaults;
    if (sceneSequence) {
      defaults = defaultsFromExhibitionSettings(sceneSequence.iterators[0].generation);
    } else if (state.runnerArguments?.length) {
      defaults = { args: state.runnerArguments, storyModel: state.storyModel, source: state.settingsSource || null };
    } else {
      defaults = defaultsFromExhibitionSettings();
      state.runnerArguments = defaults.args;
      state.storyModel = defaults.storyModel;
      state.settingsSource = defaults.source;
    }
    const requestedStoryModel = argumentValue(
      userArguments,
      '--story-model',
      process.env.NEWS_STORY_MODEL?.trim() || '',
    ).trim();
    if (requestedStoryModel) defaults = { ...defaults, storyModel: requestedStoryModel };
    if (!parallelSceneMode && stopAfterIterations === null && !userArguments.some((argument) => flagName(argument) === '--iterations')) {
      const configuredIterations = Number(argumentValue(defaults.args, '--iterations', '-1'));
      if (Number.isSafeInteger(configuredIterations) && configuredIterations > 0) {
        stopAfterIterations = configuredIterations;
      }
    }
    if (stopAfterIterations !== null) {
      for (let index = userArguments.length - 1; index >= 0; index -= 1) {
        if (flagName(userArguments[index]) === '--iterations') userArguments.splice(index, 1);
      }
      userArguments.push(`--iterations=${stopAfterIterations}`);
    }
    const configuredAutoMode = defaults.args.includes('--no-auto-mode') ? false
      : defaults.args.includes('--auto-mode') ? true : defaultGeneration.autoMode === true;
    const autoModeEnabled = resolveAutoModeSetting(configuredAutoMode, exhibitionArguments);
    const iteratorPlans = sceneSequence
      ? sceneSequence.iterators.map((iterator) => {
        const iteratorDefaults = defaultsFromExhibitionSettings(iterator.generation);
        let iteratorArguments = mergeRunnerArguments(iteratorDefaults.args, userArguments, { stopAfterIterations, newsDirectory, outputDirectory });
        if (sceneSequence.iterators.length > 1) {
          if (iteratorArguments.some((argument) => flagName(argument) === '--article-id')) {
            throw new Error('Scheduled scene files cannot pin --article-id; global article order prevents repeats.');
          }
          iteratorArguments = iteratorArguments.filter((argument) => flagName(argument) !== '--article-order');
          iteratorArguments.push('--article-order=global');
        }
        return { name: iterator.name, arguments: iteratorArguments };
      })
      : null;
    const runnerArguments = iteratorPlans?.[0].arguments
      || mergeRunnerArguments(defaults.args, userArguments, { stopAfterIterations, newsDirectory, outputDirectory });
    const normalizedRunnerArguments = runnerArguments.filter((argument) => !['--auto-mode', '--no-auto-mode'].includes(flagName(argument)));
    if (autoModeEnabled) normalizedRunnerArguments.push('--auto-mode');
    else if (defaultGeneration.autoMode === true || defaults.args.includes('--no-auto-mode')
      || exhibitionArguments.includes('--no-auto-mode')) normalizedRunnerArguments.push('--no-auto-mode');
    let iteratorPlanPath = null;
    let parallelWorkers = null;
    if (iteratorPlans) {
      iteratorPlanPath = join(outputDirectory, '.exhibition-iterator-plan.json');
      const iteratorPlan = {
        scenePath: sceneSequence.path,
        scheduleEnabled: sceneSequence.scheduleEnabled,
        generationInterval: sceneSequence.generationInterval,
        intervalMs: sceneSequence.intervalMs,
        biasMode: sceneSequence.biasMode,
        scheduleIterationCount: stopAfterIterations || sceneSequence.iterators.length,
        iterators: iteratorPlans,
      };
      if (parallelSceneMode) {
        if (!resumingParallelCampaign) {
          for (const workerState of Object.values(state.sceneWorkers || {})) {
            if (workerState.runDirectory && workerState.status === 'completed') {
              workerState.lastCompletedRunDirectory = workerState.runDirectory;
              workerState.runDirectory = null;
              delete workerState.gluedThroughIteration;
              delete workerState.lastFilmBuildAt;
            }
          }
        }
        const configuredWorkers = iteratorPlans.map((iterator, index) => {
          const generation = sceneSequence.iterators[index].generation;
          const ratePerHour = Number(generation.iterations);
          if (!Number.isSafeInteger(ratePerHour) || ratePerHour < 1) {
            throw new Error(`Scene ${iterator.name} requires a positive integer generation.iterations rate per hour`);
          }
          const intervalMs = sceneSequence.scheduleEnabled ? sceneSequence.intervalMs / ratePerHour : null;
          if (sceneSequence.scheduleEnabled && (!Number.isSafeInteger(intervalMs) || intervalMs < 1)) {
            throw new Error(`Scene ${iterator.name} rate does not divide its generation interval into whole milliseconds`);
          }
          const key = `${String(index + 1).padStart(2, '0')}-${iterator.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
          const planPath = join(outputDirectory, `.exhibition-iterator-plan-${key}.json`);
          const workerPlan = {
            workerKey: key,
            scenePath: sceneSequence.path,
            scheduleEnabled: sceneSequence.scheduleEnabled,
            generationInterval: sceneSequence.scheduleEnabled ? `${sceneSequence.generationInterval}/${ratePerHour}` : null,
            intervalMs,
            biasMode: sceneSequence.scheduleEnabled ? sceneSequence.biasMode : null,
            iterators: [iterator],
          };
          const workerArguments = iterator.arguments.filter((argument) =>
            !['--iterations', '--article-order'].includes(flagName(argument)));
          workerArguments.push('--article-order=global', `--iterations=${stopAfterIterations ?? 0}`, `--iterator-plan=${planPath}`);
          const savedWorker = state.sceneWorkers?.[key];
          const savedRunDirectory = resumingParallelCampaign && savedWorker?.runDirectory
            && ['running', 'pending_media', 'interrupted'].includes(savedWorker.status)
            ? savedWorker.runDirectory
            : null;
          const completedRunDirectory = resumingParallelCampaign && savedWorker?.status === 'completed'
            ? savedWorker.runDirectory
            : null;
          const expectedRunFingerprint = createHash('sha256').update(JSON.stringify(workerPlan)).digest('hex');
          if (resumingParallelCampaign && !savedWorker) {
            throw new Error(`Active parallel exhibition is missing worker ${key}; refusing to create a replacement worker during resume.`);
          }
          if ((savedRunDirectory || completedRunDirectory)
            && savedWorker.iteratorPlanFingerprint !== expectedRunFingerprint) {
            throw new Error(`Worker ${key} settings changed since its saved Run; resume requires its original Scene configuration.`);
          }
          const videoSettings = {
            model: argumentValue(iterator.arguments, '--video-model', defaultGeneration.videoModel),
            resolution: argumentValue(iterator.arguments, '--video-resolution', defaultGeneration.videoResolution),
            settingsMode: argumentValue(iterator.arguments, '--video-settings-mode', defaultGeneration.videoSettingsMode),
          };
          return {
            key,
            name: iterator.name,
            ratePerHour,
            planPath,
            plan: workerPlan,
            arguments: workerArguments,
            savedRunDirectory,
            completedRunDirectory,
            videoSettings,
            generateTitleCards: iterator.arguments.includes('--generate-title-cards')
              && !iterator.arguments.includes('--no-generate-title-cards'),
          };
        });
        const workerPlanSnapshot = {
          scenePath: sceneSequence.path,
          scheduleEnabled: sceneSequence.scheduleEnabled,
          generationInterval: sceneSequence.generationInterval,
          biasMode: sceneSequence.biasMode,
          workers: configuredWorkers.map(({ key, name, ratePerHour, plan }) => ({ key, name, ratePerHour, plan })),
        };
        const workerPlanFingerprint = createHash('sha256').update(JSON.stringify(workerPlanSnapshot)).digest('hex');
        if (hasActiveSceneWorkers && state.scenePlanFingerprint !== workerPlanFingerprint) {
          throw new Error('Parallel scene settings changed; resume requires the original worker plans.');
        }
        await saveJson(iteratorPlanPath, workerPlanSnapshot);
        for (const worker of configuredWorkers) {
          await saveJson(worker.planPath, worker.plan);
          state.sceneWorkers ||= {};
          state.sceneWorkers[worker.key] ||= {};
          Object.assign(state.sceneWorkers[worker.key], {
            name: worker.name,
            ratePerHour: worker.ratePerHour,
            planPath: worker.planPath,
            ...(worker.savedRunDirectory ? { runDirectory: worker.savedRunDirectory } : {}),
            ...(worker.completedRunDirectory ? { runDirectory: worker.completedRunDirectory, status: 'completed' } : {}),
            ...(!worker.savedRunDirectory && !worker.completedRunDirectory ? { status: 'starting', runDirectory: null } : {}),
          });
        }
        state.scenePlanFingerprint = workerPlanFingerprint;
        parallelWorkers = configuredWorkers;
      } else {
        if (priorRunIsIncomplete && state.runDirectory && priorRun?.iteratorPlanFingerprint) {
          const savedPlan = await readJson(iteratorPlanPath);
          const comparable = (plan) => {
            const { scheduleIterationCount, ...stablePlan } = plan;
            return {
              ...stablePlan,
              iterators: plan.iterators.map((iterator) => ({
                ...iterator,
                arguments: iterator.arguments.filter((argument) => !['--iterations', '--article-order'].includes(flagName(argument))),
              })),
            };
          };
          if (JSON.stringify(comparable(savedPlan)) !== JSON.stringify(comparable(iteratorPlan))) {
            throw new Error('Scene settings changed; resume requires the original scene plan.');
          }
          const savedFingerprint = createHash('sha256').update(JSON.stringify(savedPlan)).digest('hex');
          if (savedFingerprint !== priorRun.iteratorPlanFingerprint) throw new Error('Saved scene plan does not match the interrupted run.');
          log('Resuming the saved scene plan; iteration limit and global article order may be changed explicitly.');
        } else {
          await saveJson(iteratorPlanPath, iteratorPlan);
        }
        normalizedRunnerArguments.push(`--iterator-plan=${iteratorPlanPath}`);
      }
      state.scenePath = sceneSequence.path;
      state.scenePaths = scenePaths;
    } else {
      delete state.scenePath;
      delete state.scenePaths;
      delete state.scenePlanFingerprint;
    }
    const videoSettings = {
      model: argumentValue(runnerArguments, '--video-model', defaultGeneration.videoModel),
      resolution: argumentValue(runnerArguments, '--video-resolution', defaultGeneration.videoResolution),
      settingsMode: argumentValue(runnerArguments, '--video-settings-mode', defaultGeneration.videoSettingsMode),
    };
    log(`Settings source: ${defaults.source || 'exhibition defaults'}`);
    log(`Settings snapshot: ${JSON.stringify({
      storyModel: defaults.storyModel,
      sceneCount: {
        mode: argumentValue(runnerArguments, '--scene-count-mode', 'fixed'),
        takt: argumentValue(runnerArguments, '--scene-count-takt', '2'),
        meter: `${argumentValue(runnerArguments, '--scene-count-numerator', '3')}/${argumentValue(runnerArguments, '--scene-count-denominator', '4')}`,
        type: argumentValue(runnerArguments, '--scene-count-type', 'balanced'),
        bias: argumentValue(runnerArguments, '--scene-count-bias', '2'),
        fixedCount: argumentValue(runnerArguments, '--scenes', null),
      },
      articleOrder: argumentValue(runnerArguments, '--article-order', 'linear'),
      sceneVideo: { enabled: runnerArguments.includes('--videos-after-each-iteration'), ...videoSettings },
      visualControlMode: runnerArguments.includes('--legacy-guernica-style-reference-prompt')
        && !runnerArguments.includes('--no-style-reference')
        && !runnerArguments.includes('--article-image-only-reference')
        && !runnerArguments.includes('--guernica-location-reference')
        ? 'fixed'
        : runnerArguments.includes('--scene-visual-controls') ? 'scene-specific' : 'fixed',
      generateTitleCards: runnerArguments.includes('--generate-title-cards'),
      firstLastGlue: glueEnabled,
      gluePattern,
      glueWaitPattern,
      frameOffsetSeconds: glueFrameOffset,
      fadeSeconds,
      randomBridgeThreshold: randomThreshold,
    })}`);
    state.runnerArguments = runnerArguments
      .filter((argument) => flagName(argument) !== '--resume-run')
      .map((argument) => stopAfterIterations !== null && flagName(argument) === '--iterations' ? '--iterations=-1' : argument);
    for (let index = state.runnerArguments.length - 1; index >= 0; index -= 1) {
      if (flagName(state.runnerArguments[index]) === '--auto-mode' || flagName(state.runnerArguments[index]) === '--no-auto-mode') {
        state.runnerArguments.splice(index, 1);
      }
    }
    if (autoModeEnabled) state.runnerArguments.push('--auto-mode');
    else if (defaultGeneration.autoMode === true || defaults.args.includes('--no-auto-mode')
      || exhibitionArguments.includes('--no-auto-mode')) state.runnerArguments.push('--no-auto-mode');
    state.storyModel = defaults.storyModel;
    state.settingsSource = defaults.source;
    state.settingsVersion = defaultSettings.version;
    state.settingsFingerprint = settingsFingerprint;
    state.exhibitionSettings = { glueEnabled, gluePattern, glueWaitPattern, glueFrameOffset, fadeSeconds, randomThreshold };
    state.updatedAt = new Date().toISOString();
    await saveState();
    if (state.storyModel) process.env.NEWS_STORY_MODEL = state.storyModel;

    let runDirectory = state.runDirectory ? resolve(state.runDirectory) : null;
    if (!runDirectory || !(await stat(join(runDirectory, 'run.json')).catch(() => null))) runDirectory = null;
    if (stopAfterIterations !== null && !runDirectory) {
      state.runDirectory = null;
      state.gluedThroughIteration = 0;
      delete state.lastFilmBuildAt;
      await saveState();
    }

    if (!await rankedCollectionAvailable()) {
      log('Noch kein Jev-Ranking vorhanden; initialer News-Refresh läuft vor der ersten Iteration.');
      await refreshNewsIfNeeded();
    }
    if (!await rankedCollectionAvailable()) throw new Error(`No Jev-ranked collection in ${newsDirectory}`);

    if (parallelWorkers) {
      log(`Starting ${parallelWorkers.length} independent scene workers in parallel${sceneSequence.scheduleEnabled ? `; protected window ${sceneSequence.generationInterval}, bias ${sceneSequence.biasMode}` : '; explicitly unthrottled by generationInterval=-1'}.`);
      if (stopAfterIterations !== null) {
        log(`--stop-after-iterations=${stopAfterIterations} applies per worker; maximum total is ${stopAfterIterations * parallelWorkers.length} iterations.`);
      }
      for (const worker of parallelWorkers) {
        log(`${worker.name}: ${worker.ratePerHour} iteration(s)/hour${sceneSequence.scheduleEnabled ? `; minimum start interval ${(worker.plan.intervalMs / 60_000).toFixed(2)} min` : '; rate limit disabled by explicit configuration'}.`);
      }
      await runParallelSceneWorkers(parallelWorkers, stopAfterIterations);
      return;
    }

    const refreshTask = runRefreshLoop();
    const generateTitleCards = runnerArguments.includes('--generate-title-cards');
    let mergeTask = runDirectory ? runMergeLoop(runDirectory, videoSettings, generateTitleCards) : null;
    while (!stopping) {
      const running = startRunner(normalizedRunnerArguments, runDirectory, (reportedRunDirectory) => {
        runDirectory = resolve(reportedRunDirectory);
        if (!mergeTask) mergeTask = runMergeLoop(runDirectory, videoSettings, generateTitleCards);
      });
      const result = await running.closed;
      if (state.runDirectory) runDirectory = resolve(state.runDirectory);
      if (stopping) break;
      if (stopAfterIterations !== null && result.code === 0) {
        const savedRun = runDirectory ? await readJson(join(runDirectory, 'run.json')).catch(() => null) : null;
        if (savedRun?.status === 'pending_media') {
          stopping = true;
          wakeForStop();
          log(`Run paused with pending media (${(savedRun.pendingMedia || []).length} iteration(s)); restart runner to poll saved provider task IDs.`);
        } else {
          if (glueEnabled && runDirectory) {
            log(`Iteration limit ${stopAfterIterations} reached; waiting for First-Last glue and final films.`);
            while (!stopping) {
              const latestState = await readState();
              if (resolve(latestState.runDirectory || '') === runDirectory
                && Number(latestState.gluedThroughIteration || 0) >= stopAfterIterations) break;
              await delayOrStop(mergeCheckMs);
            }
          }
          if (!stopping) {
            stopping = true;
            wakeForStop();
            log(`Finite exhibition complete after ${stopAfterIterations} iterations; no next iteration started.`);
            for (const child of children) child.kill('SIGTERM');
          }
        }
        break;
      }
      if (result.globalArticleQueueExhausted) {
        log(`All eligible articles used; keep scene schedule paused until news refresh. Check again in ${refreshCheckMs} ms.`);
        await delayOrStop(refreshCheckMs);
      } else {
        log(`Image runner exited (${result.signal || `code ${result.code}`}); resume same run in 30 s.`);
        await delayOrStop(30_000);
      }
    }
    await Promise.allSettled([refreshTask, mergeTask].filter(Boolean));
  });
}

exhibitionMain().catch((error) => {
  console.error(`[exhibition] ${error.stack || error.message}`);
  process.exitCode = 1;
});
