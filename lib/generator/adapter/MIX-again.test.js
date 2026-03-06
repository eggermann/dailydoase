import dotenv from 'dotenv';
import OpenAI from 'openai';

import { makePromptCreator } from './helpers/openai-chat.js';

dotenv.config();
if (!process.env.DISABLE_FILE_WATCH) {
  process.env.DISABLE_FILE_WATCH = '1';
}

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const CHAT_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const TEST_DURATION_SECONDS = Number(process.env.TEST_DURATION) || 1;
const USE_SINGLE_IMAGE = process.env.USE_SINGLE_IMAGE = true;
const WAN22_FIRST_LAST_SPACE = process.env.WAN22_FIRST_LAST_SPACE || 'cakegreen/Wan-2-2-first-last-frame';
const MIRELO_MODEL_VERSION = process.env.MIRELO_MODEL_VERSION || 'latest';

const FIXED_IMG_SEED = Number(process.env.IMG_SEED) || 424242;
const FIXED_VID_SEED = Number(process.env.VID_SEED) || FIXED_IMG_SEED;

const PROMPT_SETTINGS = {
  temperature: 0.4,
  top_p: 0.9,
  return_full_text: false,
};

const duration = () => TEST_DURATION_SECONDS;
const parseBoolFlag = (value, fallback = false) => {
  if (typeof value === 'boolean') return value;
  const normalized = String(value ?? '').trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
};
const useSingleImage = () => parseBoolFlag(USE_SINGLE_IMAGE, false);

const words = [/*['SS', 'en'],*/ ['bauhaus', 'de']/*, ['Patriarch', 'en']*/];
const scriptName = './adapter/shorty-book/index.js';

const imageModelData = {
  model: 'black-forest-labs/FLUX.1-Kontext-dev',
  imagePath: '../test.datas/timba-lake.png',
  width: 256,
  height: 256,
  num_inference_steps: 4,
  guidance_scale: 1.5,
  negative_prompt:
    'blurry, oversharpened, JPEG artefacts, different-age, different-hair, different-face, extra faces, face swap, mismatched skin tone, deformed eyes, out of identity',
  seed: FIXED_IMG_SEED,
};

const buildPrompt = (system, buildUser) =>
  makePromptCreator({
    openai,
    model: CHAT_MODEL,
    system,
    buildUser,
    temperature: PROMPT_SETTINGS.temperature,
    top_p: PROMPT_SETTINGS.top_p,
  });

const VIDEO_SYSTEM_PROMPT =
  "You are a queer cinematic micro-story creator for short crazy social media shorts. Representing young queer lifestyle.  a multipart-part scene sequence labeled exactly 'Opening shot -> Camera motion -> Reveal / pay-off'." +
  'For each part, write one short camera-ready sentence (brief and vivid) describing subject, setting, mood, lighting, composition, and a simple camera detail.  Output only a few labeled lines, nothing else. given a start scene and a end scene';

const IMAGE_SYSTEM_PROMPT =
  "You are a queer cinematic micro-story creator for short crazy social media shorts. Representing young queer lifestyle.  a multipart-part scene sequence labeled exactly 'Opening shot -> Camera motion -> Reveal / pay-off'." +
  'For each part, write one short camera-ready sentence (brief and vivid) describing subject, setting, mood, lighting, composition, and a simple camera detail.  Output only a few labeled lines, nothing else. given a start scene';

const videoPrompts = {
  create: buildPrompt(
    VIDEO_SYSTEM_PROMPT,
    (startFramePrompt, endFramePrompt) =>
      `a journey of timber lakes live, weekends after weekends this time started in  :prompt for scene : ${startFramePrompt} and ends :prompt for scene : ${endFramePrompt} time:${TEST_DURATION_SECONDS}seconds :welcome from hell`
  ),
  ...PROMPT_SETTINGS,
};

const video2Prompts = {
  create: buildPrompt(
    VIDEO_SYSTEM_PROMPT,
    (startFramePrompt) =>
      `a journey of timber lakes live, weekends after weekends this time started addcted with : ${startFramePrompt} and time:${TEST_DURATION_SECONDS} seconds`
  ),
  ...PROMPT_SETTINGS,
};

const imagePrompts = {
  create: buildPrompt(
    IMAGE_SYSTEM_PROMPT,
    (prompt) =>
      `a journey of timber lakes live, weekends after weekends this time started addicted with : ${prompt} and time:${TEST_DURATION_SECONDS} seconds. In the background, a photo wall covered with polaroids from that person - the polaroids show stations from the last week, from the club on the other side, from the trip to the welcome to the other side. Subtle unobtrusive background details of zombies, alcohol, and intimate moments in the polaroids.`
  ),
  ...PROMPT_SETTINGS,
};

const video = {
  prompts: videoPrompts,
  model: {
    audioOnly: true,
    steps: 1,
    duration_seconds: duration,
  },
  useImagePrompt: false,
};

const video2 = {
  prompts: video2Prompts,
  model: {
    audioOnly: true,
    steps: 1,
    duration_seconds: duration,
  },
  useImagePrompt: false,
};

const mireloAI = {
  duration: () => TEST_DURATION_SECONDS,
  num_samples: 1,
  steps: 4,
  seed: -1,
  creativity_coef: 1,
  model_version: MIRELO_MODEL_VERSION,
  maxRetries5xx: 0,
  retryDelayMs: 250,
};

import('../../../semantic-stream.js')
  .then((module) =>
    module.default([
      {
        useSingleImage,
        streamMixType: 'random',
        model: {
          scriptName,
          space: WAN22_FIRST_LAST_SPACE,
          // Single round only.
          pollingTime: null,
        },
        words,
        video,
        video2,
        mireloAI,
        image: {
          type: 'imageActorInScene',
          model: imageModelData,
          prompts: imagePrompts,
          staticPrompt: {},
        },
        promptFunktion: async (streams) => {
          console.log('[consistency] IMG_SEED:', FIXED_IMG_SEED, 'VID_SEED:', FIXED_VID_SEED);
          return streams;
        },
      },
    ])
  )
  .catch((err) => {
    console.error('Error in start.js:', err);
    process.exit(1);
  });
