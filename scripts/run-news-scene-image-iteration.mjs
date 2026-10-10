import { randomInt, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, readdir, writeFile, rename, stat, unlink } from 'node:fs/promises';
import { dirname, join, resolve, basename } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { buildPlanRequest, validatePlan, buildImageTask, defaultWords, imageModel, hash } from '../lib/generator/news-scene/planner.mjs';
import { renderReport } from '../lib/generator/news-scene/report.mjs';
import { prepareImageReference } from '../lib/generator/news-scene/reference-images.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { values: options } = parseArgs({ options: {
  resume: { type: 'string' }, 'article-id': { type: 'string' }, scenes: { type: 'string', default: '3' },
  words: { type: 'string' }, 'words-file': { type: 'string' },
  'stream-module': { type: 'string' }, 'stream-file': { type: 'string' },
  'news-dir': { type: 'string', default: join(root, 'news-capitals') },
  'guernica-dir': { type: 'string', default: process.env.GUERNICA_DIRECTORY || '/Users/eggermann/Projekte/EU-RESKI/guernica_elemente_maskiert' },
  'prompt-only': { type: 'boolean', default: false }, help: { type: 'boolean' },
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
const redact = (message) => [process.env.OPENAI_API_KEY, process.env.RUNWARE_API_KEY, process.env.RUNWARE_KEY]
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
      startImagePath: record.results[index]?.path || null, stillPrompt: scene.stillPrompt,
      videoPrompt: scene.videoPrompt, singleImagePrompt: scene.stillPrompt,
    })),
  };
}

async function allocateIteration(newsDirectory) {
  const directory = join(newsDirectory, 'generations');
  await mkdir(directory, { recursive: true });
  for (let index = 1; index < 10000; index += 1) {
    const path = join(directory, `iteration-${String(index).padStart(3, '0')}`);
    try { await mkdir(path); return path; } catch (error) { if (error.code !== 'EEXIST') throw error; }
  }
  throw new Error('No free iteration directory');
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

async function takeSemanticSnapshot() {
  if (options['stream-file']) return validateSemantic(await json(resolve(options['stream-file'])));
  const words = options['words-file'] ? await json(resolve(options['words-file']))
    : options.words ? options.words.split(',').map((word) => [word.trim(), 'de']) : defaultWords;
  if (!Array.isArray(words) || !words.length || words.length > 12 || words.some((entry) => !Array.isArray(entry) || entry.length !== 2 || !entry.every((value) => typeof value === 'string' && value.trim()) || !/^[a-z]{2,3}$/.test(entry[1]))) {
    throw new Error('Words must be [["EU","de"],["EU","en"],["EU","ru"]], at most 12 pairs');
  }
  const modulePath = options['stream-module'] || process.env.NEWS_SEMANTIC_STREAM_MODULE;
  const module = await import(modulePath ? pathToFileURL(resolve(modulePath)).href : 'semantic-stream');
  const entries = [];
  // Sequential source requests respect the semantic-stream package's Wikipedia throttling.
  for (const [index, seed] of words.entries()) {
    console.log(`Semantic stream: ${seed.join(' / ')}`);
    const initStreams = module.initStreams || module.default?.initStreams;
    if (!initStreams) throw new Error('semantic-stream does not export initStreams');
    const [stream] = await initStreams([seed], {
      registerExitHandlers: false,
      wordStreamOptions: { requestPolicy: { maxAttempts: 2, minIntervalMs: 500 } },
    });
    let item;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      item = await stream.getNext();
      if (item?.title && !/doi|isbn|pmid|webarchiv|wayback machine|internet archive/i.test(item.title)) break;
      item = null;
    }
    if (!item) throw new Error(`No usable semantic fragment for ${seed.join('/')}`);
    entries.push({ id: `stream-${index + 1}`, seed, item });
  }
  return validateSemantic({ provider: 'semantic-stream', capturedAt: new Date().toISOString(), words, entries });
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
    console.log('node --env-file=.env scripts/run-news-scene-image-iteration.mjs [--scenes=1..3] [--article-id=ID] [--words=EU,Frieden] [--words-file=words.json] [--stream-file=snapshot.json] [--prompt-only] [--resume=/absolute/iteration-path]\nDefault: latest saved news JSON, random article, live EU de/en/ru semantic streams, 3 scenes, 3 stills and a film-plan.json image-to-video handoff.');
    return;
  }
  if (options.resume && ['words', 'words-file', 'stream-file', 'stream-module', 'article-id'].some((key) => options[key])) throw new Error('Resume reuses saved article and semantic inputs; do not override them');
  const sceneCount = Number(options.scenes);
  if (!Number.isInteger(sceneCount) || sceneCount < 1 || sceneCount > 3) throw new Error('Use --scenes=1, 2 or 3');
  const openAiKey = process.env.OPENAI_API_KEY;
  const runwareKey = process.env.RUNWARE_API_KEY || process.env.RUNWARE_KEY;
  if (!openAiKey || (!options['prompt-only'] && !runwareKey)) throw new Error('Set OPENAI_API_KEY and RUNWARE_API_KEY in your environment');
  const directory = options.resume ? resolve(options.resume) : await allocateIteration(resolve(options['news-dir']));
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
      const draw = options['article-id']
        ? candidates.findIndex(({ article }) => String(article.id) === options['article-id'])
        : randomInt(candidates.length);
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
        selection: { method: options['article-id'] ? 'article-id' : 'random', draw, candidateCount: candidates.length, aggregateIndex: index },
        article, sceneCount, storyModel: process.env.NEWS_STORY_MODEL || 'gpt-4.1-mini', imageModel,
        guernicaDirectory: resolve(options['guernica-dir']), results: [],
      };
    }
    await mkdir(join(directory, 'media'), { recursive: true });
    const persist = async () => {
      await save(join(directory, 'record.json'), record);
      await writeFile(join(directory, 'index.html'), renderReport(record));
    };
    delete record.error;
    await persist();
    console.log(`Iteration: ${directory}\nArticle: ${record.article.title}`);
    if (!record.semantic) {
      record.semantic = await takeSemanticSnapshot();
      await save(join(directory, 'semantic-stream.json'), record.semantic);
      await persist();
    }
    if (!record.articleImage) {
      record.articleImage = await download(record.article.image, directory, 'article');
      await persist();
    }
    if (!record.catalog) {
      const { elemente } = await json(join(record.guernicaDirectory, 'guernica_elemente.json'));
      const catalog = [];
      for (const entry of elemente) {
        if (basename(entry.bild) !== entry.bild) throw new Error('Invalid catalog filename');
        const buffer = await readFile(join(record.guernicaDirectory, entry.bild));
        const path = `media/${entry.bild}`;
        await writeFile(join(directory, path), buffer);
        catalog.push({ id: entry.id, name: entry.name, interpretation: entry.interpretation, eu_bezug: entry.eu_bezug, path, mimeType: 'image/png', sha256: hash(buffer) });
      }
      record.catalog = catalog;
      await persist();
    }
    if (!record.plan) {
      const images = [await imageInput(directory, record.articleImage, 'News photograph: inspect as evidence.', 'article')];
      for (const entry of record.catalog) images.push(await imageInput(directory, entry, `Catalog figure id ${entry.id}: ${entry.name}. Selection candidate, not an image-API reference number.`, 'catalog'));
      const built = await buildPlanRequest({ ...record, images, model: record.storyModel });
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
        record.plan = validatePlan(raw, record);
      } catch (error) {
        if (!/semantic|motif|crocodile/i.test(error.message)) throw error;
        const revisionRequest = {
          ...request,
          messages: [
            ...request.messages,
            { role: 'assistant', content: raw.choices?.[0]?.message?.content || '' },
            { role: 'user', content: [{ type: 'text', text: [
              `Your plan failed validation: ${error.message}`,
              'Revise the whole plan once. For each relevant semantic entry, use a short, concrete English visualMotif phrase, repeat that exact phrase verbatim in every assigned stillPrompt, and show it as a visible action or object. Do not claim a word matters just because it repeats an article fact. Mark unrelated entries not_relevant with a concise reason.',
              'The crocodile is optional. Include it only if its action makes sense as a metaphor; never add it as an edge decoration.',
              'Make the image clearly hand-painted and strongly abstracted: no photorealistic faces, real-person likeness, crests, logos, brand marks, or readable lettering.',
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
        record.plan = validatePlan(revised, record);
        record.planRevisionReason = error.message;
        finalResponse = revised;
      }
      record.usage = finalResponse.usage;
      record.planHash = hash(JSON.stringify(record.plan));
      await save(join(directory, 'scene-plan.json'), record.plan);
      await persist();
    }
    if (hash(JSON.stringify(record.plan)) !== record.planHash) throw new Error('Saved plan has changed; use a new iteration');
    if (!options['prompt-only']) {
      const articleInput = await prepareImageReference(directory, await imageInput(directory, record.articleImage, 'article', 'article'));
      for (const [index, scene] of record.plan.scenes.entries()) {
        if (record.results[index]?.path && await exists(join(directory, record.results[index].path))) continue;
        const figure = record.catalog.find((item) => item.id === scene.guernicaId);
        const figureInput = await prepareImageReference(directory, await imageInput(directory, figure, figure.name, 'catalog'));
        const name = `scene-${scene.index}`;
        const requestPath = join(directory, `${name}-request.json`);
        let log = await exists(requestPath) ? await json(requestPath) : null;
        const referenceImages = [articleInput.dataUrl, figureInput.dataUrl];
        const task = log ? { ...log, inputs: { referenceImages } } : buildImageTask(scene, randomUUID(), referenceImages);
        if (log && log.positivePrompt !== scene.stillPrompt) throw new Error('Saved image prompt differs from GPT plan');
        log = { ...task, inputs: { referenceImages: [articleInput.path, figureInput.path] } };
        await save(requestPath, log);
        console.log(`Scene ${scene.index}: GPT prompt → ${imageModel}`);
        const raw = await paidRequest(directory, name, 'https://api.runware.ai/v1', runwareKey, [task]);
        if (raw.errors?.length) throw new Error(`Runware: ${raw.errors.map((error) => error.message || error.code).join('; ')}`);
        const result = raw.data?.find((item) => item.taskUUID === task.taskUUID && item.imageURL);
        if (!result) throw new Error('Runware returned no matching image; saved response retained');
        const output = await download(result.imageURL, directory, `scene-${scene.index}-first-frame`);
        record.results[index] = { ...output, taskUUID: task.taskUUID, seed: result.seed, cost: result.cost ?? null, promptHash: hash(scene.stillPrompt), referencePaths: [articleInput.path, figureInput.path], referenceMetadata: [articleInput, figureInput].map(({ dataUrl, ...metadata }) => metadata) };
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
