// halloween-version.js
import dotenv from "dotenv";
dotenv.config();

import OpenAI from "openai";
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/** Timing helpers (kept) */
const tm = [4, 1, 2, 1, 3, 1, 2, 1];
let tDuration = 0;
let cnt = 0;
const duration = () => {
  tDuration = tm[cnt++ % tm.length];
  return tDuration;
};

/** Seeds (kept) */
const FIXED_IMG_SEED = Number(process.env.IMG_SEED) || 424242;
const FIXED_VID_SEED = Number(process.env.VID_SEED) || FIXED_IMG_SEED;

/** Halloween theme words (swap in) */
let words = [
  ["carnival", "en"],
  ["abandoned rollercoaster ghostly neon", "en"],
  ["midnight", "en"],
  ["October 31", "en"],
  ["skeletal", "en"],
];

const scriptName = "./adapter/start-end-frame-video-mirelo.js";

/** Image model config — eerie picture-illustration / stylized realism */
const halloweenIllustration = {
  fluxVariant: "dev",
  width: 576,
  height: 1024,
  num_inference_steps: 30,
  guidance_scale: 4,
  // Keep it creepy, not graphic
  negative_prompt: 'blurry, oversharpened, JPEG artefacts, different-age, different-hair, different-face, extra faces, face swap, mismatched skin tone, deformed eyes, out of identity',
   
  seed: FIXED_IMG_SEED,
};

/** Video micro-scenes — concise, cinematic, Halloween vibe */
const video = {
  prompts: {
    create: async (startFramePrompt, endFramePrompt) => {
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        temperature: 0.45,
        top_p: 0.95,
        messages: [
          {
            role: "system",
            content:
              "You craft eerie, cinematic micro-scenes for a Halloween short. Output EXACTLY three labeled lines: 'Opening shot ->', 'Camera motion ->', 'Reveal / pay-off ->'. Each is ONE tight sentence describing subject, setting, mood, lighting, composition, and a simple camera detail. Tone: uncanny, suspenseful, stylish. No gore, no explicit content.",
          },
          {
            role: "user",
            content:
              `:startscene ${startFramePrompt} :endscene ${endFramePrompt} | duration:${tDuration}s`,
          },
        ],
      });
      return response.choices[0].message.content.trim();
    },
    temperature: 0.45,
    top_p: 0.95,
    return_full_text: false,
  },
  model: {
    audioOnly: true,
    steps: 6,
    duration_seconds: duration,
  },
  useImagePrompt: false,
};

/** Audio SFX generator (suggest spooky palette in comment) */
const mireloAI = {
  duration: () => tDuration,
  num_samples: 1,
  steps: 25,
  seed: -1,
  creativity_coef: 4.5,
  maxRetries5xx: 0,
  retryDelayMs: 250,
  // Suggested SFX: creaking floorboards, wind through wires, distant carousel, tape hiss, theremin gliss, rattling windows, soft chimes.
};

import("../../../semantic-stream.js")
  .then((module) =>
    module.default([
      {
        streamMixType: "random",
        model: { scriptName },
        words,
        video,
        mireloAI,

        image: {
          type: "aiqtech-NSFW-Real",
          model: halloweenIllustration,

          prompts: {
            create: async (prompt) => {


              const images=['/Users/eggermann/Projekte/dailydoase/lib/generator/test.datas/Banana_Girl_BG_bikini.png'
                ,'/Users/eggermann/Projekte/dailydoase/lib/generator/test.datas/20250429_1121_Panda_vor_BossBurger_remix_01jt0dhw5hehzsg03npzz2hp45.png'];



              const response = await openai.chat.completions.create({
                model: "gpt-4o",
                temperature: 0.5,
                top_p: 0.95,
                messages: [
                  {
                    role: "system",
                    content:
                      "You write vivid, eerie micro-stories that double as camera-ready illustration prompts for a Halloween show. "+
                      "Keep it creepy-cool.",
                  },
                  {
                    role: "user",
                    content:
                    `BossBurger:`+
                      `In short sentences, create an illustration prompt with: subject, setting, lighting, color, composition cue (e.g., Dutch angle, rim light). Tone: moonlit, misty, neon-glow, retro horror poster. No text in image. Topic: ${prompt}`,
                  },
                ],
              });
              return response.choices[0].message.content.trim();
            },
            temperature: 0.5,
            top_p: 0.95,
            return_full_text: false,
          },

          // Stylistic nudge: spooky glam, not splatter
          staticPrompt: {
            pre:
              "moody moonlight, low fog, long shadows, rim lighting, Dutch angle, film grain, retro poster vibe, saturated neon accents,",
            post:
              ", eerie but non-graphic, no text overlay, clean composition, high detail",
          },
        },

        promptFunktion: async (streams) => {
          console.log(
            "[consistency] IMG_SEED:",
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
    console.error("Error in halloween-version.js:", err);
    process.exit(1);
  });