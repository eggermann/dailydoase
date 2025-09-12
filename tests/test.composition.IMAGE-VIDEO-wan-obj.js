import dotenv from "dotenv";
dotenv.config();


import OpenAI from "openai";
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });


// A single seed across image + video helps maintain look consistency.
// Override with environment vars when needed.
const FIXED_IMG_SEED = Number(process.env.IMG_SEED) || 424242;
const FIXED_VID_SEED = Number(process.env.VID_SEED) || FIXED_IMG_SEED;
// --- end helpers ---

let words = [['Fish', 'en'],['Critic'], ['Landscape', 'en'], ['Actor', 'en'], ['Humor', 'en']];
//words = [['Capitalsim', 'en']];
const scriptName = 'post-to-Img-Video-wan-2.js'

const fluxHQ = {
    fluxVariant: 'dev',       // guidance-distilled
    width: 576,
    height: 1024,
    num_inference_steps: 24,  // 30 ≈ sweet-spot vs 50 ref
    guidance_scale: 3,      // Copied from HF example
    negative_prompt: 'blurry, oversharpened, JPEG artefacts, different-age, different-hair, different-face, extra faces, face swap, mismatched skin tone, deformed eyes, out of identity',
    seed: FIXED_IMG_SEED
};



const duration_seconds = 5;
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
             //   cfg: 1.0,
                sampling_steps: 24,
                //motionBucketId: 127,
                //fps: 30,
                seed: FIXED_VID_SEED,
                //  imageDir: path.resolve(__dirname, '../images/ltx-test'),
                height: 1024,
                width: 576,
                //downscale_factor: 0.6666666,
                duration_seconds,
                guide_scale: 5,
               // decode_timestep: 0.05,
               // decode_noise_scale: 0.02,
               // improve_texture_flag: true,
                negative_prompt: 'worst quality, inconsistent motion, blurry, jittery, distorted, different-age, different-hair, different-face, out of identity',
                mode: 'image-to-video',
               // useImagePrompt: true,

                prompts: {
                    create: async (imageDescription) => {
                        const _ = {
                            createPrompt: async (prompt) => {
                                const response = await openai.chat.completions.create({
                                    model: "gpt-4o",
                                    messages: [
                                        {
                                            role: "system",
                                            content:
                                                `You are a world‑class prompt crafter for text‑to‑video and storyboards. Given user-provided words, sentences, subjects, or phrases, write a concise but vivid description for a short art movie of ${duration_seconds} seconds. Create an irrational, associative sequence that still feels filmable, with a clear arc: opening image, escalation/middle, rupture/turn, and closing image. In one flowing paragraph (120–180 words), weave the user’s inputs into the imagery and specify setting, style, mood, lighting, composition, camera movement, pacing, and transitions (e.g., match cuts, jump cuts, smash to black). Avoid bullet lists and avoid named public figures unless the user explicitly provides them. Do not include technical parameters or meta disclaimers—just the description ready for a generator.`
                                        },
                                        {
                                            role: "user",
                                            content: `Animate this single-image description into an approximately ${duration_seconds}-second art‑movie clip: ${imageDescription}. Produce an irrational, dreamlike sequence with clear structure (opening image → middle escalation → rupture/turn → closing image). Preserve the core subject and visual identity from the image while adding motion. Include setting continuity, mood, lighting evolution, composition changes, camera movement, pacing, and transitions (e.g., match cuts, jump cuts, cross‑dissolve, smash to black). One paragraph, camera‑ready, no lists.`
                                        }
                                    ]
                                });

                                let promptText = response.choices[0].message.content.trim();
                                return promptText;
                            }
                        }

                        const tagPrompt = await _.createPrompt(imageDescription);
                        console.log('tagPrompt:', tagPrompt);
                        return tagPrompt;
                    },
                    temperature: 0.4,
                    top_p: 0.95,
                    return_full_text: false
                },

                promptFunctions: () => {

                },
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
                            //image prompt
                            createPrompt: async (prompt) => {
                                const response = await openai.chat.completions.create({
                                    model: "gpt-4o",
                                    messages: [
                                        {
                                            role: "system",
                                            content:
                                                `You are a world‑class prompt crafter for text-to-image. Given user-provided words, sentences, subjects, or phrases, write a precise single-image description (70–120 words). Make it filmable and richly visual, specifying subject, setting, style, mood, lighting, color palette, texture, composition, lens/focal length or camera angle, and depth-of-field cues. Avoid bullet lists and avoid named public figures unless explicitly provided by the user. Do not include technical parameters or meta disclaimers—just the description ready for an image generator.`
                                        },
                                        {
                                            role: "user",
                                            content: `Create a single‑image description from these inputs: ${prompt}. Output one flowing paragraph (70–120 words) with subject, setting, style, mood, lighting, composition, lens/angle, color, and texture. No lists and no extraneous technical parameters.`
                                        }
                                    ]
                                });

                                let promptText = response.choices[0].message.content.trim();
                                return promptText;
                            }
                        }

                        const tagPrompt = await _.createPrompt(prompt);
                        console.log('tagPrompt:', tagPrompt);
                        return tagPrompt;
                    },
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
