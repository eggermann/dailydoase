import dotenv from "dotenv";
dotenv.config();

import OpenAI from "openai";
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Debug timing: reuse patterns but keep it short
const tm = [4, 1, 2, 1, 3, 1, 2, 1];
let tDuration = 0;
const tm2 = [4, 1, 2, 1, 3, 1, 2, 1, 5, 1, 2, 1, 3, 1, 2, 1];
let tm2Cnt = 0;
let tDuration2 = 1;
let cnt = 0;
let cnt2 = 0;

const useSingleImage = () => {

return true

  tm2Cnt++;
  tDuration2 = tm2[cnt2++ % tm2.length];
  return tm2Cnt % 2 === 0;
};
const duration = () => {
  tDuration = tm[cnt++ % tm.length];
  return (tDuration + tDuration2) / 2;
};

const FIXED_IMG_SEED = Number(process.env.IMG_SEED) || 424242;
const FIXED_VID_SEED = Number(process.env.VID_SEED) || FIXED_IMG_SEED;

let words = [["rainbow", "en"]];
const scriptName = "./adapter/start-end-frame-video-mirelo.js";

// Low-quality, fast image gen for debug
const imageModelData = {
  model: "black-forest-labs/FLUX.1-Kontext-dev",
  imagePath: "../test.datas/timba-lake.png",
  width: 320,
  height: 320,
  num_inference_steps: 10, // fal-ai img2img requires >= 10 steps
  guidance_scale: 1.5,
  negative_prompt:
    "blurry, oversharpened, JPEG artefacts, different-age, different-hair, different-face, extra faces, face swap, mismatched skin tone, deformed eyes, out of identity",
  seed: FIXED_IMG_SEED,
};

const video = {
  prompts: {
    create: async (startFramePrompt, endFRamePeompt) => {
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "You are a queer cinematic micro-story creator for short crazy social media shorts. Representing young queer lifestyle.  a multipart-part scene sequence labeled exactly 'Opening shot -> Camera motion -> Reveal / pay-off'. For each part, write one short camera-ready sentence (brief and vivid) describing subject, setting, mood, lighting, composition, and a simple camera detail.  Output only a few labeled lines, nothing else. given a start scene and a end scene",
          },
          {
            role: "user",
            content: `a journey of timber lakes live, weekends after weekends this time started in  :prompt for scene : ${startFramePrompt} and ends :prompt for scene : ${endFRamePeompt} time:${tDuration}seconds :welcome from hell`,
          },
        ],
        temperature: 0.4,
        top_p: 0.95,
      });
      return response.choices[0].message.content.trim();
    },
    temperature: 0.4,
    top_p: 0.95,
    return_full_text: false,
  },
  model: {
    audioOnly: true,
    steps: 3,
    duration_seconds: duration,
  },
  useImagePrompt: false,
};

const video2 = {
  prompts: {
    create: async (startFramePrompt, endFRamePeompt) => {
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "You are a queer cinematic micro-story creator for short crazy social media shorts. Representing young queer lifestyle.  a multipart-part scene sequence labeled exactly 'Opening shot -> Camera motion -> Reveal / pay-off'. For each part, write one short camera-ready sentence (brief and vivid) describing subject, setting, mood, lighting, composition, and a simple camera detail.  Output only a few labeled lines, nothing else. given a start scene and a end scene",
          },
          {
            role: "user",
            content: `a journey of timber lakes live, weekends after weekends this time started addcted with : ${startFramePrompt} and time:${tDuration} seconds`,
          },
        ],
        temperature: 0.4,
        top_p: 0.95,
      });
      return response.choices[0].message.content.trim();
    },
    temperature: 0.4,
    top_p: 0.95,
    return_full_text: false,
  },
  model: {
    audioOnly: true,
    steps: 3,
    duration_seconds: duration,
  },
  useImagePrompt: false,
};

const mireloAI = {
  duration: () => tDuration,
  num_samples: 1,
  steps: 10,
  seed: -1,
  creativity_coef: 2,
  maxRetries5xx: 0,
  retryDelayMs: 250,
};

import("../../../semantic-stream.js")
  .then((module) =>
    module.default([
      {
        useSingleImage,
        streamMixType: "random",
        model: {
          scriptName,
          // Single round only
          pollingTime: null,
        },
        words,
        video,
        video2,
        mireloAI,
        image: {
          type: "imageActorInScene",
          model: imageModelData,
          prompts: {
            create: async (prompt) => {
              const response = await openai.chat.completions.create({
                model: "gpt-4o-mini",
                messages: [
                  {
                    role: "system",
                    content:
                      "You are a queer cinematic micro-story creator for short crazy social media shorts. Representing young queer lifestyle.  a multipart-part scene sequence labeled exactly 'Opening shot -> Camera motion -> Reveal / pay-off'. For each part, write one short camera-ready sentence (brief and vivid) describing subject, setting, mood, lighting, composition, and a simple camera detail.  Output only a few labeled lines, nothing else. given a start scene",
                  },
                  {
                    role: "user",
                    content: `a journey of timber lakes live, weekends after weekends this time started addicted with : ${prompt} and time:${tDuration} seconds. In the background, a photo wall covered with polaroids from that person - the polaroids show stations from the last week, from the club on the other side, from the trip to the welcome to the other side. Subtle unobtrusive background details of zombies, alcohol, and intimate moments in the polaroids.`,
                  },
                ],
                temperature: 0.4,
                top_p: 0.95,
              });
              return response.choices[0].message.content.trim();
            },
            temperature: 0.4,
            top_p: 0.95,
            return_full_text: false,
          },
          staticPrompt: {},
        },
        promptFunktion: async (streams) => {
          console.log(
            "[consistency-debug] IMG_SEED:",
            FIXED_IMG_SEED,
            "VID_SEED:",
            FIXED_VID_SEED
          );
          return streams;
        },
      },
    ])
  )
  .catch((err) => {
    console.error("Error in start.js:", err);
    process.exit(1);
  });
