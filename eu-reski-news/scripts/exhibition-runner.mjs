import { createHash, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdir, open, readFile, readdir, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';
import { findRankedNewsCollections } from '../news-scene/news-ranking.mjs';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const newsDirectory = resolve(process.env.NEWS_NEWS_DIR || join(repositoryRoot, 'eu-reski-news', 'news', 'A'));
const outputDirectory = resolve(process.env.NEWS_OUTPUT_DIR || join(repositoryRoot, 'eu-reski-news', 'GENERATIONS', 'news', 'exhibition'));
const settingsSearchDirectory = resolve(process.env.NEWS_SETTINGS_SEARCH_DIR || dirname(outputDirectory));
const statePath = join(outputDirectory, 'exhibition-state.json');
const lockPath = join(outputDirectory, '.exhibition-runner.lock');
const refreshIntervalMs = positiveInteger(process.env.NEWS_REFRESH_INTERVAL_MS, 86_400_000);
const refreshCheckMs = positiveInteger(process.env.NEWS_REFRESH_CHECK_MS, 900_000);
const refreshRetryMs = positiveInteger(process.env.NEWS_REFRESH_RETRY_MS, 900_000);
const mergeCheckMs = positiveInteger(process.env.EXHIBITION_MERGE_CHECK_MS, 20_000);
const mergeRetryMs = positiveInteger(process.env.EXHIBITION_MERGE_RETRY_MS, 60_000);
let glueEnabled = process.env.EXHIBITION_FIRST_LAST_GLUE !== '0';
let gluePattern = process.env.EXHIBITION_GLUE_DURATION_PATTERN || '9,5,7,5,8';
let glueFrameOffset = process.env.EXHIBITION_FRAME_OFFSET_SECONDS || '0.25';
let fadeSeconds = process.env.EXHIBITION_FADE_SECONDS || '0.25';
let randomThreshold = Number(process.env.EXHIBITION_RANDOM_BRIDGE_THRESHOLD || '0.7');
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

async function findLatestSettingsRecord(searchDirectory) {
  const excludedRoot = `${outputDirectory}${sep}`;
  const pendingDirectories = [searchDirectory];
  let latest = null;

  while (pendingDirectories.length) {
    const directory = pendingDirectories.pop();
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      if (error.code === 'ENOENT') continue;
      throw error;
    }

    for (const entry of entries) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        if (path === outputDirectory || path.startsWith(excludedRoot) || ['media', 'glue-vids', 'node_modules', '.git'].includes(entry.name)) continue;
        pendingDirectories.push(path);
      } else if (entry.isFile() && entry.name === 'record.json') {
        const fileStats = await stat(path);
        if (!latest || fileStats.mtimeMs > latest.mtimeMs) latest = { path, mtimeMs: fileStats.mtimeMs };
      }
    }
  }

  return latest?.path || null;
}

async function defaultsFromLastRun(recordPath) {
  if (!recordPath) {
    log('Kein voriger record.json gefunden; nutze feste Ausstellungsvorgaben.');
    return {
      args: [
        '--scenes=5', '--scene-count-mode=fixed', '--scene-length-takt=-1', '--scene-length-type=balanced',
        '--scene-length-multiplier=1.15', '--scene-length-bias=3.85', '--min-scene-seconds=5', '--max-scene-seconds=6',
        '--image-provider=runware', '--video-mode=image_to_video', '--video-direction=off', '--story-clou=off',
        '--video-vision=off', '--video-audio-direction=off', '--video-max-zoom=0.08', '--fixed-visual-controls',
        '--symbolic', '--no-room-deepness', '--layering=3',
      ],
      storyModel: 'gpt-4.1-mini',
      source: null,
    };
  }

  const record = await readJson(recordPath);
  const runManifestPath = join(dirname(dirname(recordPath)), 'run.json');
  const runManifest = await readJson(runManifestPath).catch(() => ({}));
  const sceneCountSettings = runManifest.sceneCountSettings || record.sceneCountSelection?.settings || { mode: 'fixed', count: record.sceneCount || 5 };
  const style = runManifest.visualControls?.defaults || record.visualStyleOptions || { symbolic: true, roomDeepness: false, layering: 3 };
  const features = record.featureSettings || {};
  const generation = record.generationSettings || runManifest.generationSettings || {};
  const sceneTiming = generation.sceneTiming || { takt: -1, minimum: 5, maximum: 6 };
  const defaults = [
    `--scene-count-mode=${sceneCountSettings.mode || 'fixed'}`,
    `--scenes=${sceneCountSettings.count || record.sceneCount || 5}`,
    `--scene-count-takt=${sceneCountSettings.takt ?? 2}`,
    `--scene-count-numerator=${sceneCountSettings.numerator ?? 3}`,
    `--scene-count-denominator=${sceneCountSettings.denominator ?? 4}`,
    `--scene-count-type=${sceneCountSettings.type || 'balanced'}`,
    `--scene-count-bias=${sceneCountSettings.bias ?? 2}`,
    `--min-scenes=${sceneCountSettings.minimum ?? 1}`,
    `--max-scenes=${sceneCountSettings.maximum ?? 12}`,
    `--scene-length-takt=${sceneTiming.takt ?? -1}`,
    `--scene-length-type=${sceneTiming.type || 'balanced'}`,
    `--scene-length-multiplier=${sceneTiming.multiplier ?? 1.15}`,
    `--scene-length-bias=${sceneTiming.bias ?? 3.85}`,
    `--min-scene-seconds=${sceneTiming.minimum ?? 5}`,
    `--max-scene-seconds=${sceneTiming.maximum ?? 6}`,
    `--image-provider=${record.imageProvider || 'runware'}`,
    `--story-clou=${features.storyClou || 'off'}`,
    `--video-direction=${features.videoDirection || 'off'}`,
    `--video-mode=${features.videoMode || 'image_to_video'}`,
    `--video-vision=${features.videoVision || 'off'}`,
    `--video-audio-direction=${features.videoAudioDirection || 'off'}`,
    `--video-max-zoom=${features.videoMaxZoom ?? 0.08}`,
    `--layering=${style.layering ?? 3}`,
  ];
  defaults.push(style.symbolic === false ? '--no-symbolic' : '--symbolic');
  defaults.push(style.roomDeepness ? '--room-deepness' : '--no-room-deepness');
  defaults.push(record.sceneVisualControls ? '--scene-visual-controls' : '--fixed-visual-controls');
  if (record.articleImageReference) defaults.push('--article-image-reference', '--no-style-reference');
  else if (!record.styleReference) defaults.push('--no-style-reference');
  if (generation.styleReferencePath) defaults.push(`--style-reference=${generation.styleReferencePath}`);
  if (generation.guernicaDirectory || record.guernicaDirectory) defaults.push(`--guernica-dir=${generation.guernicaDirectory || record.guernicaDirectory}`);

  return {
    args: defaults,
    storyModel: record.storyModel || 'gpt-4.1-mini',
    source: recordPath,
  };
}

function mergeRunnerArguments(defaults, userArguments) {
  const merged = [];
  const oppositeFlags = new Map([
    ['--symbolic', '--no-symbolic'], ['--no-symbolic', '--symbolic'],
    ['--room-deepness', '--no-room-deepness'], ['--no-room-deepness', '--room-deepness'],
    ['--scene-visual-controls', '--fixed-visual-controls'], ['--fixed-visual-controls', '--scene-visual-controls'],
    ['--style-reference', '--no-style-reference'], ['--no-style-reference', '--style-reference'],
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
    if (!['0', '-1'].includes(value)) throw new Error('Exhibition runner requires --iterations=0 or --iterations=-1 for endless operation');
  }
  addDefault(merged, userArguments, '--iterations', '-1');
  addDefault(merged, userArguments, '--pause-ms', '0');
  addDefault(merged, userArguments, '--article-order', 'linear');
  addDefault(merged, userArguments, '--news-dir', newsDirectory);
  addDefault(merged, userArguments, '--output-dir', outputDirectory);
  addDefault(merged, userArguments, '--videos-after-each-iteration');
  return [...merged, ...userArguments];
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

async function updateFilms(runDirectory, readyIterations) {
  if (!glueEnabled || !readyIterations.length) return;
  const glueDirectory = join(runDirectory, 'glue-vids');
  const iterationCount = readyIterations.length;
  log(`Generate/resume First-Last-Frame bridges through iteration ${iterationCount}.`);
  await runCommand('First-Last-Frame-Glue', process.execPath, [
    glueScript,
    `--run=${runDirectory}`,
    `--iterations=${iterationCount}`,
    `--duration-pattern=${gluePattern}`,
    `--frame-offset-seconds=${glueFrameOffset}`,
    `--output-dir=${glueDirectory}`,
  ]);

  const baseArguments = [
    assembleScript,
    `--run-dir=${runDirectory}`,
    `--scene-glue-dir=${glueDirectory}`,
    `--limit=${iterationCount}`,
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

async function runMergeLoop(runDirectory) {
  while (!stopping) {
    if (mergeRunning) {
      await delayOrStop(mergeCheckMs);
      continue;
    }
    mergeRunning = true;
    try {
      const ready = await getReadyIterations(runDirectory);
      const state = await readState();
      if (ready.length > Number(state.gluedThroughIteration || 0)) await updateFilms(runDirectory, ready);
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
    const exhibitionArguments = process.argv.slice(2);
    if (exhibitionArguments.includes('--first-last-glue') && exhibitionArguments.includes('--no-first-last-glue')) {
      throw new Error('Choose either --first-last-glue or --no-first-last-glue');
    }
    if (exhibitionArguments.includes('--first-last-glue')) glueEnabled = true;
    if (exhibitionArguments.includes('--no-first-last-glue')) glueEnabled = false;
    if (!exhibitionArguments.includes('--first-last-glue') && !exhibitionArguments.includes('--no-first-last-glue') && state.exhibitionSettings) {
      glueEnabled = state.exhibitionSettings.glueEnabled;
    }
    if (state.exhibitionSettings) {
      gluePattern = state.exhibitionSettings.gluePattern;
      glueFrameOffset = state.exhibitionSettings.glueFrameOffset;
      fadeSeconds = state.exhibitionSettings.fadeSeconds;
      randomThreshold = state.exhibitionSettings.randomThreshold;
    }
    if (!(randomThreshold >= 0 && randomThreshold < 1)) throw new Error('EXHIBITION_RANDOM_BRIDGE_THRESHOLD must be from 0 to below 1');
    const glueDurations = gluePattern.split(',').map((value) => Number(value.trim()));
    if (!glueDurations.length || glueDurations.some((value) => !Number.isInteger(value) || value < 5 || value > 15)) {
      throw new Error('EXHIBITION_GLUE_DURATION_PATTERN must contain integer seconds from 5 through 15');
    }
    const frameOffset = Number(glueFrameOffset);
    if (!Number.isFinite(frameOffset) || frameOffset <= 0 || frameOffset > 1) throw new Error('EXHIBITION_FRAME_OFFSET_SECONDS must be greater than 0 and no more than 1');
    const fadeLength = Number(fadeSeconds);
    if (!Number.isFinite(fadeLength) || fadeLength < 0 || fadeLength > 2) throw new Error('EXHIBITION_FADE_SECONDS must be from 0 through 2');
    const userArguments = exhibitionArguments.filter((argument) => !['--first-last-glue', '--no-first-last-glue'].includes(argument));
    let defaults;
    if (state.runnerArguments?.length) {
      defaults = { args: state.runnerArguments, storyModel: state.storyModel, source: state.settingsSource || null };
    } else {
      const settingsRecord = await findLatestSettingsRecord(settingsSearchDirectory);
      defaults = await defaultsFromLastRun(settingsRecord);
      state.runnerArguments = defaults.args;
      state.storyModel = defaults.storyModel;
      state.settingsSource = defaults.source;
    }
    const runnerArguments = mergeRunnerArguments(defaults.args, userArguments);
    log(`Settings source: ${defaults.source || 'exhibition defaults'}`);
    log(`Settings snapshot: ${JSON.stringify({
      sceneCountMode: runnerArguments.find((argument) => argument.startsWith('--scene-count-mode='))?.split('=').at(-1),
      sceneCount: runnerArguments.find((argument) => argument.startsWith('--scenes='))?.split('=').at(-1),
      articleOrder: 'linear',
      sceneVideo: true,
      firstLastGlue: glueEnabled,
      gluePattern,
      randomBridgeThreshold: randomThreshold,
    })}`);
    state.runnerArguments = runnerArguments.filter((argument) => flagName(argument) !== '--resume-run');
    state.storyModel = defaults.storyModel;
    state.settingsSource = defaults.source;
    state.exhibitionSettings = { glueEnabled, gluePattern, glueFrameOffset, fadeSeconds, randomThreshold };
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
    let mergeTask = runDirectory ? runMergeLoop(runDirectory) : null;
    while (!stopping) {
      const running = startRunner(runnerArguments, runDirectory, (reportedRunDirectory) => {
        runDirectory = resolve(reportedRunDirectory);
        if (!mergeTask) mergeTask = runMergeLoop(runDirectory);
      });
      const result = await running.closed;
      if (state.runDirectory) runDirectory = resolve(state.runDirectory);
      if (stopping) break;
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
