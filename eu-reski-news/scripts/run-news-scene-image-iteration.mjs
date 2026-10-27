import { randomInt, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, readdir, writeFile, rename, stat, unlink } from 'node:fs/promises';
import { dirname, join, resolve, basename, extname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { buildPlanRequest, validatePlan, buildImageTask, imageModel, hash } from '../news-scene/planner.mjs';
import { resolveSceneLengthsInput } from '../../lib/generator/adapter/helpers/scene-generator.js';
import { renderReport, renderRunReport } from '../news-scene/report.mjs';
import { prepareImageReference } from '../news-scene/reference-images.mjs';
import { generateFluxKleinImage } from '../news-scene/huggingface-flux-klein.mjs';
import { buildTimingRequest, applySceneTiming, visualPlanSnapshot } from '../news-scene/scene-timing.mjs';
import { createSemanticSource } from '../news-scene/semantic-source.mjs';
import { createSceneCountStream, resolveSceneCountSettings } from '../news-scene/scene-count.mjs';
import { loadTaktmuster } from '../news-scene/taktmuster.mjs';
import { buildVideoVisionRequest, validateVideoVisionResponse, videoVisionPromptVersion } from '../news-scene/video-vision.mjs';
import { buildGrokVideoPrompt, buildVideoDirectionRequest, validateVideoDirectionResponse, videoDirectionInputHash, videoDirectorPromptVersion } from '../news-scene/video-director.mjs';
import { audioDirectionInputHash, audioDirectorPromptVersion, buildAudioDirectionRequest, buildAudioPrompt, validateAudioDirectionResponse } from '../news-scene/audio-director.mjs';
import { isRetryableHttpStatus, isRetryableNetworkError, retryDelayMs, retryTransient } from '../news-scene/provider-resilience.mjs';
import { findRankedNewsCollections } from '../news-scene/news-ranking.mjs';
import { renderTitleCard } from '../news-scene/title-card.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const { values: options } = parseArgs({ options: {
  resume: { type: 'string' }, 'resume-run': { type: 'string' }, 'article-id': { type: 'string' }, 'article-order': { type: 'string', default: process.env.NEWS_ARTICLE_ORDER || 'linear' }, scenes: { type: 'string', default: '3' },
  'story-model': { type: 'string', default: process.env.NEWS_STORY_MODEL || 'gpt-6-luna' },
  iterations: { type: 'string', default: process.env.NEWS_MAX_ITERATIONS || '1' },
  'pause-ms': { type: 'string', default: process.env.NEWS_POLLING_TIME_MS || '5000' },
  'scene-count-mode': { type: 'string', default: process.env.NEWS_SCENE_COUNT_MODE || 'taktmuster' },
  'scene-count-takt': { type: 'string', default: process.env.NEWS_SCENE_COUNT_TAKT || '2' },
  'scene-count-numerator': { type: 'string', default: process.env.NEWS_SCENE_COUNT_NUMERATOR || '3' },
  'scene-count-denominator': { type: 'string', default: process.env.NEWS_SCENE_COUNT_DENOMINATOR || '4' },
  'scene-count-type': { type: 'string', default: process.env.NEWS_SCENE_COUNT_TYPE || 'balanced' },
  'scene-count-bias': { type: 'string', default: process.env.NEWS_SCENE_COUNT_BIAS || '2' },
  'min-scenes': { type: 'string', default: process.env.NEWS_MIN_SCENES || '1' },
  'max-scenes': { type: 'string', default: process.env.NEWS_MAX_SCENES || '12' },
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
  'prompt-only': { type: 'boolean', default: false }, 'no-style-reference': { type: 'boolean', default: false }, 'article-image-reference': { type: 'boolean', default: false }, 'no-article-image-reference': { type: 'boolean', default: false }, 'article-image-only-reference': { type: 'boolean', default: false }, 'guernica-location-reference': { type: 'boolean', default: false }, 'no-guernica-location-reference': { type: 'boolean', default: false },
  'preserve-cubist-video-style': { type: 'boolean', default: false }, 'no-preserve-cubist-video-style': { type: 'boolean', default: false },
  'landscape-prompt': { type: 'boolean', default: false }, 'no-landscape-prompt': { type: 'boolean', default: false },
  'scene-visual-controls': { type: 'boolean', default: true }, 'fixed-visual-controls': { type: 'boolean', default: false },
  'story-clou': { type: 'string', default: 'off' }, 'video-direction': { type: 'string', default: 'off' },
  'video-mode': { type: 'string', default: 'auto' }, 'video-vision': { type: 'string', default: 'auto' },
  'video-audio-direction': { type: 'string', default: process.env.NEWS_VIDEO_AUDIO_DIRECTION || 'off' }, 'video-max-zoom': { type: 'string', default: process.env.NEWS_VIDEO_MAX_ZOOM || '0.08' },
  'videos-after-each-iteration': { type: 'boolean', default: false },
  'generate-title-cards': { type: 'boolean', default: false },
  'no-generate-title-cards': { type: 'boolean', default: false },
  'video-model': { type: 'string', default: 'prunaai:p-video@2-pro' },
  'video-resolution': { type: 'string', default: '480p' },
  'video-settings-mode': { type: 'string', default: 'cost' },
  symbolic: { type: 'boolean', default: false }, 'no-symbolic': { type: 'boolean', default: false },
  'room-deepness': { type: 'boolean', default: false }, 'no-room-deepness': { type: 'boolean', default: false }, help: { type: 'boolean' },
  layering: { type: 'string', default: '0' },
} });
if (options['generate-title-cards'] && options['no-generate-title-cards']) {
  throw new Error('Choose only one: --generate-title-cards or --no-generate-title-cards');
}
if (options['no-generate-title-cards']) options['generate-title-cards'] = false;
if (options['guernica-location-reference'] && options['no-guernica-location-reference']) {
  throw new Error('Choose only one: --guernica-location-reference or --no-guernica-location-reference');
}
if (options['no-guernica-location-reference']) {
  options['guernica-location-reference'] = false;
}
if (options['article-image-reference'] && options['no-article-image-reference']) {
  throw new Error('Choose only one: --article-image-reference or --no-article-image-reference');
}
if (options['no-article-image-reference']) options['article-image-reference'] = false;
if (options['preserve-cubist-video-style'] && options['no-preserve-cubist-video-style']) {
  throw new Error('Choose only one: --preserve-cubist-video-style or --no-preserve-cubist-video-style');
}
if (options['no-preserve-cubist-video-style']) options['preserve-cubist-video-style'] = false;
if (options['landscape-prompt'] && options['no-landscape-prompt']) {
  throw new Error('Choose only one: --landscape-prompt or --no-landscape-prompt');
}
if (options['no-landscape-prompt']) options['landscape-prompt'] = false;
if (options['article-image-only-reference']) {
  options['article-image-reference'] = true;
  options['no-style-reference'] = true;
}
const storyModel = options['story-model'].trim();
if (!storyModel) throw new Error('--story-model must not be empty');
if (options.symbolic && options['no-symbolic']) throw new Error('Choose only one: --symbolic or --no-symbolic');
if (options['room-deepness'] && options['no-room-deepness']) throw new Error('Choose only one: --room-deepness or --no-room-deepness');
for (const flag of ['story-clou', 'video-direction', 'video-vision']) {
  if (flag === 'video-vision' && options[flag] === 'auto') options[flag] = options['video-direction'] === 'on' ? 'on' : 'off';
  if (!['on', 'off'].includes(options[flag])) throw new Error(`--${flag} must be on or off`);
}
if (!['auto', 'image_to_video', 'first_last_frame'].includes(options['video-mode'])) throw new Error('--video-mode must be auto, image_to_video or first_last_frame');
if (options['video-vision'] === 'on' && options['video-direction'] !== 'on') throw new Error('--video-vision=on requires --video-direction=on');
if (!['on', 'off'].includes(options['video-audio-direction'])) throw new Error('--video-audio-direction must be on or off');
const getMaxVideoZoom = () => Number(options['video-max-zoom']);
if (!Number.isFinite(getMaxVideoZoom()) || getMaxVideoZoom() < 0 || getMaxVideoZoom() > 0.3) throw new Error('--video-max-zoom must be from 0 through 0.3 (fraction of frame)');
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
const articleImageChecks = new Map();
async function hasUsableArticleImage(url) {
  if (articleImageChecks.has(url)) return articleImageChecks.get(url);
  const check = (async () => {
    if (!/^https?:\/\//i.test(url || '')) return false;
    let imagePath;
    try { imagePath = decodeURIComponent(new URL(url).pathname).toLowerCase(); } catch { return false; }
    if (/(?:^|[-_/])(?:fallback|placeholder|no[-_]?image|default[-_]?(?:image|photo))(?=$|[-_/.])/.test(imagePath)) return false;
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
      const mimeType = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
      await response.body?.cancel().catch(() => {});
      return response.ok && ['image/jpeg', 'image/png', 'image/webp'].includes(mimeType);
    } catch {
      return false;
    }
  })();
  articleImageChecks.set(url, check);
  return check;
}
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

const cubistVideoStyleLock = 'P-VIDEO STYLE LOCK: Keep every figure visibly painted as a distorted, fragmented cubist mural form, with angular planes, charcoal and chalk marks, rough pigment and the supplied start image’s monochrome palette. Preserve the existing figures’ identity, silhouette, proportions, pose and placement. Animate only restrained changes within the established painted composition. Do not turn figures into lifelike people; add no realistic faces, natural skin, realistic eyes, lifelike bodies, extra people, detailed clothing or newly invented props and background. Do not smooth, clarify or complete abstract forms.';

function preservePVideoStyle(prompt) {
  if (!options['preserve-cubist-video-style'] || !prompt || prompt.includes('P-VIDEO STYLE LOCK:')) return prompt;
  return `${prompt}\n\n${cubistVideoStyleLock}`;
}

function buildFilmPlan(record, directory) {
  return {
    formatVersion: record.videoDirection ? 4 : 1,
    sourceIteration: directory,
    sourceCommit: record.sourceVersion?.commit || null,
    article: { title: record.article.title, url: record.article.url, publish_date: record.article.publish_date },
    status: 'Film-Prompts bereit; keine Film-API aufgerufen',
    promptOrigin: 'GPT-generated from article, semantic stream, story beat and still plan',
    instructions: 'Pass scenePlan to the film generator. Use each scene’s videoMode as selected by GPT. image_to_video uses startImagePath. first_last_frame requires both start and separately supplied final image; never downgrade it to image-to-video.',
    scenePlan: record.plan.scenes.map((scene, index) => {
      const videoDirection = record.videoDirection?.scenes?.[index];
      const videoMode = videoDirection?.videoMode || 'singleImage';
      return ({
      index: scene.index, title: scene.title, beat: scene.storyBeat, storyBeat: scene.storyBeat,
      durationSeconds: scene.durationSeconds, requestedDurationSeconds: scene.durationSeconds,
      visualStyleOptions: scene.visualStyleOptions || record.visualStyleOptions,
      visualControlReason: scene.visualControlReason || null,
      videoMode, frameSource: videoMode === 'first_last_frame' ? 'firstAndRequiredLastFrame' : 'providedStartImage',
      startImagePath: record.results[index]?.path ? resolve(directory, record.results[index].path) : null, stillPrompt: scene.stillPrompt,
      videoPrompt: preservePVideoStyle(`${record.videoDirection?.scenes?.[index]
        ? (record.videoDirection.scenes[index].finalVideoPrompt || buildGrokVideoPrompt({
          visualPrompt: record.videoDirection.scenes[index].videoPrompt,
          cameraMotion: record.videoDirection.scenes[index].motionPlan.cameraMotion,
          sceneAudio: record.videoDirection.scenes[index].sceneAudio,
          audioDirection: record.videoDirection.audioDirectionEnabled ? 'on' : 'off',
          maxZoom: record.videoDirection.maxZoom ?? 0.08,
        }))
        : scene.videoPrompt}${record.audioDirection?.scenes?.[index]
        ? `\n\n${buildAudioPrompt(record.audioDirection.scenes[index].sceneAudio, record.audioDirection.audioDirection)}` : ''}`),
      singleImagePrompt: scene.stillPrompt,
      ...(videoDirection ? { videoDirection } : {}),
    });
    }),
    ...(record.videoDirection ? {
      videoDirection: {
        version: record.videoDirection.version,
        status: record.videoDirection.status,
        audioDirectionEnabled: record.videoDirection.audioDirectionEnabled,
        audioDirection: record.videoDirection.audioDirection,
        maxZoom: record.videoDirection.maxZoom,
        overallDirection: record.videoDirection.overallDirection,
        provider: null,
        planPath: 'video-direction.json',
        scenes: record.videoDirection.scenes,
        sceneTransitions: record.videoDirection.sceneTransitions,
        motionPlanningVersion: record.videoDirection.promptVersion,
        instructions: 'Read videoDirection.scenes for optional refined motion plans. Keep each duration, videoMode and startImagePath unchanged. first_last_frame entries require a separately supplied final image; never silently treat them as single-image generation.',
      },
    } : {}),
  };
}

function currentFeatureSettings() {
  return {
    storyClou: options['story-clou'],
    videoDirection: options['video-direction'],
    videoMode: options['video-mode'],
    videoVision: options['video-vision'],
    videoAudioDirection: options['video-audio-direction'],
    videoMaxZoom: getMaxVideoZoom(),
    preserveCubistVideoStyle: options['preserve-cubist-video-style'],
    landscapePrompt: options['landscape-prompt'],
  };
}

function currentGenerationSettings() {
  return {
    articleOrder: options['article-order'],
    sceneTiming: {
      takt: Number(options['scene-length-takt']),
      type: options['scene-length-type'],
      multiplier: Number(options['scene-length-multiplier']),
      bias: Number(options['scene-length-bias']),
      minimum: Number(options['min-scene-seconds']),
      maximum: Number(options['max-scene-seconds']),
    },
    imageProvider: options['image-provider'],
    imageModel: options['image-provider'] === 'hf-flux-klein' ? 'FLUX 3 Image Klein · ZeroGPU' : imageModel,
    storyModel,
    articleImageReference: options['article-image-reference'],
    guernicaLocationReference: options['guernica-location-reference'],
    landscapePrompt: options['landscape-prompt'],
    guernicaFigureReference: !options['article-image-only-reference'],
    styleReferencePath: options['no-style-reference'] ? null : options['style-reference'],
    guernicaDirectory: options['article-image-only-reference'] ? null : resolve(options['guernica-dir']),
    sceneVisualControls: options['scene-visual-controls'] && !options['fixed-visual-controls'],
    visualStyleOptions: { ...recordStyleOptions },
    videosAfterEachIteration: options['videos-after-each-iteration'],
    generateTitleCards: options['generate-title-cards'],
    videoModel: options['video-model'],
    videoResolution: options['video-resolution'],
    videoSettingsMode: options['video-settings-mode'],
  };
}

function restoreFeatureSettings(settings) {
  if (!settings) return;
  options['story-clou'] = settings.storyClou || 'off';
  options['video-direction'] = settings.videoDirection || 'off';
  options['video-mode'] = settings.videoMode || 'auto';
  options['video-vision'] = settings.videoVision || 'off';
  options['video-audio-direction'] = settings.videoAudioDirection || 'off';
  options['video-max-zoom'] = String(settings.videoMaxZoom ?? 0.08);
  options['preserve-cubist-video-style'] = settings.preserveCubistVideoStyle === true;
  options['landscape-prompt'] = settings.landscapePrompt === true;
  if (!['on', 'off'].includes(options['story-clou']) || !['on', 'off'].includes(options['video-direction'])
    || !['on', 'off'].includes(options['video-vision']) || !['on', 'off'].includes(options['video-audio-direction'])
    || !['auto', 'image_to_video', 'first_last_frame'].includes(options['video-mode'])
    || !Number.isFinite(getMaxVideoZoom()) || getMaxVideoZoom() < 0 || getMaxVideoZoom() > 0.3) {
    throw new Error('Saved feature settings contain an unsupported story or video mode');
  }
  if (options['video-vision'] === 'on' && options['video-direction'] !== 'on') {
    throw new Error('Saved settings are invalid: video vision requires video direction');
  }
}

function applySceneVisualControls(scenes, defaultVisualStyleOptions) {
  return scenes.map((scene) => {
    const visualStyleOptions = scene.visualStyleOptions || defaultVisualStyleOptions;
    const basePrompt = scene.stillPrompt.split('\n\nPreserve the scene-specific action, framing and semantic motifs described above.')[0];
    const layeringInstruction = visualStyleOptions.layering > 0
      ? `LAYERING ${visualStyleOptions.layering}: use ${visualStyleOptions.layering} distinct, article-grounded planes; separate through overlap, scale and occlusion, then unify with shared paint marks.`
      : 'LAYERING 0: no deliberate stacked planes; keep one unified mural surface.';
    const cameraInstruction = visualStyleOptions.layering > 0
      ? `VISION-DRIVEN CAMERA: inspect the actual generated start image and derive one restrained, continuous camera path from its visible focal action and ${visualStyleOptions.layering} spatial planes. Let camera movement reveal or travel gently across those existing planes, then settle on the protagonist or central event. Follow visible perspective, occlusion, scale and direction; invent no off-frame setting, objects or actors.`
      : 'VISION-DRIVEN CAMERA: inspect the actual generated start image and derive one restrained, continuous camera move from its visible focal action, framing and directional lines. Do not assume hidden spatial planes or invent off-frame setting, objects or actors; settle on the protagonist or central event.';
    const baseVideoPrompt = scene.videoPrompt?.split('\n\nVISION-DRIVEN CAMERA:')[0];
    return {
      ...scene,
      stillPrompt: `${basePrompt}\n\nKeep this scene’s planned action, framing, semantic motifs and protagonist clear. ${options['article-image-only-reference'] ? 'Use the article photo only for broad subject orientation; invent the fictional protagonist and redraw the reported situation without copying identifiable people, pose, framing, logos or text.' : 'Redraw the masked figure reference in the scene’s own pose; do not paste it.'} ${options['guernica-location-reference'] ? 'GUERNICA LOCATION CUE: use the planner’s subtle setting and spatial-atmosphere details derived from Guernica. The full painting is supplied to the image API only as a secondary setting and spatial reference. Let the article-grounded scene action and the masked figure’s protagonist identity lead. Use Guernica only for broad background space and atmosphere; do not copy its figures, poses, composition, motifs or color balance. Make this new scene’s action and composition clearly distinct from Guernica.' : ''} ${layeringInstruction} ${visualStyleOptions.symbolic
        ? 'SYMBOLISM ON: weave concrete article-grounded metaphors into action and spatial relationships.'
        : 'SYMBOLISM OFF: show concrete action without allegorical overlays or coded props.'} ${visualStyleOptions.roomDeepness
        ? 'ROOM DEEPNESS ON: use a hand-painted foreground, active middle distance and receding far plane.'
        : 'ROOM DEEPNESS OFF: keep shallow compressed mural space; avoid deep realistic interiors.'}${options['article-image-reference'] ? ' Use article photo only for broad subject orientation; redraw fictional cubist forms, never copy people, pose, framing, logos or text.' : ''}`,
      ...(baseVideoPrompt ? { videoPrompt: preservePVideoStyle(`${baseVideoPrompt}\n\n${cameraInstruction}`) } : {}),
    };
  });
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
  if (!Number.isInteger(minimum) || minimum < 2 || !Number.isInteger(maximum) || maximum < minimum || maximum > 15) {
    throw new Error('Scene duration bounds must satisfy 2 <= minimum <= maximum <= 15 seconds');
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
  const Taktmuster = loadTaktmuster();
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

async function runwareTaskDetails(taskUUID, key) {
  const response = await retryTransient(() => fetch('https://api.runware.ai/v1', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify([{ taskType: 'getTaskDetails', taskUUID }]),
    signal: AbortSignal.timeout(60000),
  }), {
    attempts: 5,
    onRetry: ({ nextAttempt, delay }) => console.warn(`Runware task lookup retry ${nextAttempt}/5 in ${delay}ms`),
  });
  const body = await response.json();
  const task = body.data?.find((item) => item.taskUUID === taskUUID);
  if (task) return task.response || null;
  if (body.errors?.some((error) => error.code === 'taskNotFound')) return null;
  if (!response.ok || body.errors?.length) throw new Error(`Runware task lookup failed: ${JSON.stringify(body.errors || body).slice(0, 1000)}`);
  return null;
}

async function runwarePaidRequest(directory, name, url, key, request, pendingPath, existedBeforeStart) {
  const taskUUID = request[0]?.taskUUID;
  if (!taskUUID) throw new Error(`${name}: Runware request has no saved taskUUID`);
  let lastError = null;
  let inspectProviderHistory = existedBeforeStart;

  for (let attempt = 1; attempt <= 5; attempt += 1) {
    if (inspectProviderHistory) {
      const recovered = await runwareTaskDetails(taskUUID, key);
      if (recovered) {
        await save(join(directory, `${name}-response.json`), recovered);
        await unlink(pendingPath).catch(() => {});
        return recovered;
      }
    }

    try {
      const response = await fetch(url, {
        method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(request), signal: AbortSignal.timeout(240000),
      });
      const body = await response.json();
      if (isRetryableHttpStatus(response.status)) {
        lastError = new Error(`Runware HTTP ${response.status}`);
        if (attempt === 5) {
          await save(join(directory, `${name}-last-retryable-error.json`), body);
          throw lastError;
        }
        inspectProviderHistory = true;
      } else {
        await save(join(directory, `${name}-response.json`), body);
        await unlink(pendingPath).catch(() => {});
        if (!response.ok) throw new Error(`${name}: HTTP ${response.status}. See saved response.`);
        return body;
      }
    } catch (error) {
      if (!isRetryableNetworkError(error) || attempt === 5) throw error;
      lastError = error;
      inspectProviderHistory = true;
    }

    const delay = retryDelayMs(attempt);
    console.warn(`${name}: temporary provider/network failure; checking saved task and retrying ${attempt + 1}/5 in ${delay}ms`);
    await new Promise((resolveDelay) => setTimeout(resolveDelay, delay));
  }

  throw lastError || new Error(`${name}: retry limit reached`);
}

// Save the request marker first. Runware tasks are recovered by taskUUID; OpenAI retries reuse a stable trace ID.
async function paidRequest(directory, name, url, key, request) {
  const responsePath = join(directory, `${name}-response.json`);
  if (await exists(responsePath)) return json(responsePath);
  const pendingPath = join(directory, `${name}-pending.json`);
  const existedBeforeStart = await exists(pendingPath);
  let pending;
  if (existedBeforeStart) {
    pending = await json(pendingPath);
    pending.clientRequestId ||= randomUUID();
    pending.requestHash ||= hash(JSON.stringify(request));
    await save(pendingPath, pending);
  } else {
    pending = {
      startedAt: new Date().toISOString(),
      clientRequestId: randomUUID(),
      requestHash: hash(JSON.stringify(request)),
    };
    await writeFile(pendingPath, JSON.stringify(pending, null, 2), { flag: 'wx' });
  }
  if (pending.requestHash && pending.requestHash !== hash(JSON.stringify(request))) throw new Error(`${name}: saved retry request differs from the interrupted request`);

  if (url.includes('api.runware.ai')) {
    return runwarePaidRequest(directory, name, url, key, request, pendingPath, existedBeforeStart);
  }

  try {
    const response = await retryTransient(async () => {
      const result = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
          'X-Client-Request-Id': pending.clientRequestId,
        },
        body: JSON.stringify(request),
        signal: AbortSignal.timeout(240000),
      });
      if (isRetryableHttpStatus(result.status)) {
        const error = new Error(`${name}: temporary HTTP ${result.status}`);
        error.retryable = true;
        error.response = result;
        throw error;
      }
      return result;
    }, {
      attempts: 5,
      shouldRetry: (error) => error.retryable || isRetryableNetworkError(error),
      onRetry: ({ nextAttempt, delay }) => console.warn(`${name}: temporary network/provider failure; retry ${nextAttempt}/5 in ${delay}ms`),
    });
    const body = await response.json();
    await save(responsePath, body);
    await unlink(pendingPath).catch(() => {});
    if (!response.ok) throw new Error(`${name}: HTTP ${response.status}. See saved response.`);
    return body;
  } catch (error) {
    if (error.response) {
      const body = await error.response.json().catch(() => ({}));
      if (!isRetryableHttpStatus(error.response.status)) {
        await save(responsePath, body);
        await unlink(pendingPath).catch(() => {});
      } else {
        await save(join(directory, `${name}-last-retryable-error.json`), body);
      }
      throw new Error(`${name}: HTTP ${error.response.status}. See saved response.`);
    }
    throw new Error(`${name}: network outcome remains uncertain after retries. The saved request will be reused on resume (request id ${pending.clientRequestId}); duplicate provider work is possible if the provider completed without returning a response. Cause: ${error.message}`);
  }
}

function lockedVisualPlanHash(record) {
  return record.visualPlanHash || hash(JSON.stringify(visualPlanSnapshot(record.plan)));
}

function addUsage(record, field, usage) {
  record[field] = usage || null;
  if (!usage) return;
  const totals = ['prompt_tokens', 'completion_tokens', 'total_tokens'];
  record.usage = Object.fromEntries(totals.map((key) => [key, (record.usage?.[key] || 0) + (usage[key] || 0)]));
}

async function videoVisionSources(record, directory) {
  const available = [];
  const missing = [];
  for (const [index, scene] of record.plan.scenes.entries()) {
    const result = record.results[index];
    if (!result?.path || !await exists(join(directory, result.path))) {
      missing.push({ sceneIndex: scene.index, imagePath: result?.path || null, imageSha256: result?.sha256 || null });
      continue;
    }
    const loaded = await imageInput(directory, result, `Actual generated start image for scene ${scene.index}`, 'start-image');
    available.push({ sceneIndex: scene.index, path: loaded.path, sha256: loaded.sha256, dataUrl: loaded.dataUrl });
  }
  return { available, missing };
}

async function createVideoVision(record, directory, openAiKey, persist) {
  const model = process.env.NEWS_VIDEO_VISION_MODEL || record.storyModel;
  const { available, missing } = await videoVisionSources(record, directory);
  const sources = [...available.map(({ sceneIndex, path, sha256 }) => ({ sceneIndex, path, sha256 })), ...missing]
    .sort((left, right) => left.sceneIndex - right.sceneIndex);
  const inputHash = hash(JSON.stringify({
    promptVersion: videoVisionPromptVersion,
    visualPlanHash: lockedVisualPlanHash(record),
    images: sources,
    model,
  }));
  const outputPath = join(directory, 'video-vision.json');
  if (await exists(outputPath)) {
    const saved = await json(outputPath);
    if (saved.inputHash !== inputHash) throw new Error('Saved video vision is stale; start a new iteration to re-analyze changed inputs');
    record.videoVision = saved;
    return saved;
  }

  if (!available.length) {
    const unavailable = {
      version: 1, promptVersion: videoVisionPromptVersion, status: 'vision_unavailable', model, requestPath: null, responsePath: null, usage: null,
      sourceVisualPlanHash: lockedVisualPlanHash(record), inputHash, createdAt: new Date().toISOString(),
      images: sources,
      scenes: record.plan.scenes.map((scene) => ({ sceneIndex: scene.index, status: 'vision_unavailable', imagePath: null, imageSha256: null, observations: null })),
      explanation: 'No generated start images exist. Plan-only video direction may still be used; no image was analyzed.',
    };
    await save(outputPath, unavailable);
    record.videoVision = unavailable;
    await persist();
    return unavailable;
  }

  const requestPath = join(directory, 'video-vision-request.json');
  let request;
  if (await exists(requestPath)) {
    request = await json(requestPath);
    for (const message of request.messages || []) {
      if (!Array.isArray(message.content)) continue;
      for (const part of message.content) {
        if (part.type !== 'image_url') continue;
        const source = available.find((item) => `local:${item.path}` === part.image_url.url);
        if (!source) throw new Error('Saved video vision request refers to a missing or changed image');
        part.image_url.url = source.dataUrl;
      }
    }
  } else {
    request = buildVideoVisionRequest({ record, images: available, model });
    const logged = structuredClone(request);
    let imageIndex = 0;
    for (const message of logged.messages) {
      if (!Array.isArray(message.content)) continue;
      for (const part of message.content) {
        if (part.type === 'image_url') part.image_url.url = `local:${available[imageIndex++].path}`;
      }
    }
    await save(requestPath, logged);
  }
  const raw = await paidRequest(directory, 'video-vision', 'https://api.openai.com/v1/chat/completions', openAiKey, request);
  if (raw.error) throw new Error(`Video vision GPT error: ${raw.error.message}`);
  const observed = validateVideoVisionResponse(raw, { sceneIndices: available.map((image) => image.sceneIndex) });
  const byScene = new Map(observed.scenes.map((scene) => [scene.sceneIndex, scene]));
    const vision = {
      version: 1, promptVersion: videoVisionPromptVersion, status: missing.length ? 'partial' : 'complete', model,
    sourceVisualPlanHash: lockedVisualPlanHash(record), inputHash, createdAt: new Date().toISOString(),
    requestPath: 'video-vision-request.json', responsePath: 'video-vision-response.json', images: sources, usage: raw.usage || null,
    scenes: record.plan.scenes.map((scene) => {
      const image = sources.find((source) => source.sceneIndex === scene.index);
      const observation = byScene.get(scene.index);
      return observation
        ? { sceneIndex: scene.index, status: 'analyzed', imagePath: image.path, imageSha256: image.sha256, ...observation }
        : { sceneIndex: scene.index, status: 'vision_unavailable', imagePath: image?.path || null, imageSha256: image?.sha256 || null, observations: null };
    }),
  };
  await save(outputPath, vision);
  record.videoVision = vision;
  addUsage(record, 'videoVisionUsage', raw.usage);
  await persist();
  return vision;
}

async function createVideoDirection(record, directory, openAiKey, persist, vision) {
  const model = process.env.NEWS_VIDEO_DIRECTOR_MODEL || record.storyModel;
  const mode = record.featureSettings?.videoMode || 'auto';
  const audioDirection = 'off';
  const maxZoom = record.featureSettings?.videoMaxZoom ?? 0.08;
  const inputHash = videoDirectionInputHash({ record, vision: record.featureSettings?.videoVision === 'on' ? vision : null, model, videoMode: mode, audioDirection, maxZoom });
  const outputPath = join(directory, 'video-direction.json');
  if (await exists(outputPath)) {
    const saved = await json(outputPath);
    if (saved.inputHash !== inputHash) throw new Error('Saved video direction is stale; start a new iteration to re-plan changed inputs');
    record.videoDirection = saved;
    return saved;
  }

  const beforeHash = hash(JSON.stringify(visualPlanSnapshot(record.plan)));
  if (beforeHash !== lockedVisualPlanHash(record)) throw new Error('Locked visual plan changed before video direction');
  const requestPath = join(directory, 'video-direction-request.json');
  const request = await exists(requestPath)
    ? await json(requestPath)
    : buildVideoDirectionRequest({ record, vision: record.featureSettings?.videoVision === 'on' ? vision : null, model, videoMode: mode, audioDirection, maxZoom });
  if (!await exists(requestPath)) await save(requestPath, request);
  const raw = await paidRequest(directory, 'video-direction', 'https://api.openai.com/v1/chat/completions', openAiKey, request);
  if (raw.error) throw new Error(`Video direction GPT error: ${raw.error.message}`);
  const direction = validateVideoDirectionResponse(raw, { record, videoMode: mode, audioDirection, maxZoom });
  if (hash(JSON.stringify(visualPlanSnapshot(record.plan))) !== beforeHash) throw new Error('Video direction changed the locked visual plan');
  const videoDirection = {
    version: 3,
    promptVersion: videoDirectorPromptVersion,
    status: vision?.status === 'partial' ? 'partial' : vision?.status === 'complete' ? 'planned' : 'plan_only',
    provider: null,
    model,
    selectedMode: mode,
    audioDirectionEnabled: audioDirection === 'on',
    audioDirection: direction.audioDirection || null,
    maxZoom,
    visionStatus: vision?.status || 'disabled',
    sourceVisualPlanHash: beforeHash,
    sourceImageHashes: record.plan.scenes.map((scene, index) => ({ sceneIndex: scene.index, path: record.results[index]?.path || null, sha256: record.results[index]?.sha256 || null })),
    requestPath: 'video-direction-request.json', responsePath: 'video-direction-response.json', inputHash, usage: raw.usage || null,
    createdAt: new Date().toISOString(),
    overallDirection: direction.overallDirection,
    sceneTransitions: direction.sceneTransitions,
    scenes: direction.scenes,
  };
  await save(outputPath, videoDirection);
  record.videoDirection = videoDirection;
  addUsage(record, 'videoDirectionUsage', raw.usage);
  await persist();
  return videoDirection;
}

async function createVideoAudioDirection(record, directory, openAiKey, persist) {
  const model = process.env.NEWS_VIDEO_DIRECTOR_MODEL || record.storyModel;
  const inputHash = audioDirectionInputHash({ record, model });
  const outputPath = join(directory, 'audio-direction.json');
  if (await exists(outputPath)) {
    const saved = await json(outputPath);
    if (saved.inputHash !== inputHash) throw new Error('Saved audio direction is stale; start a new iteration to re-plan changed inputs');
    record.audioDirection = saved;
    return saved;
  }

  const requestPath = join(directory, 'audio-direction-request.json');
  const request = await exists(requestPath)
    ? await json(requestPath)
    : buildAudioDirectionRequest({ record, model });
  if (!await exists(requestPath)) await save(requestPath, request);
  const raw = await paidRequest(directory, 'audio-direction', 'https://api.openai.com/v1/chat/completions', openAiKey, request);
  if (raw.error) throw new Error(`Audio direction GPT error: ${raw.error.message}`);
  const direction = validateAudioDirectionResponse(raw, { record });
  const audioDirection = {
    version: 1,
    promptVersion: audioDirectorPromptVersion,
    status: 'planned',
    model,
    sourceVisualPlanHash: lockedVisualPlanHash(record),
    inputHash,
    requestPath: 'audio-direction-request.json',
    responsePath: 'audio-direction-response.json',
    usage: raw.usage || null,
    createdAt: new Date().toISOString(),
    ...direction,
  };
  await save(outputPath, audioDirection);
  record.audioDirection = audioDirection;
  addUsage(record, 'audioDirectionUsage', raw.usage);
  await persist();
  return audioDirection;
}

async function main() {
  if (options.help) {
    console.log('node --env-file=/path/to/.env eu-reski-news/scripts/run-news-scene-image-iteration.mjs --iterations=10 --scenes=5 --scene-length-takt=-1 --min-scene-seconds=5 --max-scene-seconds=6 --symbolic --no-room-deepness --layering=3 --fixed-visual-controls --videos-after-each-iteration --generate-title-cards --video-model=prunaai:p-video@2-pro --video-resolution=480p --video-settings-mode=cost');
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
  let sceneCountSettings = resolveSceneCountSettings(options);
  if (!['linear', 'random'].includes(options['article-order'])) throw new Error('Use --article-order=linear or --article-order=random');
  if (options['videos-after-each-iteration'] && (options['video-model'] !== 'prunaai:p-video@2-pro' || options['video-resolution'] !== '480p' || options['video-settings-mode'] !== 'cost')) {
    throw new Error('Automatic video generation in this runner requires P-Video-2-Pro, 480p, and cost mode');
  }
  const openAiKey = process.env.OPENAI_API_KEY;
  const runwareKey = process.env.RUNWARE_API_KEY || process.env.RUNWARE_KEY;
  const imageProvider = options['image-provider'];
  if (!['runware', 'hf-flux-klein'].includes(imageProvider)) throw new Error('Use --image-provider=runware or --image-provider=hf-flux-klein');
  if (!openAiKey || (!options['prompt-only'] && imageProvider === 'runware' && !runwareKey)) throw new Error('Set OPENAI_API_KEY and RUNWARE_API_KEY in your environment');
  if (!options['prompt-only'] && imageProvider === 'hf-flux-klein' && !(process.env.HF_TOKEN || process.env.HF_API_TOKEN || process.env.HUGGINGFACEHUB_API_TOKEN)) throw new Error('Set OPENAI_API_KEY and HF_TOKEN (or HF_API_TOKEN) in your environment');
  const semanticSource = options.resume ? null : await createSemanticSource(options);
  const endless = iterationLimit === 0 || iterationLimit === -1;
  const groupedRun = Boolean(options['resume-run']) || endless || iterationLimit > 1 || options['videos-after-each-iteration'];
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
    featureSettings: currentFeatureSettings(),
    generationSettings: currentGenerationSettings(),
    articleProgress: null,
    iterations: [],
  } : null;
  let pendingIterationDirectory = null;
  if (options['resume-run'] && Array.isArray(runManifest.iterations)) {
    const registered = new Set(runManifest.iterations.map((entry) => entry.directory));
    const unregistered = [];
    for (const directory of (await readdir(iterationRoot)).filter((name) => /^iteration-\d+$/.test(name)).sort()) {
      if (!registered.has(directory) && await exists(join(iterationRoot, directory, 'record.json'))) unregistered.push(directory);
    }
    if (unregistered.length > 1) throw new Error('Multiple unregistered iterations found; reconcile the run before resuming');
    if (unregistered.length) {
      const directory = unregistered[0];
      const record = await json(join(iterationRoot, directory, 'record.json'));
      if (record.status === 'Abgeschlossen' || (options['prompt-only'] && record.status === 'Prompts erstellt')) {
        runManifest.iterations.push({ index: runManifest.iterations.length + 1, directory, report: `${directory}/index.html` });
      } else {
        pendingIterationDirectory = join(iterationRoot, directory);
      }
    }
  }
  const previouslyCompleted = runManifest?.iterations.length || 0;
  if (options['resume-run'] && (!Array.isArray(runManifest.iterations) || (!endless && previouslyCompleted > iterationLimit))) {
    throw new Error('Run already has requested iterations or has invalid manifest');
  }
  if (runManifest) {
    if (options['resume-run']) {
      const firstPath = previouslyCompleted > 0 ? join(iterationRoot, runManifest.iterations[0].directory, 'record.json')
        : pendingIterationDirectory ? join(pendingIterationDirectory, 'record.json') : null;
      const first = firstPath ? await json(firstPath) : null;
      sceneCountSettings = runManifest.sceneCountSettings || first?.sceneCountSelection?.settings
        || { mode: 'fixed', count: first?.sceneCount ?? Number(options.scenes) };
      restoreFeatureSettings(runManifest.featureSettings || first?.featureSettings);
    }
    runManifest.sceneCountSettings = sceneCountSettings;
    runManifest.featureSettings ||= currentFeatureSettings();
    runManifest.generationSettings ||= currentGenerationSettings();
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
  const sceneCounts = options.resume ? null : createSceneCountStream(sceneCountSettings);
  const sceneDurations = createSceneDurationStream();
  const runImageSeedBase = runManifest && Object.hasOwn(runManifest, 'imageSeedBase') ? runManifest.imageSeedBase : imageSeedBase;
  if (runManifest) runManifest.imageSeedBase = runImageSeedBase;
  if (runManifest) {
    await save(join(iterationRoot, 'run.json'), runManifest);
    console.log(`Run folder: ${iterationRoot}`);
  }
  let imageSeedOffset = 0;
  for (let iteration = 0; iteration < previouslyCompleted; iteration += 1) {
    const previous = await json(join(iterationRoot, runManifest.iterations[iteration].directory, 'record.json'));
    const count = previous.sceneCount ?? previous.plan?.scenes?.length ?? Number(options.scenes);
    if (!Number.isInteger(count) || count < 1 || count > 12) throw new Error('Saved iteration has an invalid scene count');
    const selection = sceneCounts.next();
    if (sceneCountSettings.mode === 'taktmuster' && selection.count !== count) throw new Error('Saved scene-count rhythm differs; refusing to continue a changed sequence');
    await semanticSource?.next();
    for (let scene = 0; scene < count; scene += 1) sceneDurations.next();
    imageSeedOffset += count;
  }
  let completed = previouslyCompleted;
  if (runManifest && completed > 0) {
    const latestDirectory = runManifest.iterations[completed - 1].directory;
    const latestRecord = await json(join(iterationRoot, latestDirectory, 'record.json'));
    if (latestRecord.selection?.method === 'linear' && latestRecord.selection.ranking === 'jev-eu-relevance') {
      runManifest.articleProgress = {
        sourceAggregate: latestRecord.sourceAggregate,
        nextDraw: latestRecord.selection.draw + 1,
      };
      await save(join(iterationRoot, 'run.json'), runManifest);
    }
  }
  while (endless || completed < iterationLimit) {
    console.log(`Starting news run ${completed + 1}${endless ? ' (endless)' : ` of ${iterationLimit}`}`);
    const iterationDirectory = await runIteration(semanticSource, sceneDurations, sceneCounts, iterationRoot, completed, imageSeedOffset, runImageSeedBase, pendingIterationDirectory, runManifest?.articleProgress || null);
    pendingIterationDirectory = null;
    const completedRecord = await json(join(iterationDirectory, 'record.json'));
    imageSeedOffset += completedRecord.sceneCount;
    completed += 1;
    if (runManifest) {
      if (completedRecord.selection?.method === 'linear' && completedRecord.selection.ranking === 'jev-eu-relevance') {
        runManifest.articleProgress = {
          sourceAggregate: completedRecord.sourceAggregate,
          nextDraw: completedRecord.selection.draw + 1,
        };
      }
      const relativeDirectory = iterationDirectory.slice(iterationRoot.length + 1);
      runManifest.iterations.push({ index: completed, directory: relativeDirectory, report: `${relativeDirectory}/index.html` });
      await save(join(iterationRoot, 'run.json'), runManifest);
      const reports = await Promise.all(runManifest.iterations.map(async (iteration) => ({
        directory: iteration.directory,
        record: await json(join(iterationRoot, iteration.directory, 'record.json')),
      })));
      await writeFile(join(iterationRoot, 'index.html'), renderRunReport(runManifest, reports));
      console.log(`Cumulative HTML: ${join(iterationRoot, 'index.html')}`);
      if (options['videos-after-each-iteration']) {
        const videoArguments = [
          join(root, 'eu-reski-news', 'scripts', 'generate-news-scene-videos.mjs'),
          `--run=${iterationRoot}`,
          `--iteration=${relativeDirectory}`,
          `--model=${options['video-model']}`,
          `--resolution=${options['video-resolution']}`,
          `--settings-mode=${options['video-settings-mode']}`,
          '--poll-timeout-seconds=300',
        ];
        if (options['generate-title-cards']) videoArguments.push('--generate-title-cards');
        execFileSync(process.execPath, videoArguments, { cwd: root, stdio: 'inherit' });
      }
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

async function runIteration(semanticSource, sceneDurationStream, sceneCountStream, iterationRoot, iterationIndex, imageSeedOffset, runImageSeedBase, pendingDirectory, articleProgress) {
  const openAiKey = process.env.OPENAI_API_KEY;
  const runwareKey = process.env.RUNWARE_API_KEY || process.env.RUNWARE_KEY;
  const imageProvider = options['image-provider'];
  if (!openAiKey || (!options['prompt-only'] && imageProvider === 'runware' && !runwareKey)) throw new Error('Set OPENAI_API_KEY and RUNWARE_API_KEY in your environment');
  if (!options['prompt-only'] && imageProvider === 'hf-flux-klein' && !(process.env.HF_TOKEN || process.env.HF_API_TOKEN || process.env.HUGGINGFACEHUB_API_TOKEN)) throw new Error('Set OPENAI_API_KEY and HF_TOKEN (or HF_API_TOKEN) in your environment');
  const resumeDirectory = options.resume || pendingDirectory;
  const directory = resumeDirectory ? resolve(resumeDirectory) : await allocateIteration(iterationRoot);
  let record;
  try {
    if (resumeDirectory) {
      const saved = await json(join(directory, 'record.json'));
      if (saved.generator !== 'semantic-news-v1') throw new Error('Resume requires an iteration created by this generator');
      record = saved;
      if (options['resume-run'] && record.featureSettings && JSON.stringify(record.featureSettings) !== JSON.stringify(currentFeatureSettings())) {
        throw new Error('Iteration feature settings differ from the saved run settings; refusing a mixed run');
      }
      restoreFeatureSettings(record.featureSettings || currentFeatureSettings());
      record.featureSettings ||= currentFeatureSettings();
      if (pendingDirectory) {
        const choice = sceneCountStream.next();
        if (choice.count !== record.sceneCount) throw new Error('Interrupted iteration differs from saved scene-count rhythm');
        record.sceneCountSelection ||= choice;
        if (record.semantic) await semanticSource.next();
        if (Object.hasOwn(record, 'sceneDurations')) {
          for (let scene = 0; scene < record.sceneCount; scene += 1) sceneDurationStream.next();
        }
      }
    } else {
      const newsDirectory = resolve(options['news-dir']);
      const rankedCollections = await findRankedNewsCollections(newsDirectory);
      if (!rankedCollections.length) throw new Error('No EU-scored news collection found; fetch news and finish Jev classification first');
      const rankedCollection = rankedCollections[0];
      const { aggregate, aggregatePath: sourceAggregate, aggregateHash, candidates } = rankedCollection;
      const order = options['article-order'];
      const requestedDraw = options['article-id']
        ? candidates.findIndex(({ article }) => String(article.id) === options['article-id'])
        : order === 'random'
          ? randomInt(candidates.length)
          : articleProgress?.sourceAggregate === rankedCollection.aggregatePath
            ? articleProgress.nextDraw % candidates.length
            : 0;
      if (requestedDraw < 0) throw new Error('Requested article is missing or has no usable text and image');
      let draw = -1;
      const searchCount = options['article-id'] ? 1 : candidates.length;
      for (let offset = 0; offset < searchCount; offset += 1) {
        const candidateIndex = (requestedDraw + offset) % candidates.length;
        const candidate = candidates[candidateIndex];
        if (await hasUsableArticleImage(candidate.article.image)) {
          draw = candidateIndex;
          break;
        }
        console.warn(`Skip article with missing or broken image: ${candidate.article.title || '(untitled)'}`);
        if (options['article-id']) break;
      }
      if (draw < 0) throw new Error('No ranked article has a reachable JPEG, PNG or WebP image');
      const { article, aggregateIndex, score } = candidates[draw];
      console.log(`Article ${draw + 1}/${candidates.length} by Jev EU score ${Number.isFinite(score) ? score.toFixed(3) : 'unscored'}: ${article.title || '(untitled)'}`);
      const sceneCountSelection = sceneCountStream.next();
      const sceneCount = sceneCountSelection.count;
      console.log(`Scene count: ${sceneCount} (${sceneCountSelection.settings.mode}${sceneCountSelection.rawValue === undefined ? '' : `; raw ${sceneCountSelection.rawValue}, bias ${sceneCountSelection.settings.bias}`})`);
      record = {
        generator: 'semantic-news-v1', planningVersion: 2, createdAt: new Date().toISOString(), status: 'preparing',
        sourceVersion: {
          commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
          branch: execFileSync('git', ['branch', '--show-current'], { cwd: root, encoding: 'utf8' }).trim(),
          clean: !execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], { cwd: root, encoding: 'utf8' }).trim(),
        },
        sourceAggregate, aggregateHash,
        selection: {
          method: options['article-id'] ? 'article-id' : order,
          order,
          ranking: 'jev-eu-relevance',
          euRelevance: Number.isFinite(score) ? score : null,
          relevancePath: rankedCollection.relevancePath,
          draw,
          candidateCount: candidates.length,
          aggregateIndex,
        },
        article, sceneCount, imageProvider, articleImageReference: options['article-image-reference'], guernicaFigureReference: !options['article-image-only-reference'], guernicaLocationReference: options['guernica-location-reference'], visualStyleOptions: recordStyleOptions, storyModel, imageModel: imageProvider === 'hf-flux-klein' ? 'FLUX 3 Image Klein · ZeroGPU' : imageModel,
        generationSettings: currentGenerationSettings(),
        featureSettings: currentFeatureSettings(),
        sceneVisualControls: options['scene-visual-controls'] && !options['fixed-visual-controls'],
        sceneCountSelection,
        guernicaDirectory: options['article-image-only-reference'] ? null : resolve(options['guernica-dir']), results: [],
        imageSeed: runImageSeedBase === null ? null : (runImageSeedBase + imageSeedOffset) % 2_147_483_647,
      };
    }
    await mkdir(join(directory, 'media'), { recursive: true });
    // Old saved requests retain their original combined planning path on resume.
    if (!record.planningVersion && !record.plan && !await exists(join(directory, 'gpt-request.json'))) record.planningVersion = 2;
    if (!Object.hasOwn(record, 'sceneDurations')) {
      record.sceneDurations = record.plan?.scenes?.map((scene) => scene.durationSeconds)
        || await sceneDurationStream.generate(record.sceneCount);
      record.sceneDurationSettings = sceneDurationStream.settings;
      await save(join(directory, 'record.json'), record);
    }
    const persist = async () => {
      await save(join(directory, 'record.json'), record);
      await writeFile(join(directory, 'index.html'), renderReport(record));
    };
    delete record.error;
    await persist();
    if (options['generate-title-cards']) {
      const iterationNumber = Number(basename(directory).match(/iteration-(\d+)/)?.[1]);
      record.titleCard = await renderTitleCard({
        runDirectory: iterationRoot,
        iterationDirectory: relative(iterationRoot, directory),
        iterationNumber,
      });
      await persist();
      console.log(`Title card ready: ${record.titleCard.articleTitle}`);
    }
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
      if (!record.catalog && options['article-image-only-reference']) record.catalog = [];
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
      if (options['guernica-location-reference'] && !options['no-style-reference']) {
        images.push(await imageInput(directory, record.styleReference, 'Complete Guernica painting for GPT planning and image generation: derive only subtle setting and spatial atmosphere; use it as a secondary background/space reference, never copy its figures, poses, composition, motifs or color balance.', 'location'));
      }
      if (!options['article-image-only-reference']) {
        for (const entry of record.catalog) images.push(await imageInput(directory, entry, `Masked Guernica figure candidate ${entry.id}: ${entry.name}. Character reference candidate only; not a story instruction.`, 'catalog'));
      }
      const built = await buildPlanRequest({ article: record.article, semantic: record.semantic, catalog: record.catalog, sceneCount: record.sceneCount, visualStyleOptions: record.visualStyleOptions || recordStyleOptions, sceneVisualControls: record.sceneVisualControls ?? false, storyClou: record.featureSettings?.storyClou === 'on', images, model: record.storyModel, styleReferenceProvided: !options['no-style-reference'] && !options['guernica-location-reference'], locationReferenceProvided: options['guernica-location-reference'] && !options['no-style-reference'], articleImageReferenceProvided: record.articleImageReference, figureReferenceProvided: !options['article-image-only-reference'], continuationPlan: record.continuationPlan || null });
      if (options['landscape-prompt']) {
        const landscapeInstruction = 'LANDSCAPE PROMPT: Use the wide frame deliberately; let each scene’s focal action and spatial relationships use the frame width naturally. Do not force a horizontal frieze, central cluster or repeated layout.';
        built.director += `\n\n${landscapeInstruction}`;
        built.directorHash = hash(built.director);
        built.request.messages[0].content += `\n\n${landscapeInstruction}`;
        built.log.messages[0].content += `\n\n${landscapeInstruction}`;
      }
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
        record.semanticIndexCorrections = [];
        record.plan = validatePlan(raw, { ...record, visualOnly: record.planningVersion === 2, continuationPlan: record.continuationPlan || null, sceneVisualControls: record.sceneVisualControls ?? false, storyClou: record.featureSettings?.storyClou === 'on', figureReferenceProvided: record.guernicaFigureReference !== false });
      } catch (error) {
        if (!/semantic|motif|crocodile|protagonist|composition|figure|reference|visual control|story arc|clou|dramatic function/i.test(error.message)) throw error;
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
              'Use the current stream fragments for free fictional associations before outlining the story. In semanticUse, relevance means creatively used, not factually related to the news. Let associations shape materials, gesture, mood, staging or story action. They may be surprising, indirect or playful; no factual, geographic or historical match is needed. Record your chosen motifs, scene indices and a short explanation in semanticUse; exact quotation or literal phrase repetition is not required. Keep the reported article facts distinct from the invented image story in fictionBoundary. Symbolism OFF permits stream-driven concrete fictional staging without allegorical overlays. Translate model prompts into natural English. Unused fragments are allowed; no minimum quota applies.',
              record.guernicaFigureReference === false
                ? 'Keep one invented protagonist name and stable written visual identity for the entire scene sequence. Every protagonistAction must include the exact protagonist name. No Guernica figure or painting reference is supplied; set protagonist.guernicaId and every scene.guernicaId to 0. State in selectionReason that no Guernica figure reference is used. Derive identity, composition and gesture from the scene action, article and semantic association. The article photo is the only image reference and provides broad subject orientation only; do not copy its people, pose, framing, logos or text.'
                : 'Keep one invented protagonist name and stable written visual identity for the entire scene sequence. Every protagonistAction must include the exact protagonist name. Choose a valid masked figure reference separately for each scene to match its action and body shape. References may recur, including in neighboring scenes, when appropriate; no variety quota applies. Every selectionReason must explain visual fit without importing the figure source story. Choose a supported composition from the scene action and current semantic association. Compositions may repeat; change camera angle, distance, framing and gesture only when the scene calls for it. The image model must ignore each reference crop’s exact pose, scale and placement.',
              record.sceneVisualControls ? 'For every scene, include its own visualStyleOptions object (symbolic boolean, roomDeepness boolean, layering integer 0–7) and visualControlReason of at least 20 characters. Decide values from that scene’s story beat, action and setting; do not repeat one run-wide setting without a scene-specific reason. The stillPrompt must implement those choices.' : '',
              'The crocodile is optional. Include it only if its action makes sense as a metaphor; never add it as an edge decoration.',
              record.guernicaFigureReference === false
                ? 'The image API receives only reference image 1: the original article photograph, used for broad subject orientation only. No Guernica painting or masked figure crop is supplied. Never reproduce identifiable people, exact framing, logos, or text; redraw the underlying situation as the established fictional cubist mural.'
                : record.articleImageReference
                ? options['guernica-location-reference'] && !options['no-style-reference']
                  ? 'Each image API request receives three images: reference 1 is the selected masked figure, used only for the fictional protagonist’s abstract appearance and gesture; reference 2 is the complete Guernica painting, used only as a secondary setting and spatial-atmosphere reference; reference 3 is the original article photo, used only for broad visual orientation. Let the article-grounded action and protagonist lead. Use Guernica only for background space and atmosphere; do not reproduce its figures, pose, composition, motifs or color balance, or the photo’s identifiable people, exact composition, logos or text. Redraw the selected figure into the scene; never paste any reference. Do not import the figure’s original story, props or symbols. Keep protagonist prominent.'
                  : options['no-style-reference']
                    ? 'Each image API request receives two images: reference 1 is the selected masked figure, used only for the fictional protagonist’s abstract appearance and gesture; reference 2 is the original article photo, used only for broad visual orientation. Do not reproduce its identifiable people, exact composition, logos, or text. No complete painting reference is supplied; follow the written style description. Redraw the figure into the scene; never paste either reference. Do not import the figure’s original story, props, or symbols. Keep protagonist prominent.'
                    : 'Each image API request receives three images: reference 1 is the selected masked figure, used only for the fictional protagonist’s abstract appearance and gesture; reference 2 is the complete painting, used only for painterly style; reference 3 is the original article photo, used only for broad visual orientation. Do not reproduce the photo’s identifiable people, exact composition, logos, or text. Redraw the figure into the scene; never paste any reference. Do not import the figure’s original story, props, or symbols. Keep protagonist prominent.'
                : options['no-style-reference']
                  ? 'The image API receives only reference image 1: the selected masked figure, used only for the fictional protagonist’s abstract appearance and gesture. No complete painting reference is supplied; follow the written style description. Redraw reference 1 fully in the scene; never paste it. Do not import the figure’s original story, props, or symbols. The article photo is for GPT analysis only, never sent to the image API. Keep protagonist prominent. Do not copy real-person likenesses, crests, logos, brands, or readable lettering.'
                  : options['guernica-location-reference'] && !options['no-style-reference']
                  ? 'Each image API request receives two images: reference 1 is the selected masked figure, used only for the fictional protagonist’s abstract appearance and gesture; reference 2 is the complete Guernica painting, used only as a secondary setting and spatial-atmosphere reference. Let the article-grounded action and protagonist lead. Use Guernica only for background space and atmosphere; do not reproduce its figures, pose, composition, motifs or color balance. Make this new scene’s action and composition clearly distinct from Guernica. Redraw the selected figure into the scene; never paste it. Do not import its original story or props.'
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
        record.semanticIndexCorrections = [];
        record.plan = validatePlan(revised, { ...record, visualOnly: record.planningVersion === 2, continuationPlan: record.continuationPlan || null, sceneVisualControls: record.sceneVisualControls ?? false, storyClou: record.featureSettings?.storyClou === 'on', figureReferenceProvided: record.guernicaFigureReference !== false });
        record.planRevisionReason = error.message;
        finalResponse = revised;
      }
      record.plan.scenes = applySceneVisualControls(record.plan.scenes, record.visualStyleOptions || recordStyleOptions);
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
    if (record.plan?.scenes?.some((scene) => scene.stillPrompt.length > 3000)) {
      record.plan.scenes = applySceneVisualControls(record.plan.scenes, record.visualStyleOptions || recordStyleOptions);
      record.planHash = hash(JSON.stringify(record.plan));
      if (record.planningVersion === 2) {
        const visualPlan = visualPlanSnapshot(record.plan);
        record.visualPlanHash = hash(JSON.stringify(visualPlan));
        await save(join(directory, 'visual-plan.json'), visualPlan);
      }
      await save(join(directory, 'scene-plan.json'), record.plan);
      await persist();
      console.log('Shortened image prompts to fit image API; scene content and associations remain open.');
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
        const checkedPlan = validatePlan({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(timed.plan) } }] }, { ...record, figureReferenceProvided: record.guernicaFigureReference !== false });
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
    if (record.featureSettings?.storyClou === 'on') {
      if (!record.plan.storyArc || !record.plan.clouReveal) throw new Error('Saved plan has no narrative clou; create a new iteration with --story-clou=on');
      const storyArcPath = join(directory, 'story-arc.json');
      const storyArc = {
        version: 1,
        sourceVisualPlanHash: lockedVisualPlanHash(record),
        storyArc: record.plan.storyArc,
        clouReveal: record.plan.clouReveal,
        dramaticFunctions: record.plan.scenes.map(({ index, dramaticFunction }) => ({ sceneIndex: index, dramaticFunction })),
      };
      if (await exists(storyArcPath)) {
        const saved = await json(storyArcPath);
        if (saved.sourceVisualPlanHash !== storyArc.sourceVisualPlanHash) throw new Error('Saved story arc is stale; start a new iteration to re-plan the story');
      } else await save(storyArcPath, storyArc);
    }
    if (!options['prompt-only']) {
      const locationInput = options['guernica-location-reference'] && !options['no-style-reference']
        ? await prepareImageReference(directory, await imageInput(directory, record.styleReference, 'Complete Guernica painting supplied only as a secondary setting and spatial-atmosphere reference; do not copy its figures, pose, composition, motifs or color balance.', 'location'))
        : null;
      const styleInput = options['no-style-reference'] || options['guernica-location-reference'] ? null : await prepareImageReference(directory, await imageInput(directory, record.styleReference, 'Full-painting style reference only; no depicted content may be used', 'style'));
      for (const [index, scene] of record.plan.scenes.entries()) {
        if (record.results[index]?.path && await exists(join(directory, record.results[index].path))) continue;
        const figure = options['article-image-only-reference'] ? null : record.catalog.find((item) => item.id === scene.guernicaId);
        if (!options['article-image-only-reference'] && !figure) throw new Error(`No Guernica figure ${scene.guernicaId} for scene ${scene.index}`);
        const figureInput = figure ? await prepareImageReference(directory, await imageInput(directory, figure, `Protagonist character reference: ${figure.name}; redraw, do not paste`, 'catalog')) : null;
        const name = `scene-${scene.index}`;
        const requestPath = join(directory, `${name}-request.json`);
        let log = await exists(requestPath) ? await json(requestPath) : null;
        const articleInput = record.articleImageReference
          ? await prepareImageReference(directory, await imageInput(directory, record.articleImage, 'Original article photograph for broad visual orientation only; do not reproduce identifiable people, logos, or text', 'article'))
          : null;
        const referenceImages = [
          ...(figureInput ? [figureInput.dataUrl] : []),
          ...(locationInput ? [locationInput.dataUrl] : []),
          ...(styleInput ? [styleInput.dataUrl] : []),
          ...(articleInput ? [articleInput.dataUrl] : []),
        ];
        const task = log ? { ...log, inputs: { referenceImages } } : buildImageTask(scene, randomUUID(), referenceImages);
        if (!log && record.imageSeed !== null && record.imageSeed !== undefined) task.seed = (record.imageSeed + index) % 2_147_483_647;
        if (log && log.positivePrompt !== scene.stillPrompt) throw new Error('Saved image prompt differs from GPT plan');
        const referencePaths = [
          ...(figureInput ? [figureInput.path] : []),
          ...(locationInput ? [locationInput.path] : []),
          ...(styleInput ? [styleInput.path] : []),
          ...(articleInput ? [articleInput.path] : []),
        ];
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
        record.results[index] = { ...output, provider: imageProvider, taskUUID: result.taskUUID || result.eventId, seed: result.seed, cost: result.cost ?? null, billing: imageProvider === 'hf-flux-klein' ? 'ZeroGPU quota/credits; exact GPU seconds not reported by Space' : 'provider-reported', promptHash: hash(scene.stillPrompt), referencePaths, referenceMetadata: [figureInput, locationInput, styleInput, articleInput].filter(Boolean).map(({ dataUrl, ...metadata }) => metadata) };
        await persist();
      }
    }
    let videoVision = null;
    if (record.featureSettings?.videoVision === 'on') {
      videoVision = await createVideoVision(record, directory, openAiKey, persist);
    }
    if (record.featureSettings?.videoDirection === 'on') {
      const beforeDirectionHash = hash(JSON.stringify(visualPlanSnapshot(record.plan)));
      await createVideoDirection(record, directory, openAiKey, persist, videoVision);
      if (hash(JSON.stringify(visualPlanSnapshot(record.plan))) !== beforeDirectionHash) throw new Error('Video direction changed the locked visual plan');
    }
    if (record.featureSettings?.videoAudioDirection === 'on') {
      await createVideoAudioDirection(record, directory, openAiKey, persist);
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
