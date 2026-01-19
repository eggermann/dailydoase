import dotenv from "dotenv";
dotenv.config();

//--> Mac:tests eggermann$ npm test -- lib/generator/wan22/imageVideo.test.js
import OpenAI from "openai";
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const tm = [4, 1, 2, 1, 3, 1, 2, 1]
let tDuration = 0;
const tm2 = [4, 1, 2, 1, 3, 1, 2, 1, 5, 1, 2, 1, 3, 1, 2, 1]
let tm2Cnt=0;
let tDuration2 = 1;
let cnt = 0;
let cnt2 = 0;


const useSingleImage = () => {
    tm2Cnt++;
    tDuration2 = tm2[cnt2++ % tm2.length];

    if (tm2Cnt % 2 === 0) {
        return true;
    };// 5.1; // seconds
    return false;
}
const duration = () => {
    tDuration = tm[cnt++ % tm.length];
    return (tDuration+tDuration2)/2;
};// 5.1; // seconds

// A single seed across image + video helps maintain look consistency.
// Override with environment vars when needed.
const FIXED_IMG_SEED = Number(process.env.IMG_SEED) || 424242;
const FIXED_VID_SEED = Number(process.env.VID_SEED) || FIXED_IMG_SEED;
// --- end helpers ---

let words = [['SS', 'en'], ['fashion', 'en'], ['Patriarch', 'en']];
//words = [['Capitalsim', 'en']];
const scriptName = './adapter/shorty-book/index.js'



// Image generator configuration for imageActorInScene (HF img2img)
// Matches the usage seen in imageActorInScene.test.js
const imageModelData = {
    model: 'black-forest-labs/FLUX.1-Kontext-dev',
    imagePath: '../test.datas/timba-lake.png',
    width: 512,
    height: 512,
    num_inference_steps: 28,
    guidance_scale: 2.5,
    negative_prompt: 'blurry, oversharpened, JPEG artefacts, different-age, different-hair, different-face, extra faces, face swap, mismatched skin tone, deformed eyes, out of identity',
    seed: FIXED_IMG_SEED,
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
                                    "You are a queer cinematic micro-story creator for short crazy social media shorts. Representing young queer lifestyle.  a multipart-part scene sequence labeled exactly 'Opening shot -> Camera motion -> Reveal / pay-off'." +
                                    "For each part, write one short camera-ready sentence (brief and vivid) describing subject, setting, mood, lighting, composition, and a simple camera detail.  Output only a few labeled lines, nothing else. given a start scene and a end scene"
                            },
                            {
                                role: "user",
                                content: `a journey of timber lakes live, weekends after weekends this time started in  :prompt for scene : ${startFramePrompt} and ends :prompt for scene : ${endFRamePeompt} time:${tDuration}seconds :welcome from hell`
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

const video2 = {

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
                                    "You are a queer cinematic micro-story creator for short crazy social media shorts. Representing young queer lifestyle.  a multipart-part scene sequence labeled exactly 'Opening shot -> Camera motion -> Reveal / pay-off'." +
                                    "For each part, write one short camera-ready sentence (brief and vivid) describing subject, setting, mood, lighting, composition, and a simple camera detail.  Output only a few labeled lines, nothing else. given a start scene and a end scene"
                            },
                            {
                                role: "user",
                                content: `a journey of timber lakes live, weekends after weekends this time started addcted with : ${startFramePrompt} and time:${tDuration} seconds`
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
            useSingleImage,
            streamMixType: 'random',//'random',//'sequential', // 'random' | 'sequential'
            model: {
                scriptName
            },
            words,
            video,
            video2,
            mireloAI,
            image: {
                type: 'imageActorInScene',
                model: imageModelData,
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
                                                "You are a queer cinematic micro-story creator for short crazy social media shorts. Representing young queer lifestyle.  a multipart-part scene sequence labeled exactly 'Opening shot -> Camera motion -> Reveal / pay-off'." +
                                                "For each part, write one short camera-ready sentence (brief and vivid) describing subject, setting, mood, lighting, composition, and a simple camera detail.  Output only a few labeled lines, nothing else. given a start scene"
                                        },
                                        {
                                            role: "user",
                                            content: `a journey of timber lakes live, weekends after weekends this time started addicted with : ${prompt} and time:${tDuration} seconds. In the background, a photo wall covered with polaroids from that person - the polaroids show stations from the last week, from the club on the other side, from the trip to the welcome to the other side. Subtle unobtrusive background details of zombies, alcohol, and intimate moments in the polaroids.`
                                        }
                                    ],
                                    temperature: 0.4,
                                    top_p: 0.95
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
                staticPrompt: {
                   // post: ', as a Donald Trump video in wild western style',
                   // pre: 'A cinematic scene of :'
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
