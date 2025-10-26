import dotenv from "dotenv";
dotenv.config();

//--> Mac:tests eggermann$ npm test -- lib/generator/wan22/imageVideo.test.js
import OpenAI from "openai";
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const tm = [4, 1, 2, 1, 3, 1, 2, 1, 5, 1, 4, 1, 2, 1, 3, 1]
let tDuration = 0;
let cnt = 0;
const duration = () => {
    tDuration = tm[cnt++ % tm.length];
    return tDuration;
};// 5.1; // seconds

// A single seed across image + video helps maintain look consistency.
// Override with environment vars when needed.
const FIXED_IMG_SEED = Number(process.env.IMG_SEED) || 424242;
const FIXED_VID_SEED = Number(process.env.VID_SEED) || FIXED_IMG_SEED;
// --- end helpers ---

let words = [['hippie', 'en'], ['war', 'en']];
//words = [['Capitalsim', 'en']];
const scriptName = './adapter/start-end-frame-video-mirelo.js'



const fluxHQ = {
    fluxVariant: 'dev',       // guidance-distilled
    width: 576,
    height: 1024,
    num_inference_steps: 30,  // 30 ≈ sweet-spot vs 50 ref
    guidance_scale: 4,        // Copied from HF example
    negative_prompt: 'blurry, oversharpened, JPEG artefacts, different-age, different-hair, different-face, extra faces, face swap, mismatched skin tone, deformed eyes, out of identity',
    seed: FIXED_IMG_SEED
};

const video = {
    prompts: {
        create: async (startFramePrompt, endFRamePeompt) => {
            const _ = {
                createPrompt: async () => {
                    const response = await openai.chat.completions.create({
                        model: "gpt-4o",
                        messages: [
                            {
                                role: "system",
                                content:
                                    "You are a concise, porn queer cinematic micro-story creator for short films. Produce a multipart-part scene sequence labeled exactly 'Opening shot -> Camera motion -> Reveal / pay-off'. For each part, write one short camera-ready sentence (brief and vivid) describing subject, setting, mood, lighting, composition, and a simple camera detail.  Output only a few labeled lines, nothing else. given a start scene and a end scene"
                            },
                            {
                                role: "user",
                                content: `Using these :startscene ${startFramePrompt} and :endscene ${endFRamePeompt} time:${tDuration}seconds`
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

            const tagPrompt = await _.createPrompt();
            return tagPrompt;
        },
        // max_new_tokens: 223,
        temperature: 0.4,
        top_p: 0.95,
        return_full_text: false
    },
    model: {

        audioOnly: true,
        steps: 6,
        duration_seconds: duration,
    },
    useImagePrompt: false,
}

const mireloAI = {
    duration: () => tDuration,
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

            streamMixType: 'linear',//'random',//'sequential', // 'random' | 'sequential'
            model: {
                scriptName
            },
            words,
            video,
            mireloAI,
            image: {
                type: 'aiqtech-NSFW-Real',
                model: fluxHQ,
                staticPrompt: {
                    post: ', as blockbuster realistc animal movie ',
                    pre: 'a crying schizo clown in pervers attention with:'
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