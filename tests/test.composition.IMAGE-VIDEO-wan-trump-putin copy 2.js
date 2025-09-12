import dotenv from "dotenv";
dotenv.config();


import OpenAI from "openai";
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// --- Character consistency helpers ---
// Descriptors stay constant across every image/video to keep identity stable
const characters = {
    trump: {
        descriptor:
            "Donald Trump, late 70s, fair skin, distinctive blond swept‑back hair, blue business suit, white dress shirt, long red tie, clean‑shaven, light tan, no glasses"
    },
    putin: {
        descriptor:
            "Vladimir Putin, early 70s, fair skin, short receding light‑brown/gray hair, navy business suit, white dress shirt, muted solid tie (often blue), clean‑shaven, no glasses"
    }
};

// A single seed across image + video helps maintain look consistency.
// Override with environment vars when needed.
const FIXED_IMG_SEED = Number(process.env.IMG_SEED) || 424242;
const FIXED_VID_SEED = Number(process.env.VID_SEED) || FIXED_IMG_SEED;
// --- end helpers ---

let words = [['Drama', 'en'], ['Capitalsim', 'en'], ['Alaska', 'en'], ['Socialism', 'en'], ['Mafia', 'en'], ['Shower', 'en']];
//words = [['Capitalsim', 'en']];
const scriptName = 'post-to-Img-Video-wan.js'

const fluxHQ = {
    fluxVariant: 'dev',       // guidance-distilled
    width: 576,
    height: 1024,
    num_inference_steps: 25,  // 30 ≈ sweet-spot vs 50 ref
    guidance_scale: 3,      // Copied from HF example
    negative_prompt: 'blurry, oversharpened, JPEG artefacts, different-age, different-hair, different-face, extra faces, face swap, mismatched skin tone, deformed eyes, out of identity',
    seed: FIXED_IMG_SEED
};

import('../semantic-stream.js').then(module =>
    module.default(
        [{
            streamMixType: 'random',//'sequential', // 'random' | 'sequential'
            model: {
                scriptName
            },
            words,
            //     folderName: 'TESTXXXXXTEST',

            video: {
                //    folderName: 'ltxv13bDistilled',
                cfg: 1.0,
                steps: 7,
                motionBucketId: 127,
                fps: 30,
                seed: FIXED_VID_SEED,
                //  imageDir: path.resolve(__dirname, '../images/ltx-test'),
                height_ui: 1024,
                width_ui: 576,
                downscale_factor: 0.6666666,
                duration_ui: 12,
                ui_guidance_scale: 1,
                decode_timestep: 0.05,
                decode_noise_scale: 0.02,
                improve_texture_flag: true,
                negative_prompt: 'worst quality, inconsistent motion, blurry, jittery, distorted, different-age, different-hair, different-face, out of identity',
                mode: 'image-to-video',
                useImagePrompt: true,


            },
            image: {
                model: fluxHQ,
                staticPromptXX: {
                    post: ', as theater performance posted to social-media',
                    pre: 'phone-photo from:'
                },

                prompts: {
                    create: async (prompt) => {
                        const _ = {
                            createPrompt: async (prompt) => {
                                const response = await openai.chat.completions.create({
                                    model: "gpt-4o",
                                    messages: [
                                        {
                                            role: "system",
                                            content:
                                                "You are a world‑class text‑to‑image prompt crafter. " +
                                                "ALWAYS include Vladimir Putin and Donald Trump in the same scene. " +
                                                "Given user-provided words, write a camera‑ready scene optimized for image generation " +
                                                "(subject, setting, style, mood, lighting, composition, camera). " +
                                                "Keep it 1–2 sentences, no lists. " +
                                                "Identity consistency rules: lock to the provided descriptors; do NOT change age, hair color/style, facial structure, or clothing palette; avoid hats, glasses, or occlusions unless explicitly requested."
                                        },
                                        {
                                            role: "user",
                                            content: `Create an image description using these words. MUST feature Vladimir Putin and Donald Trump together. Keep identity consistent using these fixed descriptors — ${characters.putin.descriptor}; ${characters.trump.descriptor}. Words: ${prompt}`
                                        }
                                    ]
                                });

                                let promptText = response.choices[0].message.content.trim();
                                // Ensure both names are present even if the model under-includes.
                          /*      if (!/Vladimir\s+Putin/i.test(promptText) || !/Donald\s+Trump/i.test(promptText)) {
                                    const src = typeof prompt === 'string' ? prompt : JSON.stringify(prompt);
                                    promptText = `Vladimir Putin and Donald Trump appear together in a vivid, camera-ready scene inspired by ${src}. Photorealistic, balanced composition, evocative lighting.`;
                                }*/
                                promptText += ` | Identity lock: ${characters.putin.descriptor}; ${characters.trump.descriptor}.`;
                                return promptText;
                            }
                        }


                        const tagPrompt = await _.createPrompt(prompt);

                        console.log('tagPrompt:', tagPrompt);
                        return tagPrompt;

                    },

                    //       create song lyrics (song tags are ${tagPrompt}). \n

                    // max_new_tokens: 223,
                    temperature: 0.4,
                    top_p: 0.95,
                    return_full_text: false
                },


                modelProbeXX: {
                    // TARGET_MODEL: 'Qwen/Qwen2.5-72B-Instruct',//--> bad'meta-llama/Llama-3.3-70B-Instruct',
                    prompt: (totalPrompt) => {
                        return ` you get some sentence or words. build out of it a short art movie story  -->\n
                    ,
                     ${totalPrompt}`;
                    },
                    // max_new_tokens: 223,
                    temperature: 0.4,
                    top_p: 0.95,
                    return_full_text: false
                },


            },

            promptFunktion: async (streams) => {
                console.log('[consistency] IMG_SEED:', FIXED_IMG_SEED, 'VID_SEED:', FIXED_VID_SEED);
                return streams;
            }
        }]
    )).catch(err => {
        console.error('Error in start.js:', err);
        process.exit(1);
    });
