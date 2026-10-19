import { randomInt, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdir, readFile, readdir, writeFile, rename, stat, unlink } from 'node:fs/promises';
import { dirname, join, resolve, basename, extname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { buildPlanRequest, validatePlan, buildImageTask, defaultWords, imageModel, hash } from '../news-scene/planner.mjs';
import { renderReport, renderRunReport } from '../news-scene/report.mjs';
import { prepareImageReference } from '../news-scene/reference-images.mjs';
import { generateFluxKleinImage } from '../news-scene/huggingface-flux-klein.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const { values: options } = parseArgs({ options: {
  resume: { type: 'string' }, 'article-id': { type: 'string' }, 'article-order': { type: 'string', default: process.env.NEWS_ARTICLE_ORDER || 'linear' }, scenes: { type: 'string', default: '3' },
  iterations: { type: 'string', default: process.env.NEWS_MAX_ITERATIONS || '1' },
  'pause-ms': { type: 'string', default: process.env.NEWS_POLLING_TIME_MS || '5000' },
  'scene-length-takt': { type: 'string', default: process.env.NEWS_SCENE_LENGTH_TAKT || '3' },
  'scene-length-type': { type: 'string', default: process.env.NEWS_SCENE_LENGTH_TYPE || 'balanced' },
  'scene-length-multiplier': { type: 'string', default: process.env.NEWS_SCENE_LENGTH_MULTIPLIER || '3.5' },
  'scene-length-bias': { type: 'string', default: process.env.NEWS_SCENE_LENGTH_BIAS || '0' },
  'min-scene-seconds': { type: 'string', default: process.env.NEWS_MIN_SCENE_DURATION_SECONDS || '5' },
  'max-scene-seconds': { type: 'string', default: process.env.NEWS_MAX_SCENE_DURATION_SECONDS || '15' },
  words: { type: 'string' }, 'words-file': { type: 'string' },
  'stream-module': { type: 'string' }, 'stream-file': { type: 'string' },
  'news-dir': { type: 'string', default: join(root, 'eu-reski-news', 'news', 'A') },
  'output-dir': { type: 'string', default: process.env.NEWS_OUTPUT_DIR || join(root, 'eu-reski-news', 'GENERATIONS', 'news') },
  'guernica-dir': { type: 'string', default: process.env.GUERNICA_DIRECTORY || '/Users/eggermann/Projekte/EU-RESKI/guernica_elemente_maskiert' },
  'style-reference': { type: 'string', default: process.env.NEWS_STYLE_REFERENCE || '/Users/eggermann/Projekte/EU-RESKI/guernica-by-pablo-picasso.jpg!Large.jpg' },
  'image-provider': { type: 'string', default: process.env.NEWS_IMAGE_PROVIDER || 'runware' },
  'prompt-only': { type: 'boolean', default: false }, 'no-style-reference': { type: 'boolean', default: false }, help: { type: 'boolean' },
} });
const json = async (path) => JSON.parse(await readFile(path, 'utf8'));
async function exists(path) {
  try { await stat(path); return true; } catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}
async function save(path, value) {
  const temporary = `${path}.${randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify(value, null, 2) + '\n');
  await rename(temporary, path);
}
const redact = (message) => [process.env.OPENAI_API_KEY, process.env.RUNWARE_API_KEY, process.env.RUNWARE_KEY, process.env.HF_TOKEN, process.env.HF_API_TOKEN, process.env.HUGGINGFACEHUB_API_TOKEN]
  .filter(Boolean).reduce((text, key) => text.replaceAll(key, '[redacted]'), String(message));


function buildFilmPlan(record, directory) {
  return {
    formatVersion: 1,
    sourceIteration: directory,
    sourceCommit: record.sourceVersion?.commit || null,
    article: { title: record.article.title, url: record.article.url, publish_date: record.article.publish_date },
    status: 'Film-Prompts bereit; keine Film-API aufgerufen',
    promptOrigin: 'GPT-generated from article, semantic stream, story beat and still plan',
    instructions: 'Pass scenePlan to the film generator. For every entry, use startImagePath as the image-to-video input and videoPrompt as its motion prompt.',
    scenePlan: record.plan.scenes.map((scene, index) => ({
      index: scene.index, title: scene.title, beat: scene.storyBeat, storyBeat: scene.storyBeat,
      durationSeconds: scene.durationSeconds, requestedDurationSeconds: scene.durationSeconds,
      videoMode: 'singleImage', frameSource: 'providedStartImage',
      startImagePath: record.results[index]?.path ? resolve(directory, record.results[index].path) : null, stillPrompt: scene.stillPrompt,
      videoPrompt: scene.videoPrompt, singleImagePrompt: scene.stillPrompt,
    })),
  };
}

function alignSemanticSceneAssignments(response) {
  const content = response.choices?.[0]?.message?.content;
  if (typeof content !== 'string') return { response, corrections: [] };

  let plan;
  try { plan = JSON.parse(content); } catch { return { response, corrections: [] }; }

  const corrections = [];
  for (const [streamId, entry] of Object.entries(plan.semanticUse || {})) {
    if (entry.relevance !== 'relevant' || !entry.visualMotif?.trim()) continue;
    const motif = entry.visualMotif.trim().toLocaleLowerCase();
    const actualSceneIndices = (plan.scenes || [])
      .filter((scene) => scene.stillPrompt?.toLocaleLowerCase().includes(motif))
      .map((scene) => scene.index);
    const assignedSceneIndices = entry.relatedSceneIndices || [];
    if (actualSceneIndices.length && actualSceneIndices.join(',') !== assignedSceneIndices.join(',')) {
      corrections.push({ streamId, motif: entry.visualMotif, from: assignedSceneIndices, to: actualSceneIndices });
      entry.relatedSceneIndices = actualSceneIndices;
    }
  }

  if (!corrections.length) return { response, corrections };
  return {
    response: {
      ...response,
      choices: response.choices.map((choice, index) => index === 0
        ? { ...choice, message: { ...choice.message, content: JSON.stringify(plan) } }
        : choice),
    },
    corrections,
  };
}

async function allocateIteration(outputDirectory) {
  const directory = resolve(outputDirectory);
  await mkdir(directory, { recursive: true });
  for (let index = 1; index < 10000; index += 1) {
    const path = join(directory, `iteration-${String(index).padStart(3, '0')}`);
    try { await mkdir(path); return path; } catch (error) { if (error.code !== 'EEXIST') throw error; }
  }
  throw new Error('No free iteration directory');
}

async function allocateRunDirectory(outputDirectory) {
  const directory = resolve(outputDirectory);
  await mkdir(directory, { recursive: true });
  for (let index = 1; index < 10000; index += 1) {
    const path = join(directory, `run-${String(index).padStart(3, '0')}`);
    try { await mkdir(path); return path; } catch (error) { if (error.code !== 'EEXIST') throw error; }
  }
  throw new Error('No free run directory');
}

function validateSemantic(semantic) {
  if (!Array.isArray(semantic.entries) || semantic.entries.length < 1 || semantic.entries.length > 12) throw new Error('Expected 1–12 semantic entries');
  const ids = new Set();
  for (const entry of semantic.entries) {
    if (!entry.id || ids.has(entry.id) || !Array.isArray(entry.seed) || !entry.item?.title) throw new Error('Invalid semantic entry');
    ids.add(entry.id);
  }
  return semantic;
}

async function createSemanticSource() {
  if (options['stream-file']) {
    return { next: async () => validateSemantic(await json(resolve(options['stream-file']))) };
  }
  const words = options['words-file'] ? await json(resolve(options['words-file']))
    : options.words ? options.words.split(',').map((word) => [word.trim(), 'de']) : defaultWords;
  if (!Array.isArray(words) || !words.length || words.length > 12 || words.some((entry) => !Array.isArray(entry) || entry.length !== 2 || !entry.every((value) => typeof value === 'string' && value.trim()) || !/^[a-z]{2,3}$/.test(entry[1]))) {
    throw new Error('Words must be [["EU","de"],["EU","en"],["EU","ru"]], at most 12 pairs');
  }
  const modulePath = options['stream-module'] || process.env.NEWS_SEMANTIC_STREAM_MODULE;
  const module = await import(modulePath ? pathToFileURL(resolve(modulePath)).href : 'semantic-stream');
  const initStreams = module.initStreams || module.default?.initStreams;
  if (!initStreams) throw new Error('semantic-stream does not export initStreams');
  const streams = [];
  // Keep each stream alive for the full run; getNext advances it between iterations.
  for (const [index, seed] of words.entries()) {
    console.log(`Semantic stream: ${seed.join(' / ')}`);
    const [stream] = await initStreams([seed], {
      registerExitHandlers: false,
      wordStreamOptions: { requestPolicy: { maxAttempts: 2, minIntervalMs: 500 } },
    });
    streams.push({ id: `stream-${index + 1}`, seed, stream });
  }
  return {
    next: async () => {
      const entries = [];
      // Sequential reads respect semantic-stream's source throttling.
      for (const { id, seed, stream } of streams) {
        let item;
        for (let attempt = 0; attempt < 20; attempt += 1) {
          item = await stream.getNext();
          if (item?.title && !/doi|isbn|pmid|webarchiv|wayback machine|internet archive/i.test(item.title)) break;
          item = null;
        }
        if (!item) throw new Error(`No usable semantic fragment for ${seed.join('/')}`);
        entries.push({ id, seed, item });
      }
      return validateSemantic({ provider: 'semantic-stream', capturedAt: new Date().toISOString(), words, entries });
    },
  };
}

function createSceneDurationStream() {
  const localRequire = createRequire(import.meta.url);
  let Taktmuster;
  try {
    ({ Taktmuster } = localRequire('taktmuster'));
  } catch (error) {
    if (error.code !== 'MODULE_NOT_FOUND') throw error;
    const gitCommonDirectory = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd: root, encoding: 'utf8' }).trim();
    ({ Taktmuster } = createRequire(join(dirname(gitCommonDirectory), 'package.json'))('taktmuster'));
  }
  const takt = Number(options['scene-length-takt']);
  const multiplier = Number(options['scene-length-multiplier']);
  const bias = Number(options['scene-length-bias']);
  const minimum = Number(options['min-scene-seconds']);
  const maximum = Number(options['max-scene-seconds']);
  if (!Number.isFinite(takt) || takt <= 0 || !Number.isFinite(multiplier) || multiplier <= 0 || !Number.isFinite(bias)) {
    throw new Error('Invalid Taktmuster duration settings');
  }
  if (!Number.isInteger(minimum) || minimum < 5 || !Number.isInteger(maximum) || maximum < minimum || maximum > 15) {
    throw new Error('Scene duration bounds must satisfy 5 <= minimum <= maximum <= 15 seconds');
  }
  const taktmuster = new Taktmuster();
  taktmuster.setTakt(takt);
  taktmuster.setType(options['scene-length-type']);
  return {
    next: () => {
      const step = taktmuster.getNext();
      const patternValue = Number(step?.patternValue ?? step);
      const baseValue = Number.isFinite(patternValue) && patternValue > 0 ? Math.round(patternValue) : 1;
      const shapedValue = baseValue * multiplier + bias;
      return Math.max(minimum, Math.min(maximum, Math.round(shapedValue)));
    },
    settings: { provider: 'taktmuster', takt, type: options['scene-length-type'], multiplier, bias, minimum, maximum },
  };
}

async function download(url, directory, stem) {
  if (!/^https?:\/\//i.test(url)) throw new Error('Image URL must use HTTP(S)');
  const response = await fetch(url, { signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw new Error(`Image download: HTTP ${response.status}`);
  const mimeType = response.headers.get('content-type')?.split(';')[0].trim();
  const extension = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[mimeType];
  if (!extension) throw new Error(`Unsupported image type: ${mimeType}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  if (!buffer.length || buffer.length > 20 * 1024 * 1024) throw new Error('Invalid image size');
  const path = `media/${stem}.${extension}`;
  await writeFile(join(directory, path), buffer);
  return { path, mimeType, sha256: hash(buffer), bytes: buffer.length };
}

async function imageInput(directory, image, label, role) {
  const buffer = await readFile(join(directory, image.path));
  if (hash(buffer) !== image.sha256) throw new Error(`Image changed: ${image.path}`);
  return { ...image, label, role, dataUrl: `data:${image.mimeType};base64,${buffer.toString('base64')}` };
}

// Persist responses BEFORE interpretation/download. A pending request is never charged again automatically.
async function paidRequest(directory, name, url, key, request) {
  const responsePath = join(directory, `${name}-response.json`);
  if (await exists(responsePath)) return json(responsePath);
  const pendingPath = join(directory, `${name}-pending.json`);
  try { await writeFile(pendingPath, JSON.stringify({ startedAt: new Date().toISOString() }), { flag: 'wx' }); }
  catch (error) {
    if (error.code === 'EEXIST') throw new Error(`${name}: previous API outcome unknown. Inspect provider history before retrying; no automatic repeat charge.`);
    throw error;
  }
  const response = await fetch(url, {
    method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(request), signal: AbortSignal.timeout(240000),
  });
  const body = await response.json();
  await save(responsePath, body);
  await unlink(pendingPath);
  if (!response.ok) throw new Error(`${name}: HTTP ${response.status}. See saved response.`);
  return body;
}

async function main() {
  if (options.help) {
    console.log('node --env-file=.env eu-reski-news/scripts/run-news-scene-image-iteration.mjs [--iterations=1|0|-1] [--pause-ms=5000] [--scenes=1..3] [--article-order=linear|random] [--news-dir=PATH] [--scene-length-takt=3] [--scene-length-type=balanced] [--scene-length-multiplier=3.5] [--scene-length-bias=0] [--min-scene-seconds=5] [--max-scene-seconds=15] [--output-dir=PATH] [--article-id=ID] [--style-reference=PATH] [--words=EU,Frieden] [--words-file=words.json] [--stream-file=snapshot.json] [--prompt-only] [--resume=/absolute/iteration-path]\nLinear starts at the first eligible article for each new run and advances once per iteration, wrapping at the end. Random draws a new eligible article each iteration. --article-id overrides either mode. 0 or -1 iterations means endless. Semantic and Taktmuster streams stay open across iterations. Each scene sends two references: the selected masked figure for protagonist identity and the full painting for style only. Article photo goes to GPT, not the image API. Output: eu-reski-news/GENERATIONS/news/.');
    return;
  }
  if (options.resume && ['words', 'words-file', 'stream-file', 'stream-module', 'article-id'].some((key) => options[key])) throw new Error('Resume reuses saved article and semantic inputs; do not override them');
  const iterationLimit = Number(options.iterations);
  if (!Number.isInteger(iterationLimit) || iterationLimit < -1) throw new Error('Use --iterations=N, --iterations=0 or --iterations=-1');
  const pauseMilliseconds = Number(options['pause-ms']);
  if (!Number.isInteger(pauseMilliseconds) || pauseMilliseconds < 0) throw new Error('--pause-ms must be a non-negative integer');
  if (options.resume && iterationLimit !== 1) throw new Error('--resume only supports one iteration');
  const sceneCount = Number(options.scenes);
  if (!Number.isInteger(sceneCount) || sceneCount < 1 || sceneCount > 3) throw new Error('Use --scenes=1, 2 or 3');
  if (!['linear', 'random'].includes(options['article-order'])) throw new Error('Use --article-order=linear or --article-order=random');
  const openAiKey = process.env.OPENAI_API_KEY;
  const runwareKey = process.env.RUNWARE_API_KEY || process.env.RUNWARE_KEY;
  const imageProvider = options['image-provider'];
  if (!['runware', 'hf-flux-klein'].includes(imageProvider)) throw new Error('Use --image-provider=runware or --image-provider=hf-flux-klein');
  if (!openAiKey || (!options['prompt-only'] && imageProvider === 'runware' && !runwareKey)) throw new Error('Set OPENAI_API_KEY and RUNWARE_API_KEY in your environment');
  if (!options['prompt-only'] && imageProvider === 'hf-flux-klein' && !(process.env.HF_TOKEN || process.env.HF_API_TOKEN || process.env.HUGGINGFACEHUB_API_TOKEN)) throw new Error('Set OPENAI_API_KEY and HF_TOKEN (or HF_API_TOKEN) in your environment');
  const semanticSource = options.resume ? null : await createSemanticSource();
  const sceneDurations = createSceneDurationStream();
  const endless = iterationLimit === 0 || iterationLimit === -1;
  const groupedRun = endless || iterationLimit > 1;
  const iterationRoot = options.resume
    ? null
    : groupedRun
      ? await allocateRunDirectory(resolve(options['output-dir']))
      : resolve(options['output-dir']);
  const runManifest = groupedRun ? {
    profile: process.env.NEWS_PROFILE || 'EU-RESKI Ausstellung',
    startedAt: new Date().toISOString(),
    iterationLimit: endless ? 'endless' : iterationLimit,
    pauseMilliseconds,
    status: 'running',
    iterations: [],
  } : null;
  if (runManifest) {
    await save(join(iterationRoot, 'run.json'), runManifest);
    console.log(`Run folder: ${iterationRoot}`);
  }
  let completed = 0;
  while (endless || completed < iterationLimit) {
    console.log(`Starting news run ${completed + 1}${endless ? ' (endless)' : ` of ${iterationLimit}`}`);
    const iterationDirectory = await runIteration(semanticSource, sceneDurations, iterationRoot, completed);
    completed += 1;
    if (runManifest) {
      const relativeDirectory = iterationDirectory.slice(iterationRoot.length + 1);
      runManifest.iterations.push({ index: completed, directory: relativeDirectory, report: `${relativeDirectory}/index.html` });
      await save(join(iterationRoot, 'run.json'), runManifest);
      const reports = await Promise.all(runManifest.iterations.map(async (iteration) => ({
        directory: iteration.directory,
        record: await json(join(iterationRoot, iteration.directory, 'record.json')),
      })));
      await writeFile(join(iterationRoot, 'index.html'), renderRunReport(runManifest, reports));
      console.log(`Cumulative HTML: ${join(iterationRoot, 'index.html')}`);
    }
    if (!endless && completed >= iterationLimit) break;
    console.log(`Next article and semantic fragments in ${pauseMilliseconds} ms; streams remain open.`);
    await new Promise((resolveDelay) => setTimeout(resolveDelay, pauseMilliseconds));
  }
  if (runManifest) {
    runManifest.status = 'completed';
    runManifest.finishedAt = new Date().toISOString();
    await save(join(iterationRoot, 'run.json'), runManifest);
    const reports = await Promise.all(runManifest.iterations.map(async (iteration) => ({
      directory: iteration.directory,
      record: await json(join(iterationRoot, iteration.directory, 'record.json')),
    })));
    await writeFile(join(iterationRoot, 'index.html'), renderRunReport(runManifest, reports));
  }
}

async function runIteration(semanticSource, sceneDurationStream, iterationRoot, iterationIndex) {
  const sceneCount = Number(options.scenes);
  if (!Number.isInteger(sceneCount) || sceneCount < 1 || sceneCount > 3) throw new Error('Use --scenes=1, 2 or 3');
  const openAiKey = process.env.OPENAI_API_KEY;
  const runwareKey = process.env.RUNWARE_API_KEY || process.env.RUNWARE_KEY;
  const imageProvider = options['image-provider'];
  if (!openAiKey || (!options['prompt-only'] && imageProvider === 'runware' && !runwareKey)) throw new Error('Set OPENAI_API_KEY and RUNWARE_API_KEY in your environment');
  if (!options['prompt-only'] && imageProvider === 'hf-flux-klein' && !(process.env.HF_TOKEN || process.env.HF_API_TOKEN || process.env.HUGGINGFACEHUB_API_TOKEN)) throw new Error('Set OPENAI_API_KEY and HF_TOKEN (or HF_API_TOKEN) in your environment');
  const directory = options.resume ? resolve(options.resume) : await allocateIteration(iterationRoot);
  let record;
  try {
    if (options.resume) {
      const saved = await json(join(directory, 'record.json'));
      if (saved.generator !== 'semantic-news-v1') throw new Error('Resume requires an iteration created by this generator');
      record = saved;
    } else {
      const newsDirectory = resolve(options['news-dir']);
      const files = (await readdir(newsDirectory)).filter((name) => /^all-.*\.json$/.test(name)).sort();
      if (!files.length) throw new Error('No all-*.json news collection found');
      const sourceAggregate = join(newsDirectory, files.at(-1));
      const aggregate = await json(sourceAggregate);
      const candidates = aggregate.news.map((article, index) => ({ article, index }))
        .filter(({ article }) => /^https?:\/\//i.test(article.image || '') && (article.text || article.summary));
      if (!candidates.length) throw new Error('No news article with text and image');
      const order = options['article-order'];
      const draw = options['article-id']
        ? candidates.findIndex(({ article }) => String(article.id) === options['article-id'])
        : order === 'random'
          ? randomInt(candidates.length)
          : iterationIndex % candidates.length;
      if (draw < 0) throw new Error('Requested article is missing or has no usable text and image');
      const { article, index } = candidates[draw];
      record = {
        generator: 'semantic-news-v1', createdAt: new Date().toISOString(), status: 'preparing',
        sourceVersion: {
          commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
          branch: execFileSync('git', ['branch', '--show-current'], { cwd: root, encoding: 'utf8' }).trim(),
          clean: !execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], { cwd: root, encoding: 'utf8' }).trim(),
        },
        sourceAggregate, aggregateHash: hash(await readFile(sourceAggregate)),
        selection: { method: options['article-id'] ? 'article-id' : order, order, draw, candidateCount: candidates.length, aggregateIndex: index },
        article, sceneCount, imageProvider, storyModel: process.env.NEWS_STORY_MODEL || 'gpt-4.1-mini', imageModel: imageProvider === 'hf-flux-klein' ? 'FLUX 3 Image Klein · ZeroGPU' : imageModel,
        guernicaDirectory: resolve(options['guernica-dir']), results: [],
      };
    }
    await mkdir(join(directory, 'media'), { recursive: true });
    if (!record.sceneDurations) {
      record.sceneDurations = record.plan?.scenes?.map((scene) => scene.durationSeconds)
        || Array.from({ length: sceneCount }, () => sceneDurationStream.next());
      record.sceneDurationSettings = sceneDurationStream.settings;
      await save(join(directory, 'record.json'), record);
    }
    const persist = async () => {
      await save(join(directory, 'record.json'), record);
      await writeFile(join(directory, 'index.html'), renderReport(record));
    };
    delete record.error;
    await persist();
    console.log(`Iteration: ${directory}\nArticle: ${record.article.title}`);
    if (!record.semantic) {
      record.semantic = await semanticSource.next();
      await save(join(directory, 'semantic-stream.json'), record.semantic);
      await persist();
    }
    if (!record.articleImage) {
      record.articleImage = await download(record.article.image, directory, 'article');
      await persist();
    }
    if (!record.styleReference && !options['no-style-reference']) {
      const sourcePath = resolve(options['style-reference']);
      const extension = extname(sourcePath).toLocaleLowerCase();
      const mimeType = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' }[extension];
      if (!mimeType) throw new Error('Style reference must be a JPG, PNG or WebP image');
      const buffer = await readFile(sourcePath);
      const path = `media/guernica-style-reference${extension === '.jpeg' ? '.jpg' : extension}`;
      await writeFile(join(directory, path), buffer);
      record.styleReference = { path, sourcePath, mimeType, sha256: hash(buffer), bytes: buffer.length };
      await persist();
    }
    if (!record.plan) {
      if (!record.catalog) {
        const { elemente } = await json(join(record.guernicaDirectory, 'guernica_elemente.json'));
        record.catalog = [];
        for (const entry of elemente) {
          if (basename(entry.bild) !== entry.bild) throw new Error('Invalid catalog filename');
          const buffer = await readFile(join(record.guernicaDirectory, entry.bild));
          const path = `media/${entry.bild}`;
          await writeFile(join(directory, path), buffer);
          record.catalog.push({ id: entry.id, name: entry.name, interpretation: entry.interpretation, eu_bezug: entry.eu_bezug, path, mimeType: 'image/png', sha256: hash(buffer) });
        }
        await persist();
      }
      const images = [await imageInput(directory, record.articleImage, 'Article photograph for factual and visual analysis only; never reproduce its identifiable people.', 'article')];
      for (const entry of record.catalog) images.push(await imageInput(directory, entry, `Masked Guernica figure candidate ${entry.id}: ${entry.name}. Character reference candidate only; not a story instruction.`, 'catalog'));
      const built = await buildPlanRequest({ article: record.article, semantic: record.semantic, catalog: record.catalog, sceneCount: record.sceneCount, sceneDurations: record.sceneDurations, sceneDurationSettings: record.sceneDurationSettings, images, model: record.storyModel });
      // Once dispatched, preserve the exact saved request on resume even if source code changed.
      const logPath = join(directory, 'gpt-request.json');
      if (!await exists(logPath)) {
        record.directorHash = built.directorHash;
        await writeFile(join(directory, 'director.md'), built.director);
        await save(logPath, built.log);
        await persist();
      }
      const request = await json(logPath);
      for (const message of request.messages) {
        if (!Array.isArray(message.content)) continue;
        for (const part of message.content) {
          if (part.type !== 'image_url') continue;
          const image = images.find((candidate) => `local:${candidate.path}` === part.image_url.url);
          if (!image) throw new Error('Saved GPT request refers to an unknown image');
          part.image_url.url = image.dataUrl;
        }
      }
      const raw = await paidRequest(directory, 'gpt', 'https://api.openai.com/v1/chat/completions', openAiKey, request);
      if (raw.error) throw new Error(`GPT error: ${raw.error.message}`);
      let finalResponse = raw;
      try {
        const aligned = alignSemanticSceneAssignments(raw);
        record.semanticIndexCorrections = aligned.corrections;
        record.plan = validatePlan(aligned.response, record);
      } catch (error) {
        if (!/semantic|motif|crocodile|protagonist|composition/i.test(error.message)) throw error;
        const revisionRequest = {
          ...request,
          messages: [
            ...request.messages,
            { role: 'assistant', content: raw.choices?.[0]?.message?.content || '' },
            { role: 'user', content: [{ type: 'text', text: [
              `Your plan failed validation: ${error.message}`,
              'Revise the whole plan once. Every stillPrompt and videoPrompt must be entirely natural English. Translate source-language article details and semantic words; never copy foreign-language terms into model prompts. For each relevant semantic entry, use a short, concrete English visualMotif phrase, repeat that exact phrase verbatim in every assigned stillPrompt, and show it as a visible action or object. Do not claim a word matters just because it repeats an article fact. Mark unrelated entries not_relevant with a concise reason.',
              'Keep one invented protagonist name, visual identity, and Guernica figure id for the entire scene sequence. Every protagonistAction must include the exact protagonist name and every scene must keep the same figure id. Every selectionReason must explain visual fit without importing the figure source story. Assign a different composition choice to each scene, and change camera angle, distance, framing, and main action.',
              'The crocodile is optional. Include it only if its action makes sense as a metaphor; never add it as an edge decoration.',
              'Each image API request receives two images: reference 1 is the selected masked figure, used only for the fictional protagonist’s abstract appearance and gesture; reference 2 is the complete painting, used only for style. Redraw reference 1 fully in the scene; never paste it. Do not import the figure’s original story, props, or symbols. Reference 2 contributes painterly style only. The article photo is for GPT analysis only, never sent to the image API. Keep protagonist prominent. Do not copy real-person likenesses, crests, logos, brands, or readable lettering.',
              'Here is the complete previous JSON plan to correct:',
              raw.choices?.[0]?.message?.content || '',
            ].join('\n') }] },
          ],
        };
        const revisionLog = structuredClone(revisionRequest);
        let imageIndex = 0;
        for (const part of revisionLog.messages[1].content) {
          if (part.type === 'image_url') part.image_url.url = `local:${images[imageIndex++].path}`;
        }
        await save(join(directory, 'gpt-revision-request.json'), revisionLog);
        const revised = await paidRequest(directory, 'gpt-revision', 'https://api.openai.com/v1/chat/completions', openAiKey, revisionRequest);
        if (revised.error) throw new Error(`GPT revision failed: ${revised.error.message}`);
        const aligned = alignSemanticSceneAssignments(revised);
        record.semanticIndexCorrections = aligned.corrections;
        record.plan = validatePlan(aligned.response, record);
        record.planRevisionReason = error.message;
        finalResponse = revised;
      }
      record.plan.scenes = record.plan.scenes.map((scene, index) => ({ ...scene, durationSeconds: record.sceneDurations[index] }));
      record.usage = finalResponse.usage;
      record.planHash = hash(JSON.stringify(record.plan));
      await save(join(directory, 'scene-plan.json'), record.plan);
      await persist();
    }
    if (hash(JSON.stringify(record.plan)) !== record.planHash) throw new Error('Saved plan has changed; use a new iteration');
    if (!options['prompt-only']) {
      const styleInput = options['no-style-reference'] ? null : await prepareImageReference(directory, await imageInput(directory, record.styleReference, 'Full-painting style reference only; no depicted content may be used', 'style'));
      for (const [index, scene] of record.plan.scenes.entries()) {
        if (record.results[index]?.path && await exists(join(directory, record.results[index].path))) continue;
        const figure = record.catalog.find((item) => item.id === scene.guernicaId);
        if (!figure) throw new Error(`No Guernica figure ${scene.guernicaId} for scene ${scene.index}`);
        const figureInput = await prepareImageReference(directory, await imageInput(directory, figure, `Protagonist character reference: ${figure.name}; redraw, do not paste`, 'catalog'));
        const name = `scene-${scene.index}`;
        const requestPath = join(directory, `${name}-request.json`);
        let log = await exists(requestPath) ? await json(requestPath) : null;
        const referenceImages = [figureInput.dataUrl, ...(styleInput ? [styleInput.dataUrl] : [])];
        const task = log ? { ...log, inputs: { referenceImages } } : buildImageTask(scene, randomUUID(), referenceImages);
        if (log && log.positivePrompt !== scene.stillPrompt) throw new Error('Saved image prompt differs from GPT plan');
        const referencePaths = [figureInput.path, ...(styleInput ? [styleInput.path] : [])];
        log = { ...task, inputs: { referenceImages: referencePaths } };
        await save(requestPath, log);
        console.log(`Scene ${scene.index}: GPT prompt → ${record.imageModel}`);
        let output;
        let result;
        if (imageProvider === 'hf-flux-klein') {
          result = await generateFluxKleinImage({ prompt: scene.stillPrompt, referencePaths: referencePaths.map((path) => join(directory, path)), token: process.env.HF_TOKEN || process.env.HF_API_TOKEN || process.env.HUGGINGFACEHUB_API_TOKEN, directory, name, seed: randomInt(2_147_483_647) });
          output = await download(result.imageUrl, directory, `scene-${scene.index}-first-frame`);
        } else {
          const raw = await paidRequest(directory, name, 'https://api.runware.ai/v1', runwareKey, [task]);
          if (raw.errors?.length) throw new Error(`Runware: ${raw.errors.map((error) => error.message || error.code).join('; ')}`);
          result = raw.data?.find((item) => item.taskUUID === task.taskUUID && item.imageURL);
          if (!result) throw new Error('Runware returned no matching image; saved response retained');
          output = await download(result.imageURL, directory, `scene-${scene.index}-first-frame`);
        }
        record.results[index] = { ...output, provider: imageProvider, taskUUID: result.taskUUID || result.eventId, seed: result.seed, cost: result.cost ?? null, billing: imageProvider === 'hf-flux-klein' ? 'ZeroGPU quota/credits; exact GPU seconds not reported by Space' : 'provider-reported', promptHash: hash(scene.stillPrompt), referencePaths, referenceMetadata: [figureInput, ...(styleInput ? [styleInput] : [])].map(({ dataUrl, ...metadata }) => metadata) };
        await persist();
      }
    }
    record.status = options['prompt-only'] ? 'Prompts erstellt' : 'Abgeschlossen';
    record.filmPlan = buildFilmPlan(record, directory);
    await save(join(directory, 'film-plan.json'), record.filmPlan);
    record.finishedAt = new Date().toISOString();
    await persist();
    console.log(`HTML: ${join(directory, 'index.html')}`);
    console.log(`Image cost USD: ${record.results.reduce((sum, item) => sum + (item?.cost || 0), 0)}; GPT tokens: ${record.usage?.total_tokens}`);
    return directory;
  } catch (error) {
    if (record) {
      record.status = 'Unterbrochen'; record.error = redact(error.message);
      await save(join(directory, 'record.json'), record);
      await writeFile(join(directory, 'index.html'), renderReport(record));
    }
    console.error(`Resume after resolving error: --resume=${directory}`);
    throw error;
  }
}

main().catch((error) => { console.error(redact(error.message)); process.exitCode = 1; });
