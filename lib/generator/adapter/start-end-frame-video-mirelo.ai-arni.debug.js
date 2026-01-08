import dotenv from "dotenv";
dotenv.config();

import OpenAI from "openai";
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Single-shot, low-quality debug run
const tm = [4, 1, 2, 1, 3, 1, 2, 1];
let tDuration = 0;
let cnt = 0;
const duration = () => {
  tDuration = tm[cnt++ % tm.length];
  return tDuration / 1;
};

const FIXED_IMG_SEED = Number(process.env.IMG_SEED) || 424242;
const FIXED_VID_SEED = Number(process.env.VID_SEED) || FIXED_IMG_SEED;

let words = [["mars", "en"], ["Reinforcement_learning", "en"], ["SS", "en"]];
const scriptName = "./adapter/start-end-frame-video-mirelo.js";

// Lower-res, fewer steps for fast debug
const fluxHQ = {
  fluxVariant: "schnell",
  width: 320,
  height: 576,
  num_inference_steps: 8,
  guidance_scale: 2,
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
              "You are a concise, micro-story creator for short film scenes. Produce a short scene sequence labeled exactly 'Opening shot -> Camera motion -> Reveal / pay-off'. For each part, write one short camera-ready sentence (brief and vivid) describing subject, setting, mood, lighting, composition, and a simple camera detail.  Output only a few labeled lines, nothing else. given a start scene and a end scene",
          },
          {
            role: "user",
            content: `Show your feeling, how it was when RLHF was performed with Using these startscene: ${startFramePrompt} and endscene: ${endFRamePeompt}`,
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
    steps: 4,
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
        streamMixType: "random",
        model: {
          scriptName,
          // Disable polling to keep it to a single round
          pollingTime: null,
        },
        words,
        video,
        mireloAI,
        image: {
          model: fluxHQ,
          staticPrompt: {
            post: ", as realistic cinematic style",
            pre: "Show your feeling, how it was when RLHF was performed with topic: ",
          },
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
