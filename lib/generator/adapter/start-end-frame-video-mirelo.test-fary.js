import dotenv from "dotenv";
dotenv.config();

//--> Mac:tests eggermann$ npm test -- lib/generator/wan22/imageVideo.test.js
import OpenAI from "openai";
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// --- Character consistency helpers ---
// Descriptors stay constant across every image/video to keep identity stable
const characters = {
 trump: {
        descriptor:
            "man, late 70s, fair skin, distinctive blond swept‑back hair, blue business suit, white dress shirt, long red tie, clean‑shaven, light tan, no glasses"
    },
    putin: {
        descriptor:
            "female, early 70s, fair skin, short receding light‑brown/gray hair, navy business suit, white dress shirt, muted solid tie (often blue), clean‑shaven, no glasses"
    }
};

// A single seed across image + video helps maintain look consistency.
// Override with environment vars when needed.
const FIXED_IMG_SEED = Number(process.env.IMG_SEED) || 424242;
const FIXED_VID_SEED = Number(process.env.VID_SEED) || FIXED_IMG_SEED;
// --- end helpers ---

let words = [['Drama', 'en'], ['Capitalsim', 'en'], ['Alaska', 'en'], ['Socialism', 'en'], ['Mafia', 'en'], ['Shower', 'en']];
//words = [['Capitalsim', 'en']];
const scriptName = './adapter/start-end-frame-video-mirelo.js'
const duration = 5.1; // seconds


const fluxHQ = {
    fluxVariant: 'dev',       // guidance-distilled
    width: 576 ,
    height: 1024 ,
    num_inference_steps: 25,  // 30 ≈ sweet-spot vs 50 ref
    guidance_scale: 3,      // Copied from HF example
    negative_prompt: 'blurry, oversharpened, JPEG artefacts, different-age, different-hair, different-face, extra faces, face swap, mismatched skin tone, deformed eyes, out of identity',
    seed: FIXED_IMG_SEED
};

const video = {
    model: {
        audioOnly: true,
        steps: 6,
        duration_seconds: duration,
    },
    useImagePrompt: true,
}


const mireloAI = {
    duration,
    num_samples: 1,
    steps: 25,
    seed: -1,
    creativity_coef: 4.5,
    maxRetries5xx: 0,
    retryDelayMs: 250,
   // text_prompt: 'A television sound from an 90s reality show, with laughter and applause, like Al Bundy',
};


import('../../../semantic-stream.js').then(module =>
    module.default(
        [{

            streamMixType: 'random',//'sequential', // 'random' | 'sequential'
            model: {
                scriptName
            },
            words,
            video,
            mireloAI,
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
                                                "You are a wildly imaginative, slightly unhinged storyteller who spins short, outrageous micro‑stories that also serve as camera‑ready image prompts. ALWAYS include female and man together. Maintain strict identity consistency: do NOT change age, hair color/style, facial structure, or clothing palette; avoid hats, glasses, or occlusions unless explicitly requested. Produce 1–2 vivid, scene‑setting sentences that describe subject, setting, mood, lighting, composition and camera details, with bold surreal imagery suitable for image synthesis."
                                        },
                                        {
                                            role: "user",
                                            content: `Tell a crazy, camera‑ready micro‑story that MUST feature female and man together, using these words: ${prompt}. Keep it 1–2 sentences, preserve identity using these descriptors — ${characters.putin.descriptor}; ${characters.trump.descriptor}.`
                                        }
                                    ]
                                });

                                let promptText = response.choices[0].message.content.trim();
                                // Ensure both names are present even if the model under-includes.
                                /*      if (!/Vladimir\s+Putin/i.test(promptText) || !/Donald\s+Trump/i.test(promptText)) {
                                          const src = typeof prompt === 'string' ? prompt : JSON.stringify(prompt);
                                          promptText = `female and man appear together in a vivid, camera-ready scene inspired by ${src}. Photorealistic, balanced composition, evocative lighting.`;
                                      }*/
                              //  promptText += ` | Identity lock: ${characters.putin.descriptor}; ${characters.trump.descriptor}.`;
                                return promptText;
                            }
                        }


                        const tagPrompt = await _.createPrompt(prompt);

                        // console.log('tagPrompt:', tagPrompt);
                        return tagPrompt;

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
