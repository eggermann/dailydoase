import dotenv from "dotenv";
dotenv.config();

//--> Mac:tests eggermann$ npm test -- lib/generator/wan22/imageVideo.test.js
import OpenAI from "openai";
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// --- Character consistency helpers ---
// Descriptors stay constant across every image/video to keep identity stable
const characters = {
    greta: {
        descriptor:
            "wearing minimalist eco-aware clothing and never forgetting her frog-badge."
    },
    eva: {
        descriptorY:
            "woman, late 20s, fair skin with faint freckles, sleek chin-length bob (platinum with dark roots), defined brows, slim build, modern-neo streetwear (white cropped bomber, high-waist black skirt), subtle eyeliner, no glasses, no hat"
    }
};

// A single seed across image + video helps maintain look consistency.
// Override with environment vars when needed.
const FIXED_IMG_SEED = Number(process.env.IMG_SEED) || 424242;
const FIXED_VID_SEED = Number(process.env.VID_SEED) || FIXED_IMG_SEED;
// --- end helpers ---

let words = [['Greta Thunberg', 'en'], ['reclamation', 'en'], ['Mafia', 'en'], ['Military', 'en']];
//words = [['Capitalsim', 'en']];
const scriptName = './adapter/start-end-frame-video-mirelo.js'

let cnt = 0;
const tm = [4,1,2,1,3,1,2,1]
let tDuration =0;
const duration = () => {
    tDuration= tm[cnt++ % tm.length];
    return tDuration;
};// 5.1; // seconds

const fluxHQ = {
    fluxVariant: 'dev',       // guidance-distilled
    width: 1024,
    height: 768,
    num_inference_steps: 26,  // 30 ≈ sweet-spot vs 50 ref
    guidance_scale: 4,        // Copied from HF example
    negative_prompt: 'blurry, oversharpened, JPEG artefacts, different-age, different-hair, different-face, extra faces, face swap, mismatched skin tone, deformed eyes, out of identity',
    seed: FIXED_IMG_SEED
};

const video = {
    model: {
        audioOnly: true,
        steps: 5,
        duration_seconds: duration,
    },
    useImagePrompt: true,
}

const mireloAI = {
    duration:tDuration,
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

            streamMixType: 'random',//''linear',//'random',//'sequential', // 'random' | 'sequential'
            model: {
                scriptName
            },
            words,
            video,
            mireloAI,
            image: {
                model: fluxHQ,
                staticPrompt: {
                    pre: 'Social-media post style, vibrant feed look, natural moment yet polished; characters on-model and consistent; no extra faces, no hats or glasses unless asked.',
                    post: '| camera: 50mm prime, f/2.0, shallow depth of field | composition: subject centered, slight tilt, mobile-friendly crop | style: Instagram-ready, rich color grade, subtle film grain, no text or watermarks'
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
                                           content: `You are a protest storyteller, weaving short, bittersweet micro-stories that also serve as camera-ready image prompts.  
Maintain strict identity consistency: do NOT change age, hair color/style, facial structure, or clothing palette; avoid hats, glasses, or occlusions unless explicitly requested.  
Produce 1–2 vivid, scene-setting sentences that feel wistful yet shareable, like a curated social-media post. Describe subject, setting, mood, lighting, composition, and camera details with soft, polished imagery suitable for image synthesis.  
Aesthetic: polished social-media feed (mobile-first crop, gentle film grain, authentic vibe).`   },
                                        {
                                            role: "user",
                                            content: `Tell a crazy, camera-ready micro-story that MUST feature Tunberg in a situation like: ${prompt}.
Frame it explicitly as describing story.
Keep it 1–4 sentences, preserve identity using these descriptors - ${characters.greta.descriptor}`
                                        }
                                    ],
                                    temperature: 0.4,
                                    top_p: 0.95
                                });

                                let promptText = response.choices[0].message.content.trim();
                                // Optional: hard-lock identity if needed
                                // promptText += ` | Identity lock: ${characters.eva.descriptor}; ${characters.adam.descriptor}.`;
                                return promptText;
                            }
                        }

                        const tagPrompt = await _.createPrompt(prompt);
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