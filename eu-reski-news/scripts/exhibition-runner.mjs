import { createHash, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdir, open, readFile, readdir, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';
import { findRankedNewsCollections } from '../news-scene/news-ranking.mjs';

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

function defaultsFromExhibitionSettings() {
  const { sceneCount, sceneLength, visualControls } = defaultGeneration;
  const defaults = [
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
    `--image-provider=${defaultGeneration.imageProvider}`,
    `--video-model=${defaultGeneration.videoModel}`,
    `--video-resolution=${defaultGeneration.videoResolution}`,
    `--video-settings-mode=${defaultGeneration.videoSettingsMode}`,
    `--video-mode=${defaultGeneration.videoMode}`,
    `--video-direction=${defaultGeneration.videoDirection}`,
    `--story-clou=${defaultGeneration.storyClou}`,
    `--video-vision=${defaultGeneration.videoVision}`,
    `--video-audio-direction=${defaultGeneration.videoAudioDirection}`,
    `--video-max-zoom=${defaultGeneration.videoMaxZoom}`,
    `--layering=${visualControls.layering}`,
    `--iterations=${defaultGeneration.iterations}`,
    `--pause-ms=${defaultGeneration.pauseMs}`,
    `--article-order=${defaultGeneration.articleOrder}`,
  ];
  defaults.push(visualControls.symbolic ? '--symbolic' : '--no-symbolic');
  defaults.push(visualControls.roomDeepness ? '--room-deepness' : '--no-room-deepness');
  defaults.push(visualControls.mode === 'scene-specific' ? '--scene-visual-controls' : '--fixed-visual-controls');
  defaults.push(defaultGeneration.articleImageReference ? '--article-image-reference' : '--no-article-image-reference');
  if (defaultGeneration.styleReference === false) defaults.push('--no-style-reference');
  defaults.push(defaultGeneration.guernicaLocationReference ? '--guernica-location-reference' : '--no-guernica-location-reference');
  defaults.push(defaultGeneration.landscapePrompt ? '--landscape-prompt' : '--no-landscape-prompt');
  defaults.push(defaultGeneration.preserveCubistVideoStyle ? '--preserve-cubist-video-style' : '--no-preserve-cubist-video-style');
  if (defaultGeneration.videosAfterEachIteration) defaults.push('--videos-after-each-iteration');
  if (defaultGeneration['generate-title-cards']) defaults.push('--generate-title-cards');

  return {
    args: defaults,
    storyModel: defaultGeneration.storyModel,
    source: `${settingsPath} (version ${defaultSettings.version})`,
  };
}

function mergeRunnerArguments(defaults, userArguments) {
  const merged = [];
  const oppositeFlags = new Map([
    ['--symbolic', '--no-symbolic'], ['--no-symbolic', '--symbolic'],
    ['--room-deepness', '--no-room-deepness'], ['--no-room-deepness', '--room-deepness'],
    ['--scene-visual-controls', '--fixed-visual-controls'], ['--fixed-visual-controls', '--scene-visual-controls'],
    ['--style-reference', '--no-style-reference'], ['--no-style-reference', '--style-reference'],
    ['--generate-title-cards', '--no-generate-title-cards'], ['--no-generate-title-cards', '--generate-title-cards'],
    ['--guernica-location-reference', '--no-guernica-location-reference'], ['--no-guernica-location-reference', '--guernica-location-reference'],
    ['--article-image-reference', '--no-article-image-reference'], ['--no-article-image-reference', '--article-image-reference'],
    ['--landscape-prompt', '--no-landscape-prompt'], ['--no-landscape-prompt', '--landscape-prompt'],
    ['--preserve-cubist-video-style', '--no-preserve-cubist-video-style'], ['--no-preserve-cubist-video-style', '--preserve-cubist-video-style'],
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
    const iterations = Number(value);
    if (!Number.isInteger(iterations) || iterations < -1) throw new Error('Use --iterations=N for a finite run, --iterations=0 or --iterations=-1 for endless operation');
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

  const baseArguments = [
    assembleScript,
    `--run-dir=${runDirectory}`,
    `--scene-glue-dir=${glueDirectory}`,
    `--limit=${iterationCount}`,
    generateTitleCards ? '--generate-title-cards' : '--no-generate-title-cards',
    `--transition-wait-pattern=${glueWaitPattern}`,
    `--frame-offset-seconds=${glueFrameOffset}`,
    `--fade-seconds=${fadeSeconds}`,
  ];
  await runCommand('Full exhibition film', process.execPath, [
    ...baseArguments,
    `--output=${join(glueDirectory, 'eu-reski-live-full.mp4')}`,
  ]);
  const stableSeed = createHash('sha256').update(runDirectory).digest('hex').slice(0, 16);
  await runCommand('Sparse random-bridge film', process.execPath, [
    ...baseArguments,
    `--bridge-random-threshold=${randomThreshold}`,
    `--bridge-random-seed=${stableSeed}`,
    `--output=${join(glueDirectory, 'eu-reski-live-random-bridges.mp4')}`,
  ]);

  const state = await readState();
  state.runDirectory = runDirectory;
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
      if (ready.length > Number(state.gluedThroughIteration || 0)) await updateFilms(runDirectory, ready, videoSettings, generateTitleCards);
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
    console.log('Start continuous exhibition run. News refreshes every 24 h; Jev ranks EU relevance; linear article order.');
    console.log('Flags: --no-first-last-glue disables generated bridges; bridges are on by default.');
    console.log('Environment: NEWS_ENV_FILE (in start script), NEWS_REFRESH_INTERVAL_MS.');
    return;
  }
  await withLock(async () => {
    state = await readState();
    log(`News directory: ${newsDirectory}; output directory: ${outputDirectory}`);
    if (state.settingsFingerprint !== settingsFingerprint) {
      if (state.runDirectory) log(`Default settings changed; new run will use ${settingsPath} version ${defaultSettings.version}. Existing run files remain intact.`);
      state.runnerArguments = null;
      state.runDirectory = null;
      state.storyModel = null;
      state.settingsSource = null;
      state.exhibitionSettings = null;
    }
    const exhibitionArguments = process.argv.slice(2);
    if (exhibitionArguments.includes('--first-last-glue') && exhibitionArguments.includes('--no-first-last-glue')) {
      throw new Error('Choose either --first-last-glue or --no-first-last-glue');
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
    const userArguments = exhibitionArguments.filter((argument) => !['--first-last-glue', '--no-first-last-glue'].includes(flagName(argument))
      && flagName(argument) !== '--transition-wait-pattern');
    let defaults;
    if (state.runnerArguments?.length) {
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
    const runnerArguments = mergeRunnerArguments(defaults.args, userArguments);
    const iterationLimit = Number(argumentValue(runnerArguments, '--iterations', '-1'));
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
      visualControlMode: runnerArguments.includes('--scene-visual-controls') ? 'scene-specific' : 'fixed',
      generateTitleCards: runnerArguments.includes('--generate-title-cards'),
      firstLastGlue: glueEnabled,
      gluePattern,
      glueWaitPattern,
      frameOffsetSeconds: glueFrameOffset,
      fadeSeconds,
      randomBridgeThreshold: randomThreshold,
    })}`);
    state.runnerArguments = runnerArguments.filter((argument) => flagName(argument) !== '--resume-run');
    state.storyModel = defaults.storyModel;
    state.settingsSource = defaults.source;
    state.settingsVersion = defaultSettings.version;
    state.settingsFingerprint = settingsFingerprint;
    state.exhibitionSettings = { glueEnabled, gluePattern, glueWaitPattern, glueFrameOffset, fadeSeconds, randomThreshold };
    state.updatedAt = new Date().toISOString();
    await saveJson(statePath, state);
    if (state.storyModel) process.env.NEWS_STORY_MODEL = state.storyModel;

    let runDirectory = state.runDirectory && resolve(state.runDirectory);
    if (!runDirectory || !(await stat(join(runDirectory, 'run.json')).catch(() => null))) runDirectory = null;

    if (!await rankedCollectionAvailable()) {
      log('Noch kein Jev-Ranking vorhanden; initialer News-Refresh läuft vor der ersten Iteration.');
      await refreshNewsIfNeeded();
    }
    if (!await rankedCollectionAvailable()) throw new Error(`No Jev-ranked collection in ${newsDirectory}`);

    const refreshTask = runRefreshLoop();
    const generateTitleCards = runnerArguments.includes('--generate-title-cards');
    let mergeTask = runDirectory ? runMergeLoop(runDirectory, videoSettings, generateTitleCards) : null;
    while (!stopping) {
      const running = startRunner(runnerArguments, runDirectory, (reportedRunDirectory) => {
        runDirectory = resolve(reportedRunDirectory);
        if (!mergeTask) mergeTask = runMergeLoop(runDirectory, videoSettings, generateTitleCards);
      });
      const result = await running.closed;
      if (state.runDirectory) runDirectory = resolve(state.runDirectory);
      if (stopping) break;
      if (result.code === 0 && iterationLimit > 0) {
        stopping = true;
        wakeForStop();
        log(`Completed ${iterationLimit} exhibition iterations; stopping after final merge work finishes.`);
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
