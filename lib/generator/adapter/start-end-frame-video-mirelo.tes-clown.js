import dotenv from "dotenv";
dotenv.config();

//--> Mac:tests eggermann$ npm test -- lib/generator/wan22/imageVideo.test.js
import OpenAI from "openai";
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// --- Character consistency helpers ---
// Descriptors stay constant across every image/video to keep identity stable
const characters = {
    adam: {
        descriptor:
            "man, late 20s, warm olive skin, sharp jawline, short dark undercut with subtle fade, light stubble, athletic build, monochrome techwear (matte black cargo jacket, structured tee, tapered trousers), minimal silver ring, no glasses, no hat"
    },
    eva: {
        descriptor:
            "woman, late 20s, fair skin with faint freckles, sleek chin-length bob (platinum with dark roots), defined brows, slim build, modern-neo streetwear (white cropped bomber, high-waist black skirt), subtle eyeliner, no glasses, no hat"
    }
};

// A single seed across image + video helps maintain look consistency.
// Override with environment vars when needed.
const FIXED_IMG_SEED = Number(process.env.IMG_SEED) || 424242;
const FIXED_VID_SEED = Number(process.env.VID_SEED) || FIXED_IMG_SEED;
// --- end helpers ---

let words = [ ['nature', 'en'], ['human', 'en'], ['Starship', 'en'], ['Joke', 'en']];
//words = [['Capitalsim', 'en']];
const scriptName = './adapter/start-end-frame-video-mirelo.js'
const duration = 5.1; // seconds

const fluxHQ = {
    fluxVariant: 'dev',       // guidance-distilled
    width: 576,
    height: 1024,
    num_inference_steps: 26,  // 30 ≈ sweet-spot vs 50 ref
    guidance_scale: 4,        // Copied from HF example
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

            streamMixType: 'linear',//'random',//'sequential', // 'random' | 'sequential'
            model: {
                scriptName
            },
            words,
            video,
            mireloAI,
            image: {
                model: fluxHQ,
                staticPrompt: {
                    post: ', as blockbuster movie ',
                    pre: 'a clown do a joke or action with:'
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