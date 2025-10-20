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

let words = [ ['Batman', 'en'], ['neon', 'en']];
//words = [['Capitalsim', 'en']];
const scriptName = './adapter/start-end-frame-video-mirelo.js'
const duration = 5.1; // seconds


const fluxHQ = {
    fluxVariant: 'dev',       // guidance-distilled
    width: 576 / 2,
    height: 1024 / 2,
    num_inference_steps: 3,  // 30 ≈ sweet-spot vs 50 ref
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
    prompts: {
        create: async (startPrompt, endPrompt) => {


            console.log('Generating short story between:\n', startPrompt, '\n', endPrompt);

            try {

                const response = await openai.chat.completions.create({
                    model: "gpt-4o",
                    messages: [
                        {
                            role: "system",
                            content: `You write ultra-short (~${duration}s) short stories that bridge 
                            a start frame and an end frame derived from the same image prompt. 
                            Output MUST be two lines: (1) one concise sentence (≈20–30 words)
                             describing a mini story that logically fits the scene and implied obstacles;
                              (2) a results line in the form 'Winner: X. Loser: Y.'. Keep family-friendly; avoid gore, 
                              slurs, and offensive content. If names are present in the image prompt, you may use them; 
                              otherwise use roles (e.g., 'the diver', 'the chef').
                             Do NOT format as a voiceover; write a short story.`
                        },
                        {
                            role: "user",
                            content:

                                `Start frame: ${startPrompt}\nEnd frame: ${endPrompt}\nWrite a ${duration}-second short 
                                story that could play between these frames. Infer a plausible obstacle or tension from 
                                the prompts (weather, time pressure, rivalry, crowd reaction, etc.).
                                 End by choosing exactly one winner and one loser that fit the story.`
                        }
                    ],
                    temperature: 0.5,
                    top_p: 0.95
                });

                const out = (response.choices?.[0]?.message?.content || '').trim();
                // Log clearly in bold yellow with a label
                const YELLOW = '\x1b[1m\x1b[33m';
                const RESET = '\x1b[0m';
                console.log(`${YELLOW}GPT short story output:${RESET}`, out || `${YELLOW}<empty response>${RESET}`);


                // Basic safety net: if the model didn't follow the two-line format, coerce it.
                /*   if (!/Winner:\s*.+\.?\s*Loser:\s*.+\.?/i.test(out)) {
                       const fallback = `A quick clash unfolds, stakes spike, and by the final beat one clearly prevails while the other concedes.\nWinner: the contender. Loser: the rival.`;
                       return fallback;
                   }*/
                return out;
            } catch (e) {
                // On failure, provide a minimal deterministic prompt so downstream code still runs.
                return `A brief struggle plays out between the opening and closing frames, tension rises then snaps with a clear outcome.\nWinner: the lead. Loser: the challenger.`;
            }
        },
        // max_new_tokens: 223,
        temperature: 0.4,
        top_p: 0.95,
        return_full_text: false
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
    text_prompt: 'A television sound from an 90s reality show, with laughter and applause, like Al Bundy',
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
