import { createHash, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdir, open, readFile, readdir, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';
import { findRankedNewsCollections } from '../news-scene/news-ranking.mjs';
import { renderRunReport } from '../news-scene/report.mjs';
import { resolveAutoModeSetting } from '../news-scene/auto-director.mjs';
import { loadSceneSequence } from '../news-scene/scene-sequence.mjs';

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

async function saveJson(path, value) {
  const temporaryPath = `${path}.${randomUUID()}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await rename(temporaryPath, path);
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

function flagName(argument) {
  return argument.startsWith('--') ? argument.split('=', 1)[0] : null;
}

function addDefault(argumentsList, userArguments, flag, value = null) {
  if ([...argumentsList, ...userArguments].some((argument) => flagName(argument) === flag)) return;
  if (value === null) argumentsList.push(flag);
  else argumentsList.push(`${flag}=${value}`);
}

function defaultsFromExhibitionSettings(generation = defaultGeneration) {
  const { sceneCount, sceneLength, visualControls } = generation;
  const defaults = [
    `--story-model=${generation.storyModel}`,
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

  return {
    args: defaults,
    storyModel: generation.storyModel,
    source: `${settingsPath} (version ${defaultSettings.version})`,
  };
}

function mergeRunnerArguments(defaults, userArguments, stopAfterIterations = null) {
  const merged = [];
  const oppositeFlags = new Map([
    ['--auto-mode', '--no-auto-mode'], ['--no-auto-mode', '--auto-mode'],
    ['--symbolic', '--no-symbolic'], ['--no-symbolic', '--symbolic'],
    ['--room-deepness', '--no-room-deepness'], ['--no-room-deepness', '--room-deepness'],
    ['--scene-visual-controls', '--fixed-visual-controls'], ['--fixed-visual-controls', '--scene-visual-controls'],
    ['--style-reference', '--no-style-reference'], ['--no-style-reference', '--style-reference'],
    ['--use-style-reference', '--no-style-reference'], ['--no-style-reference', '--use-style-reference'],
    ['--use-guernica-figure-reference', '--no-guernica-figure-reference'], ['--no-guernica-figure-reference', '--use-guernica-figure-reference'],
    ['--preserve-cubist-video-style', '--no-preserve-cubist-video-style'], ['--no-preserve-cubist-video-style', '--preserve-cubist-video-style'],
    ['--videos-after-each-iteration', '--no-videos-after-each-iteration'], ['--no-videos-after-each-iteration', '--videos-after-each-iteration'],
    ['--generate-title-cards', '--no-generate-title-cards'], ['--no-generate-title-cards', '--generate-title-cards'],
    ['--guernica-location-reference', '--no-guernica-location-reference'], ['--no-guernica-location-reference', '--guernica-location-reference'],
    ['--article-image-reference', '--no-article-image-reference'], ['--no-article-image-reference', '--article-image-reference'],
    ['--landscape-prompt', '--no-landscape-prompt'], ['--no-landscape-prompt', '--landscape-prompt'],
    ['--legacy-guernica-style-reference-prompt', '--no-legacy-guernica-style-reference-prompt'], ['--no-legacy-guernica-style-reference-prompt', '--legacy-guernica-style-reference-prompt'],
    ['--no-dialogue-narration', '--allow-dialogue-narration'], ['--allow-dialogue-narration', '--no-dialogue-narration'],
  ]);
  const suppliedFlags = new Set(userArguments.map(flagName));
  for (let index = 0; index < defaults.length; index += 1) {
    const argument = defaults[index];
    const flag = flagName(argument);
    if (flag && (suppliedFlags.has(flag) || suppliedFlags.has(oppositeFlags.get(flag)))) continue;
    merged.push(argument);
  }
  const suppliedIterations = userArguments.find((argument) => flagName(argument) === '--iterations');
  if (suppliedIterations) {
    const value = suppliedIterations.includes('=') ? suppliedIterations.split('=').at(-1) : userArguments[userArguments.indexOf(suppliedIterations) + 1];
    if (!['0', '-1'].includes(value)) {
      const finiteCount = Number(value);
      if (!Number.isSafeInteger(finiteCount) || finiteCount < 1 || finiteCount !== stopAfterIterations) {
        throw new Error('Use --stop-after-iterations=N for a finite exhibition run');
      }
    }
  }
  addDefault(merged, userArguments, '--iterations', '-1');
  addDefault(merged, userArguments, '--pause-ms', '0');
  addDefault(merged, userArguments, '--article-order', 'linear');
  addDefault(merged, userArguments, '--news-dir', newsDirectory);
  addDefault(merged, userArguments, '--output-dir', outputDirectory);
  return [...merged, ...userArguments];
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

async function getReadyIterations(runDirectory) {
  let manifest;
  try { manifest = await readJson(join(runDirectory, 'run.json')); } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
  const ready = [];
  for (const entry of manifest.iterations || []) {
    const iterationDirectory = join(runDirectory, entry.directory);
    const record = await readJson(join(iterationDirectory, 'record.json'));
    if (record.status !== 'Abgeschlossen') break;
    const scenes = record.plan?.scenes || [];
    if (scenes.length < 2) break;
    const videos = await Promise.all(scenes.map(async (scene) => {
      try { await stat(join(iterationDirectory, 'media', `scene-${scene.index}-video.mp4`)); return true; }
      catch (error) { if (error.code === 'ENOENT') return false; throw error; }
    }));
    if (videos.some((exists) => !exists)) break;
    ready.push(entry);
  }
  return ready;
}

async function updateFilms(runDirectory, readyIterations, videoSettings, generateTitleCards) {
  if (!glueEnabled || !readyIterations.length) return;
  const glueDirectory = join(runDirectory, 'glue-vids');
  const iterationCount = readyIterations.length;
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
      await runCommand(`Assemble ${entry.directory} (${variant.name})`, process.execPath, [
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
      ]);
      await runCommand(`Normalize ${entry.directory} audio (${variant.name})`, process.execPath, [
        normalizeAudioScript,
        `--input=${intermediatePath}`,
        `--output=${normalizedPath}`,
      ]);
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
  await runCommand('Full exhibition film', process.execPath, [
    ...baseArguments,
    `--output=${join(glueDirectory, 'eu-reski-live-full.mp4')}`,
  ]);
  await runCommand('Sparse random-bridge film', process.execPath, [
    assembleScript,
    `--run-dir=${runDirectory}`,
    `--iteration-film-dir=${join(normalizedIterationDirectory, 'random-bridges')}`,
    `--limit=${iterationCount}`,
    '--no-generate-title-cards',
    `--fade-seconds=${fadeSeconds}`,
    `--output=${join(glueDirectory, 'eu-reski-live-random-bridges.mp4')}`,
  ]);

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

  const state = await readState();
  state.runDirectory = runDirectory;
  state.gluedThroughRunDirectory = runDirectory;
  state.gluedThroughIteration = iterationCount;
  state.lastFilmBuildAt = new Date().toISOString();
  await saveJson(statePath, state);
}

async function runMergeLoop(runDirectory, videoSettings, generateTitleCards) {
  while (!stopping) {
    if (mergeRunning) {
      await delayOrStop(mergeCheckMs);
      continue;
    }
    mergeRunning = true;
    try {
      const ready = await getReadyIterations(runDirectory);
      const state = await readState();
      const gluedThroughIteration = state.gluedThroughRunDirectory === runDirectory
        ? Number(state.gluedThroughIteration || 0)
        : 0;
      if (ready.length > gluedThroughIteration) await updateFilms(runDirectory, ready, videoSettings, generateTitleCards);
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
  let lockHandle;
  try {
    lockHandle = await open(lockPath, 'wx');
  } catch (error) {
    if (error.code === 'EEXIST') {
      const owner = Number((await readFile(lockPath, 'utf8').catch(() => '')).trim());
      let processIsAlive = Number.isInteger(owner) && owner > 0;
      if (processIsAlive) {
        try { process.kill(owner, 0); } catch (ownerError) { if (ownerError.code === 'ESRCH') processIsAlive = false; }
      }
      if (!processIsAlive) {
        await unlink(lockPath).catch(() => {});
        lockHandle = await open(lockPath, 'wx');
      } else throw new Error(`Another exhibition runner (PID ${owner}) owns ${lockPath}`);
    } else {
      throw error;
    }
  }
  await lockHandle.writeFile(`${process.pid}\n`);
  try { await task(); } finally {
    await lockHandle.close();
    const currentLock = await readFile(lockPath, 'utf8').catch(() => '');
    if (currentLock.trim() === String(process.pid)) await unlink(lockPath);
  }
}

function startRunner(argumentsList, runDirectory, onRunDirectory) {
  let resolveClosed;
  let rejectClosed;
  const closed = new Promise((resolveRunner, rejectRunner) => {
    resolveClosed = resolveRunner;
    rejectClosed = rejectRunner;
  });
  try {
    const args = [runnerScript, ...argumentsList];
    if (runDirectory && !args.some((argument) => flagName(argument) === '--resume-run')) args.push(`--resume-run=${runDirectory}`);
    const child = spawn(process.execPath, args, { cwd: repositoryRoot, env: process.env, stdio: ['inherit', 'pipe', 'pipe'] });
    runnerChild = child;
    children.add(child);
    const onLine = (line) => {
      console.log(line);
      const match = /^Run folder: (.+)$/.exec(line);
      if (!match) return;
      state.runDirectory = match[1];
      saveJson(statePath, state).catch((error) => console.error(`[exhibition] Could not save run pointer: ${error.message}`));
      onRunDirectory?.(match[1]);
    };
    const stdoutLines = createInterface({ input: child.stdout, crlfDelay: Infinity });
    const stderrLines = createInterface({ input: child.stderr, crlfDelay: Infinity });
    stdoutLines.on('line', onLine);
    stderrLines.on('line', (line) => console.error(line));
    child.once('error', (error) => {
      children.delete(child);
      runnerChild = null;
      rejectClosed(error);
    });
    child.once('close', (code, signal) => {
      children.delete(child);
      runnerChild = null;
      resolveClosed({ code, signal });
    });
    return { child, closed };
  } catch (error) {
    rejectClosed(error);
    return { child: null, closed };
  }
}

async function exhibitionMain() {
  if (process.argv.includes('--help')) {
    console.log('Start exhibition run. News refreshes every 24 h; Jev ranks EU relevance; linear article order.');
    console.log('Use --stop-after-iterations=N for a finite run; final First-Last glue and film merges finish before exit.');
    console.log('Flags: --no-first-last-glue disables generated bridges; bridges are on by default.');
    console.log('Flags: --auto-mode enables per-iteration artistic direction; --no-auto-mode disables it.');
    console.log('Environment: NEWS_ENV_FILE (in start script), NEWS_REFRESH_INTERVAL_MS.');
    return;
  }
  await withLock(async () => {
    state = await readState();
    const priorRun = state.runDirectory
      ? await readJson(join(state.runDirectory, 'run.json')).catch(() => null)
      : null;
    const priorRunIsIncomplete = priorRun && ['running', 'pending_media'].includes(priorRun.status);
    if (state.runDirectory && !priorRunIsIncomplete) {
      state.runDirectory = null;
      delete state.scenePath;
      delete state.scenePlanFingerprint;
    }
    log(`News directory: ${newsDirectory}; output directory: ${outputDirectory}`);
    if (state.settingsFingerprint !== settingsFingerprint) {
      const savedRun = state.runDirectory
        ? await readJson(join(state.runDirectory, 'run.json')).catch(() => null)
        : null;
      const resumableRun = savedRun && ['running', 'pending_media'].includes(savedRun.status);
      if (resumableRun) {
        log(`Defaults changed, but run ${state.runDirectory} is incomplete; preserving its saved arguments and run snapshot for resume.`);
      } else {
        if (state.runDirectory) log(`Default settings changed; new run will use ${settingsPath} version ${defaultSettings.version}. Existing run files remain intact.`);
        state.runnerArguments = null;
        state.runDirectory = null;
        state.storyModel = null;
        state.settingsSource = null;
        state.exhibitionSettings = null;
      }
    }
    const exhibitionArguments = process.argv.slice(2);
    const sceneArgument = exhibitionArguments.find((argument) => flagName(argument) === '--scene');
    const sceneArgumentValue = sceneArgument?.includes('=')
      ? sceneArgument.slice('--scene='.length)
      : sceneArgument
        ? exhibitionArguments[exhibitionArguments.indexOf(sceneArgument) + 1]
        : null;
    if (sceneArgument && !sceneArgumentValue) throw new Error('Use --scene=PATH');
    const sceneSequence = sceneArgumentValue
      ? await loadSceneSequence(sceneArgumentValue, defaultGeneration)
      : null;
    if (state.runDirectory && state.scenePath && !sceneSequence) {
      throw new Error(`Resume the active scene sequence with --scene=${state.scenePath}`);
    }
    if (state.runDirectory && state.scenePath && sceneSequence?.path !== state.scenePath) {
      throw new Error(`Active scene sequence uses ${state.scenePath}; finish or resume it before selecting another scene file`);
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
      if (['--first-last-glue', '--no-first-last-glue', '--stop-after-iterations', '--transition-wait-pattern', '--scene'].includes(flagName(argument))) {
        if (['--stop-after-iterations', '--transition-wait-pattern', '--scene'].includes(flagName(argument)) && !argument.includes('=')) index += 1;
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
    if (stopAfterIterations === null && !userArguments.some((argument) => flagName(argument) === '--iterations')) {
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
        const iteratorArguments = mergeRunnerArguments(iteratorDefaults.args, userArguments, stopAfterIterations);
        return { path: iterator.path, arguments: iteratorArguments };
      })
      : null;
    const runnerArguments = iteratorPlans?.[0].arguments
      || mergeRunnerArguments(defaults.args, userArguments, stopAfterIterations);
    const normalizedRunnerArguments = runnerArguments.filter((argument) => !['--auto-mode', '--no-auto-mode'].includes(flagName(argument)));
    if (autoModeEnabled) normalizedRunnerArguments.push('--auto-mode');
    else if (defaultGeneration.autoMode === true || defaults.args.includes('--no-auto-mode')
      || exhibitionArguments.includes('--no-auto-mode')) normalizedRunnerArguments.push('--no-auto-mode');
    let iteratorPlanPath = null;
    if (iteratorPlans) {
      iteratorPlanPath = join(outputDirectory, '.exhibition-iterator-plan.json');
      const iteratorPlan = {
        scenePath: sceneSequence.path,
        generationInterval: sceneSequence.generationInterval,
        intervalMs: sceneSequence.intervalMs,
        biasMode: sceneSequence.biasMode,
        iterators: iteratorPlans,
      };
      await saveJson(iteratorPlanPath, iteratorPlan);
      state.scenePath = sceneSequence.path;
      state.scenePlanFingerprint = createHash('sha256').update(JSON.stringify(iteratorPlan)).digest('hex');
      normalizedRunnerArguments.push(`--iterator-plan=${iteratorPlanPath}`);
    } else {
      delete state.scenePath;
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
    await saveJson(statePath, state);
    if (state.storyModel) process.env.NEWS_STORY_MODEL = state.storyModel;

    let runDirectory = stopAfterIterations === null && state.runDirectory ? resolve(state.runDirectory) : null;
    if (!runDirectory || !(await stat(join(runDirectory, 'run.json')).catch(() => null))) runDirectory = null;
    if (stopAfterIterations !== null) {
      state.runDirectory = null;
      state.gluedThroughIteration = 0;
      delete state.lastFilmBuildAt;
      await saveJson(statePath, state);
    }

    if (!await rankedCollectionAvailable()) {
      log('Noch kein Jev-Ranking vorhanden; initialer News-Refresh läuft vor der ersten Iteration.');
      await refreshNewsIfNeeded();
    }
    if (!await rankedCollectionAvailable()) throw new Error(`No Jev-ranked collection in ${newsDirectory}`);

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
      log(`Image runner exited (${result.signal || `code ${result.code}`}); resume same run in 30 s.`);
      await delayOrStop(30_000);
    }
    await Promise.allSettled([refreshTask, mergeTask].filter(Boolean));
  });
}

exhibitionMain().catch((error) => {
  console.error(`[exhibition] ${error.stack || error.message}`);
  process.exitCode = 1;
});
