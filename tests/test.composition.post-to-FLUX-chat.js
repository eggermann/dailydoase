import dotenv from "dotenv";
dotenv.config();
import OpenAI from "openai";
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const word2 = [ ['Love', 'en'], ['Code', 'en'], ['Kangoroo', 'en']];
const scriptName = 'post-to-FLUX-chat.js'


// 🔸  High-quality – FLUX.1-dev
const fluxHQ = {
    fluxVariant: 'schnell',       // guidance-distilled
    width: 1152,             // 3:4 portrait, multiples of 16
    height: 864,           // 3:4 portrait, multiples of 16
    num_inference_steps: 30,  // 30 ≈ sweet-spot vs 50 ref
    guidance_scale: 3.5,      // Copied from HF example
    negative_prompt: 'blurry, oversharpened, JPEG artefacts',
    seed: Math.round(Math.random() * 1e6)
};



const fluxModel = fluxHQ;

import('../semantic-stream.js').then(module =>
    module.default(
        [{
            words: word2,
            staticPrompt: {
                pre: '',
                post: ' 		security camera',
            },
            model:
                Object.assign(
                    {
                        pollingTime: 4000,
                        scriptName,
                        //    fluxVariant: 'dev', // or 'dev' for the dev endpoint,
                        //   guidance_scale: 0,
                        //   num_inference_steps: 24,
                        // imageDir: path.resolve(__dirname, '../images/flux-test'),
                    },
                    fluxModel
                ),

            folderName: word2.map(w => w[0]).join(','),

            prompts: {
                createStyleTags: async (prompt) => {
                    const response = await openai.chat.completions.create({
                        model: "gpt-4o-mini",
                        messages: [
                            {
                                role: "system",
                                content: [
                                    "You are an ad copywriter crafting micro‑headlines for a Roo Code ",
                                    "Brand: Roo Code — an open‑source AI coding agent for VS Code. 'Roo' refers to a kangaroo.",
                                    "Goal: Write ONE funny, brand‑forward on‑image caption that sells the benefit.",
                                    "Use AIDA/4Cs implicitly: grab attention, be clear, show benefit, hint at action.",
                                    "Leverage the user's own words: reuse 1–2 nouns/adjectives from the brief.",
                                    "Constraints:",
                                    "- English only, natural and punchy.",
                                    "- 6–12 words, Title Case allowed, no emojis, no hashtags, no quotes.",
                                    "- Include the brand name 'Roo Code' or 'RooCode'.",
                                    "- Output ONLY the caption line."
                                ].join('\n')
                            },
                            {
                                role: "user",
                                content: `Brief: ${prompt}`
                            }
                        ]
                    });
                    return response.choices[0].message.content.trim();
                },
                // Generate an image-generation prompt for Roo-themed art
                createLyrics: async (prompt, tagPrompt) => {

                    const response = await openai.chat.completions.create({
                        model: "gpt-4o-mini",
                        messages: [
                            {
                                role: "system",
                                content: [
  "You are an image-prompt composer for FLUX/SDXL-like models.",
  "Task: Write ONE single-line image prompt that will produce a compelling, funny scene suitable for a commercial/poster.",
  "Use ONLY the information contained in the user's `prompt` and `tagPrompt` arguments.",
  "Requirements:",
  "- Heavily reuse the user's own nouns/adjectives/verbs; prefer their phrasing.",
  "- Reuse at least FIVE words from `prompt` and at least THREE from `tagPrompt` verbatim (preserve proper-noun casing).",
  "- Derive ALL details (subjects, actions, interior/setting, props, mood, style, lighting, time of day, camera intent, composition) solely from the inputs.",
  "- If a character/mascot (e.g., Roo/kangaroo) is mentioned in the inputs, include it; otherwise do not fabricate characters or brand elements.",
  "- Make the humor explicit by stating the key action and why it’s funny in a single frame.",
  "- Avoid fixed templates, stock phrases, or static camera/lighting defaults.",
  "Format:",
  "- Output ONE single line, comma-separated phrases covering: subject(s), key action, setting & interior details, mood, visual style, lighting (source/time/color), composition, camera hints if implied, optional medium.",
  "- ≤300 characters; no quotes; no weight syntax like '::'; no extra commentary."
].join('\n')
                            },
                            {
                                role: "user",
                                content: [
  `Prompt (verbatim; reuse words): ${prompt}`,
  `tagPrompt (verbatim; reuse words): ${tagPrompt || ''}`
].join('\n')
                            }
                        ]
                    });

                    const core = response.choices[0].message.content.trim().replace(/\n+/g, ' ');
                    return core;
                }
            },

            seed: Math.round(1204 * Math.random()),
            steps: 6,//8max
            // 3:4 aspect ratio, both dimensions multiples of 16
            height: 1152,
            width: 864,
            duration_seconds: 8,
            nag_scale: 11,
            audio_steps: 50,
            audio_cfg_strength: 2.8,

            promptFunktion: async (streams) => {
                return streams;
            }
        }]
    )).catch(err => {
        console.error('Error in start.js:', err);
        process.exit(1);
    });
