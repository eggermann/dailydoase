import { randomInt, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdir, readFile, readdir, writeFile, rename, stat, unlink } from 'node:fs/promises';
import { dirname, join, resolve, basename, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { buildPlanRequest, validatePlan, buildImageTask, imageModel, hash } from '../news-scene/planner.mjs';
import { resolveSceneLengthsInput } from '../../lib/generator/adapter/helpers/scene-generator.js';
import { renderReport, renderRunReport } from '../news-scene/report.mjs';
import { prepareImageReference } from '../news-scene/reference-images.mjs';
import { generateFluxKleinImage } from '../news-scene/huggingface-flux-klein.mjs';
import { buildTimingRequest, applySceneTiming, visualPlanSnapshot } from '../news-scene/scene-timing.mjs';
import { createSemanticSource } from '../news-scene/semantic-source.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const { values: options } = parseArgs({ options: {
  resume: { type: 'string' }, 'resume-run': { type: 'string' }, 'article-id': { type: 'string' }, 'article-order': { type: 'string', default: process.env.NEWS_ARTICLE_ORDER || 'linear' }, scenes: { type: 'string', default: '3' },
  iterations: { type: 'string', default: process.env.NEWS_MAX_ITERATIONS || '1' },
  'pause-ms': { type: 'string', default: process.env.NEWS_POLLING_TIME_MS || '5000' },
  'scene-length-takt': { type: 'string', default: process.env.NEWS_SCENE_LENGTH_TAKT || '4' },
  'scene-length-type': { type: 'string', default: process.env.NEWS_SCENE_LENGTH_TYPE || 'balanced' },
  'scene-length-multiplier': { type: 'string', default: process.env.NEWS_SCENE_LENGTH_MULTIPLIER || '1.15' },
  'scene-length-bias': { type: 'string', default: process.env.NEWS_SCENE_LENGTH_BIAS || '3.85' },
  'min-scene-seconds': { type: 'string', default: process.env.NEWS_MIN_SCENE_DURATION_SECONDS || '5' },
  'max-scene-seconds': { type: 'string', default: process.env.NEWS_MAX_SCENE_DURATION_SECONDS || '8' },
  words: { type: 'string' }, 'words-file': { type: 'string' },
  'stream-module': { type: 'string' }, 'stream-file': { type: 'string' }, 'stream-sequence-file': { type: 'string' },
  'news-dir': { type: 'string', default: join(root, 'eu-reski-news', 'news', 'A') },
  'output-dir': { type: 'string', default: process.env.NEWS_OUTPUT_DIR || join(root, 'eu-reski-news', 'GENERATIONS', 'news') },
  'guernica-dir': { type: 'string', default: process.env.GUERNICA_DIRECTORY || '/Users/eggermann/Projekte/EU-RESKI/guernica_elemente_maskiert' },
  'style-reference': { type: 'string', default: process.env.NEWS_STYLE_REFERENCE || '/Users/eggermann/Projekte/EU-RESKI/guernica-by-pablo-picasso.jpg!Large.jpg' },
  'image-provider': { type: 'string', default: process.env.NEWS_IMAGE_PROVIDER || 'runware' },
  'image-seed': { type: 'string' },
  'prompt-only': { type: 'boolean', default: false }, 'no-style-reference': { type: 'boolean', default: false }, 'article-image-reference': { type: 'boolean', default: false },
  'scene-visual-controls': { type: 'boolean', default: true }, 'fixed-visual-controls': { type: 'boolean', default: false },
  symbolic: { type: 'boolean', default: false }, 'no-symbolic': { type: 'boolean', default: false },
  'room-deepness': { type: 'boolean', default: false }, 'no-room-deepness': { type: 'boolean', default: false }, help: { type: 'boolean' },
  layering: { type: 'string', default: '0' },
} });
if (options.symbolic && options['no-symbolic']) throw new Error('Choose only one: --symbolic or --no-symbolic');
if (options['room-deepness'] && options['no-room-deepness']) throw new Error('Choose only one: --room-deepness or --no-room-deepness');
const layering = Number(options.layering);
if (!Number.isInteger(layering) || layering < 0 || layering > 7) throw new Error('--layering must be an integer from 0 through 7');
const imageSeedBase = options['image-seed'] === undefined ? null : Number(options['image-seed']);
if (imageSeedBase !== null && (!Number.isInteger(imageSeedBase) || imageSeedBase < 0 || imageSeedBase >= 2_147_483_647)) throw new Error('--image-seed must be an integer from 0 through 2147483646');
const recordStyleOptions = {
  symbolic: options['no-symbolic'] ? false : true,
  roomDeepness: options['room-deepness'] ? true : false,
  layering,
};
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
      visualStyleOptions: scene.visualStyleOptions || record.visualStyleOptions,
      visualControlReason: scene.visualControlReason || null,
      videoMode: 'singleImage', frameSource: 'providedStartImage',
      startImagePath: record.results[index]?.path ? resolve(directory, record.results[index].path) : null, stillPrompt: scene.stillPrompt,
      videoPrompt: scene.videoPrompt, singleImagePrompt: scene.stillPrompt,
    })),
  };
}

const sceneStaging = {
  wide_establishing: 'Use a wide, panoramic tableau. Place the protagonist in the left third, large enough to read clearly from head to waist; let one broad curved political divide sweep across the remaining space. Keep both arms below shoulder level.',
  intimate_close_up: 'Use a tight close-up of the fractured face and one shoulder, filling most of the frame. Turn the head into a strong three-quarter view; keep hands and other figures out of the foreground.',
  oblique_diagonal: 'Use a steep diagonal composition. Lean the torso across the frame and extend one arm sideways along the diagonal; do not lift both arms overhead.',
  high_angle: 'Look down from above. Show the protagonist seated or crouched and arranged diagonally across the ground plane, with hands close to the body and large curved masses around them.',
  low_angle: 'Look upward from near ground level. Show the protagonist stepping forward in a firm side stance, one arm crossing the chest; keep the head and body distinct against a tall curved backdrop.',
  profile_silhouette: 'Use a strict side profile facing right. Keep both arms lowered, separate the profile silhouette from the background with one dirty-ivory crescent, and avoid a frontal pose.',
  over_the_shoulder: 'View from behind one shoulder. Let the back of the protagonist occupy one foreground corner while their gaze leads toward the main event; do not show a frontal full-body pose.',
  foreground_frame: 'Frame the protagonist through a large curved foreground barrier. Place them off-center, pressing one hand against the barrier at chest height; do not use a raised-arms gesture.',
  top_down: 'Use a near-vertical overhead view. Arrange the protagonist as a compact diagonal figure amid broad circular and crescent forms; keep the face turned away from the viewer.',
};

function addDistinctSceneStaging(scenes, defaultVisualStyleOptions) {
  return scenes.map((scene) => {
    const visualStyleOptions = scene.visualStyleOptions || defaultVisualStyleOptions;
    const layeringInstruction = visualStyleOptions.layering > 0
      ? `LAYERING ${visualStyleOptions.layering}: build exactly ${visualStyleOptions.layering} readable spatial planes from foreground to far setting. Give each plane a distinct spatial role and article-grounded feature, such as a near threshold, the protagonist's active middle space, or receding architecture or terrain. Separate planes through overlap, changing scale, occlusion and tonal shifts, never borders or panels. Then apply one final unifying paint layer: shared charcoal marks, pigment, shadow bands and broken contours weave all planes into one coherent mural surface. This merge-paint pass must not look like stacked cut-outs or a collage.`
      : 'LAYERING 0: add no deliberate multi-plane room stack or extra spatial planes. Keep the existing composition simple; the room-deepness switch alone controls whether ordinary foreground, middle distance and far space appear. Use one unified painted surface, without a separate layer effect.';
    const cameraInstruction = visualStyleOptions.layering > 0
      ? `VISION-DRIVEN CAMERA: inspect the actual generated start image and derive one restrained, continuous camera path from its visible focal action and ${visualStyleOptions.layering} spatial planes. Let camera movement reveal or travel gently across those existing planes, then settle on the protagonist or central event. Follow visible perspective, occlusion, scale and direction; invent no off-frame setting, objects or actors.`
      : 'VISION-DRIVEN CAMERA: inspect the actual generated start image and derive one restrained, continuous camera move from its visible focal action, framing and directional lines. Do not assume hidden spatial planes or invent off-frame setting, objects or actors; settle on the protagonist or central event.';
    return {
      ...scene,
      stillPrompt: `${scene.stillPrompt}\n\nScene-specific staging: ${sceneStaging[scene.composition]} The protagonist reference supplies identity only: ignore its exact pose, raised arms, body silhouette, scale and placement. Make this pose and camera view clearly different from every other scene in this sequence. ${layeringInstruction} ${visualStyleOptions.symbolic
        ? 'SYMBOLISM ON: build one or two concrete, article-grounded visual metaphors into the action and spatial relationships. Make each metaphor legible through objects or forms changing, pressing, dividing or connecting the scene; avoid generic decoration, flags, maps, labels or arbitrary allegory.'
        : 'SYMBOLISM OFF: use no allegorical overlays, coded emblems or invented symbolic props. Show the article situation directly through concrete action, gesture, objects and relationships; keep cubist distortion in form and paint only.'} ${visualStyleOptions.roomDeepness
        ? 'ROOM DEEPNESS ON: create convincing painterly spatial depth with a near foreground, active middle distance and clearly receding far plane. Use overlapping architecture, floor or terrain, thresholds and changing scale to lead the eye inward; keep the room or setting relevant to this article. Depth stays hand-painted and cubist, never photographic.'
        : 'ROOM DEEPNESS OFF: keep the scene as a shallow mural plane with overlapping forms and compressed space. Avoid corridors, vanishing points, deep rooms and receding realistic backgrounds.'}${options['article-image-reference'] ? ' Reference image 1 is the selected masked figure; redraw its abstract protagonist identity, never paste it. Reference image 2 is the article photograph for subject matter only; ignore its colors, realism, lighting, photographic texture, framing, poses and identifiable faces. Redraw the underlying event as fictional cubist forms using only black, white and gray; never reproduce a real person, photo composition, logos or text.' : ''}`,
      ...(scene.videoPrompt ? { videoPrompt: `${scene.videoPrompt}\n\n${cameraInstruction}` } : {}),
    };
  });
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
    if (!actualSceneIndices.length) {
      corrections.push({ streamId, motif: entry.visualMotif, from: assignedSceneIndices, to: [], reason: 'Motif absent from all still prompts; mark stream entry not relevant.' });
      entry.relevance = 'not_relevant';
      entry.relatedSceneIndices = [];
      entry.visualMotif = '';
      entry.visibleConsequence = `The proposed visual motif “${entry.visualMotif || motif}” is absent from every scene prompt, so it is omitted rather than presented as visible.`;
      continue;
    }
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
  const existing = await readdir(directory);
  const highest = existing.reduce((maximum, name) => {
    const match = /^iteration-(\d+)$/.exec(name);
    return match ? Math.max(maximum, Number(match[1])) : maximum;
  }, 0);
  for (let index = highest + 1; index < 10000; index += 1) {
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

function createSceneDurationStream() {
  const takt = Number(options['scene-length-takt']);
  const minimum = Number(options['min-scene-seconds']);
  const maximum = Number(options['max-scene-seconds']);
  if (!Number.isInteger(minimum) || minimum < 5 || !Number.isInteger(maximum) || maximum < minimum || maximum > 15) {
    throw new Error('Scene duration bounds must satisfy 5 <= minimum <= maximum <= 15 seconds');
  }
  if (takt === -1) {
    return {
      next: () => null,
      generate: async () => null,
      settings: { provider: 'GPT dramatic pacing', takt: -1, minimum, maximum, type: 'dramatic-arc', scaler: 'GPT chooses scene duration from story tension and dramatic progression' },
    };
  }
  const multiplier = Number(options['scene-length-multiplier']);
  const bias = Number(options['scene-length-bias']);
  if (!Number.isFinite(takt) || takt <= 0 || !Number.isFinite(multiplier) || multiplier <= 0 || !Number.isFinite(bias)) {
    throw new Error('Invalid Taktmuster duration settings; use --scene-length-takt=-1 for GPT dramatic pacing');
  }
  const localRequire = createRequire(import.meta.url);
  let Taktmuster;
  try {
    ({ Taktmuster } = localRequire('taktmuster'));
  } catch (error) {
    if (error.code !== 'MODULE_NOT_FOUND') throw error;
    const gitCommonDirectory = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd: root, encoding: 'utf8' }).trim();
    ({ Taktmuster } = createRequire(join(dirname(gitCommonDirectory), 'package.json'))('taktmuster'));
  }
  const taktmuster = new Taktmuster();
  taktmuster.setTakt(takt, 4, 4);
  taktmuster.setType(options['scene-length-type']);
  const nextPatternLength = () => {
    const step = taktmuster.getNext();
    const value = Number(step?.patternValue ?? step);
    return Number.isFinite(value) && value > 0 ? value : 3;
  };
  return {
    next: nextPatternLength,
    generate: async (sceneCount) => {
      const pattern = await resolveSceneLengthsInput(nextPatternLength, sceneCount, 3);
      return pattern.map((value) => {
        const selfomatFloor = Math.max(1, Number(value) || 3);
        const scaled = Number((selfomatFloor * multiplier).toFixed(2));
        const biased = Number((scaled + bias).toFixed(2));
        return Math.max(minimum, Math.min(maximum, Math.round(biased)));
      });
    },
    settings: { provider: 'Selfomat Taktmuster scene-length generator', takt, meter: '4/4', type: options['scene-length-type'], scaler: 'quality floor → multiplier → bias → duration clamp', multiplier, bias, minimum, maximum },
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
    console.log('node --env-file=.env eu-reski-news/scripts/run-news-scene-image-iteration.mjs [--iterations=1|0|-1] [--pause-ms=5000] [--scenes=1..7] [--article-order=linear|random] [--news-dir=PATH] [--scene-length-takt=4|-1] [--scene-length-type=balanced] [--scene-length-multiplier=1.15] [--scene-length-bias=3.85] [--min-scene-seconds=5] [--max-scene-seconds=8] [--output-dir=PATH] [--article-id=ID] [--style-reference=PATH] [--no-style-reference] [--article-image-reference] [--symbolic|--no-symbolic] [--room-deepness|--no-room-deepness] [--layering=0..7] [--scene-visual-controls|--fixed-visual-controls] [--words=EU,Frieden] [--words-file=words.json] [--stream-file=snapshot.json] [--stream-sequence-file=sequence.json] [--prompt-only] [--resume=/absolute/iteration-path] [--resume-run=/absolute/run-path]\nLinear starts at the first eligible article for each new run and advances once per iteration, wrapping at the end. Random draws a new eligible article each iteration. --article-id overrides either mode. 0 or -1 iterations means endless. --scene-length-takt=-1 lets GPT choose each scene duration from the dramatic arc, bounded by --min-scene-seconds and --max-scene-seconds; positive takt values keep the Selfomat Taktmuster scaler. Semantic and Taktmuster streams stay open across iterations. By default GPT independently chooses symbolism, room depth and layering for each scene; --fixed-visual-controls applies the CLI settings uniformly. Every scene sends the selected masked figure for protagonist identity; the complete painting is optional and supplies style only. --article-image-reference (with --no-style-reference) also sends news photo for visual orientation only. Saved settings stay fixed when resuming. Output: eu-reski-news/GENERATIONS/news/.');
    return;
  }
  if (options['stream-file'] && options['stream-sequence-file']) throw new Error('Choose one semantic snapshot or one semantic sequence');
  if (options.resume && options['resume-run']) throw new Error('Use either --resume or --resume-run, not both');
  if (options.resume && ['words', 'words-file', 'stream-file', 'stream-sequence-file', 'stream-module', 'article-id'].some((key) => options[key])) throw new Error('Resume reuses saved article and semantic inputs; do not override them');
  const iterationLimit = Number(options.iterations);
  if (!Number.isInteger(iterationLimit) || iterationLimit < -1) throw new Error('Use --iterations=N, --iterations=0 or --iterations=-1');
  const pauseMilliseconds = Number(options['pause-ms']);
  if (!Number.isInteger(pauseMilliseconds) || pauseMilliseconds < 0) throw new Error('--pause-ms must be a non-negative integer');
  if (options.resume && iterationLimit !== 1) throw new Error('--resume only supports one iteration');
  const sceneCount = Number(options.scenes);
  if (!Number.isInteger(sceneCount) || sceneCount < 1 || sceneCount > 7) throw new Error('Use --scenes=1 through 7');
  if (!['linear', 'random'].includes(options['article-order'])) throw new Error('Use --article-order=linear or --article-order=random');
  if (options['article-image-reference'] && !options['no-style-reference']) throw new Error('Use --article-image-reference together with --no-style-reference; FLUX receives figure and article photo references');
  const openAiKey = process.env.OPENAI_API_KEY;
  const runwareKey = process.env.RUNWARE_API_KEY || process.env.RUNWARE_KEY;
  const imageProvider = options['image-provider'];
  if (!['runware', 'hf-flux-klein'].includes(imageProvider)) throw new Error('Use --image-provider=runware or --image-provider=hf-flux-klein');
  if (!openAiKey || (!options['prompt-only'] && imageProvider === 'runware' && !runwareKey)) throw new Error('Set OPENAI_API_KEY and RUNWARE_API_KEY in your environment');
  if (!options['prompt-only'] && imageProvider === 'hf-flux-klein' && !(process.env.HF_TOKEN || process.env.HF_API_TOKEN || process.env.HUGGINGFACEHUB_API_TOKEN)) throw new Error('Set OPENAI_API_KEY and HF_TOKEN (or HF_API_TOKEN) in your environment');
  const semanticSource = options.resume ? null : await createSemanticSource(options);
  const sceneDurations = createSceneDurationStream();
  const endless = iterationLimit === 0 || iterationLimit === -1;
  const groupedRun = Boolean(options['resume-run']) || endless || iterationLimit > 1;
  const iterationRoot = options.resume
    ? null
    : options['resume-run']
      ? resolve(options['resume-run'])
    : groupedRun
      ? await allocateRunDirectory(resolve(options['output-dir']))
      : resolve(options['output-dir']);
  const runManifest = options['resume-run'] ? await json(join(iterationRoot, 'run.json')) : groupedRun ? {
    profile: process.env.NEWS_PROFILE || 'EU-RESKI Ausstellung',
    startedAt: new Date().toISOString(),
    iterationLimit: endless ? 'endless' : iterationLimit,
    pauseMilliseconds,
    status: 'running',
    iterations: [],
  } : null;
  const previouslyCompleted = runManifest?.iterations.length || 0;
  if (options['resume-run'] && (!Array.isArray(runManifest.iterations) || previouslyCompleted >= iterationLimit)) {
    throw new Error('Run already has requested iterations or has invalid manifest');
  }
  if (runManifest) {
    if (!runManifest.visualControls && options['resume-run'] && previouslyCompleted > 0) {
      const previous = await json(join(iterationRoot, runManifest.iterations[0].directory, 'record.json'));
      runManifest.visualControls = {
        sceneSpecific: previous.sceneVisualControls ?? false,
        defaults: previous.visualStyleOptions || recordStyleOptions,
      };
    }
    if (runManifest.visualControls) {
      options['scene-visual-controls'] = runManifest.visualControls.sceneSpecific;
      options['fixed-visual-controls'] = !runManifest.visualControls.sceneSpecific;
      Object.assign(recordStyleOptions, runManifest.visualControls.defaults);
    } else {
      runManifest.visualControls = {
        sceneSpecific: options['scene-visual-controls'] && !options['fixed-visual-controls'],
        defaults: { ...recordStyleOptions },
      };
    }
  }
  if (runManifest) {
    runManifest.iterationLimit = endless ? 'endless' : iterationLimit;
    runManifest.status = 'running';
    delete runManifest.finishedAt;
  }
  if (runManifest) {
    await save(join(iterationRoot, 'run.json'), runManifest);
    console.log(`Run folder: ${iterationRoot}`);
  }
  for (let iteration = 0; iteration < previouslyCompleted; iteration += 1) {
    await semanticSource?.next();
    for (let scene = 0; scene < sceneCount; scene += 1) sceneDurations.next();
  }
  let completed = previouslyCompleted;
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
  if (!Number.isInteger(sceneCount) || sceneCount < 1 || sceneCount > 7) throw new Error('Use --scenes=1 through 7');
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
        generator: 'semantic-news-v1', planningVersion: 2, createdAt: new Date().toISOString(), status: 'preparing',
        sourceVersion: {
          commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
          branch: execFileSync('git', ['branch', '--show-current'], { cwd: root, encoding: 'utf8' }).trim(),
          clean: !execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], { cwd: root, encoding: 'utf8' }).trim(),
        },
        sourceAggregate, aggregateHash: hash(await readFile(sourceAggregate)),
        selection: { method: options['article-id'] ? 'article-id' : order, order, draw, candidateCount: candidates.length, aggregateIndex: index },
        article, sceneCount, imageProvider, articleImageReference: options['article-image-reference'], visualStyleOptions: recordStyleOptions, storyModel: process.env.NEWS_STORY_MODEL || 'gpt-4.1-mini', imageModel: imageProvider === 'hf-flux-klein' ? 'FLUX 3 Image Klein · ZeroGPU' : imageModel,
        sceneVisualControls: options['scene-visual-controls'] && !options['fixed-visual-controls'],
        guernicaDirectory: resolve(options['guernica-dir']), results: [],
        imageSeed: imageSeedBase === null ? null : (imageSeedBase + iterationIndex * sceneCount) % 2_147_483_647,
      };
    }
    await mkdir(join(directory, 'media'), { recursive: true });
    // Old saved requests retain their original combined planning path on resume.
    if (!record.planningVersion && !record.plan && !await exists(join(directory, 'gpt-request.json'))) record.planningVersion = 2;
    if (!Object.hasOwn(record, 'sceneDurations')) {
      record.sceneDurations = record.plan?.scenes?.map((scene) => scene.durationSeconds)
        || await sceneDurationStream.generate(sceneCount);
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
      const built = await buildPlanRequest({ article: record.article, semantic: record.semantic, catalog: record.catalog, sceneCount: record.sceneCount, visualStyleOptions: record.visualStyleOptions || recordStyleOptions, sceneVisualControls: record.sceneVisualControls ?? false, images, model: record.storyModel, styleReferenceProvided: !options['no-style-reference'], articleImageReferenceProvided: record.articleImageReference, continuationPlan: record.continuationPlan || null });
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
        record.plan = validatePlan(aligned.response, { ...record, visualOnly: record.planningVersion === 2, continuationPlan: record.continuationPlan || null, sceneVisualControls: record.sceneVisualControls ?? false });
      } catch (error) {
        if (!/semantic|motif|crocodile|protagonist|composition|figure|reference|visual control/i.test(error.message)) throw error;
        const revisionRequest = {
          ...request,
          messages: [
            ...request.messages,
            { role: 'assistant', content: raw.choices?.[0]?.message?.content || '' },
            { role: 'user', content: [{ type: 'text', text: [
              `Your plan failed validation: ${error.message}`,
              record.planningVersion === 2
                ? 'Revise the visual plan once. Do not assign durations or write video prompts. Every stillPrompt must be entirely natural English.'
                : 'Revise the whole plan once. Every stillPrompt and videoPrompt must be entirely natural English.',
              'Translate source-language article details and semantic words; never copy foreign-language terms into model prompts. For each relevant semantic entry, use a short, concrete English visualMotif phrase, repeat that exact phrase verbatim in every assigned stillPrompt, and show it as a visible action or object. Do not claim a word matters just because it repeats an article fact. Mark unrelated entries not_relevant with a concise reason.',
              'Keep one invented protagonist name and stable written visual identity for the entire scene sequence. Every protagonistAction must include the exact protagonist name. Choose a valid masked figure reference separately for each scene to match its unique gesture and body shape; avoid repeating a reference in neighboring scenes and use at least three different references across the sequence. Every selectionReason must explain visual fit without importing the figure source story. Assign a different composition choice to each scene, and change camera angle, distance, framing, body silhouette, and main action. The image model must ignore each reference crop’s exact pose, scale and placement.',
              record.sceneVisualControls ? 'For every scene, include its own visualStyleOptions object (symbolic boolean, roomDeepness boolean, layering integer 0–7) and visualControlReason of at least 20 characters. Decide values from that scene’s story beat, action and setting; do not repeat one run-wide setting without a scene-specific reason. The stillPrompt must implement those choices.' : '',
              'The crocodile is optional. Include it only if its action makes sense as a metaphor; never add it as an edge decoration.',
              record.articleImageReference
                ? 'Each image API request receives two images: reference 1 is the selected masked figure, used only for the fictional protagonist’s abstract appearance and gesture; reference 2 is the original article photo, used only for broad visual orientation. Do not reproduce its identifiable people, exact composition, logos, or text. No complete painting reference is supplied; follow the written style description. Redraw reference 1 into the scene; never paste either reference. Do not import the figure’s original story, props, or symbols. Keep protagonist prominent. Do not copy real-person likenesses, crests, logos, brands, or readable lettering.'
                : options['no-style-reference']
                  ? 'The image API receives only reference image 1: the selected masked figure, used only for the fictional protagonist’s abstract appearance and gesture. No complete painting reference is supplied; follow the written style description. Redraw reference 1 fully in the scene; never paste it. Do not import the figure’s original story, props, or symbols. The article photo is for GPT analysis only, never sent to the image API. Keep protagonist prominent. Do not copy real-person likenesses, crests, logos, brands, or readable lettering.'
                  : 'Each image API request receives two images: reference 1 is the selected masked figure, used only for the fictional protagonist’s abstract appearance and gesture; reference 2 is the complete painting, used only for style. Redraw reference 1 fully in the scene; never paste it. Do not import the figure’s original story, props, or symbols. Reference 2 contributes painterly style only. The article photo is for GPT analysis only, never sent to the image API. Keep protagonist prominent. Do not copy real-person likenesses, crests, logos, brands, or readable lettering.',
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
        record.plan = validatePlan(aligned.response, { ...record, visualOnly: record.planningVersion === 2, continuationPlan: record.continuationPlan || null, sceneVisualControls: record.sceneVisualControls ?? false });
        record.planRevisionReason = error.message;
        finalResponse = revised;
      }
      record.plan.scenes = addDistinctSceneStaging(record.plan.scenes, record.visualStyleOptions || recordStyleOptions);
      if (record.planningVersion === 2) {
        const visualPlan = visualPlanSnapshot(record.plan);
        record.visualPlanHash = hash(JSON.stringify(visualPlan));
        await save(join(directory, 'visual-plan.json'), visualPlan);
      } else {
        record.plan.scenes = record.plan.scenes.map((scene, index) => ({ ...scene, durationSeconds: record.sceneDurations ? record.sceneDurations[index] : scene.durationSeconds }));
      }
      record.usage = finalResponse.usage;
      record.planHash = hash(JSON.stringify(record.plan));
      await save(join(directory, 'scene-plan.json'), record.plan);
      await persist();
    }
    if (hash(JSON.stringify(record.plan)) !== record.planHash) throw new Error('Saved plan has changed; use a new iteration');
    if (record.planningVersion === 2) {
      if (hash(JSON.stringify(visualPlanSnapshot(record.plan))) !== record.visualPlanHash) throw new Error('Locked visual plan has changed');
      if (!record.sceneTiming) {
        const timingPath = join(directory, 'timing-request.json');
        if (!await exists(timingPath)) {
          await save(timingPath, buildTimingRequest({
            plan: record.plan, sceneDurations: record.sceneDurations,
            sceneDurationSettings: record.sceneDurationSettings,
            visualStyleOptions: record.visualStyleOptions, sceneVisualControls: record.sceneVisualControls ?? false, model: record.storyModel,
          }));
        }
        console.log('Visual plan locked; generating scene durations and video prompts separately.');
        const timingResponse = await paidRequest(directory, 'timing', 'https://api.openai.com/v1/chat/completions', openAiKey, await json(timingPath));
        if (timingResponse.error) throw new Error(`GPT timing error: ${timingResponse.error.message}`);
        const timed = applySceneTiming(record.plan, timingResponse, record);
        const checkedPlan = validatePlan({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(timed.plan) } }] }, record);
        if (hash(JSON.stringify(visualPlanSnapshot(checkedPlan))) !== record.visualPlanHash) throw new Error('Timing changed the locked visual plan');
        record.plan = checkedPlan;
        record.sceneTiming = timed.timing;
        record.sceneDurations = record.plan.scenes.map((scene) => scene.durationSeconds);
        record.storyUsage = record.usage;
        record.timingUsage = timingResponse.usage;
        record.usage = Object.fromEntries(['prompt_tokens', 'completion_tokens', 'total_tokens'].map((key) => [key, (record.storyUsage?.[key] || 0) + (record.timingUsage?.[key] || 0)]));
        record.planHash = hash(JSON.stringify(record.plan));
        await save(join(directory, 'scene-plan.json'), record.plan);
        await persist();
      }
    }
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
        const articleInput = record.articleImageReference
          ? await prepareImageReference(directory, await imageInput(directory, record.articleImage, 'Original article photograph for broad visual orientation only; do not reproduce identifiable people, logos, or text', 'article'))
          : null;
        const referenceImages = [figureInput.dataUrl, ...(articleInput ? [articleInput.dataUrl] : styleInput ? [styleInput.dataUrl] : [])];
        const task = log ? { ...log, inputs: { referenceImages } } : buildImageTask(scene, randomUUID(), referenceImages);
        if (!log && record.imageSeed !== null && record.imageSeed !== undefined) task.seed = (record.imageSeed + index) % 2_147_483_647;
        if (log && log.positivePrompt !== scene.stillPrompt) throw new Error('Saved image prompt differs from GPT plan');
        const referencePaths = [figureInput.path, ...(articleInput ? [articleInput.path] : styleInput ? [styleInput.path] : [])];
        log = { ...task, inputs: { referenceImages: referencePaths } };
        await save(requestPath, log);
        console.log(`Scene ${scene.index}: GPT prompt → ${record.imageModel}`);
        let output;
        let result;
        if (imageProvider === 'hf-flux-klein') {
          result = await generateFluxKleinImage({ prompt: scene.stillPrompt, referencePaths: referencePaths.map((path) => join(directory, path)), token: process.env.HF_TOKEN || process.env.HF_API_TOKEN || process.env.HUGGINGFACEHUB_API_TOKEN, directory, name, seed: task.seed ?? randomInt(2_147_483_647) });
          output = await download(result.imageUrl, directory, `scene-${scene.index}-first-frame`);
        } else {
          const raw = await paidRequest(directory, name, 'https://api.runware.ai/v1', runwareKey, [task]);
          if (raw.errors?.length) throw new Error(`Runware: ${raw.errors.map((error) => error.message || error.code).join('; ')}`);
          result = raw.data?.find((item) => item.taskUUID === task.taskUUID && item.imageURL);
          if (!result) throw new Error('Runware returned no matching image; saved response retained');
          output = await download(result.imageURL, directory, `scene-${scene.index}-first-frame`);
        }
        record.results[index] = { ...output, provider: imageProvider, taskUUID: result.taskUUID || result.eventId, seed: result.seed, cost: result.cost ?? null, billing: imageProvider === 'hf-flux-klein' ? 'ZeroGPU quota/credits; exact GPU seconds not reported by Space' : 'provider-reported', promptHash: hash(scene.stillPrompt), referencePaths, referenceMetadata: [figureInput, ...(articleInput ? [articleInput] : styleInput ? [styleInput] : [])].map(({ dataUrl, ...metadata }) => metadata) };
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
