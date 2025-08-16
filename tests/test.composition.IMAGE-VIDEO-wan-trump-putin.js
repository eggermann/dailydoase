import dotenv from "dotenv";
dotenv.config();


import OpenAI from "openai";
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

let words = [['Capitalsim', 'en'], ['Alaska', 'en'], ['Socialism', 'en'], ['Mafia', 'en']];
words = [['Capitalsim', 'en']];
const scriptName = 'post-to-Img-Video-Wan-2.2-5B.js'

const fluxHQ = {
    fluxVariant: 'dev',       // guidance-distilled
    width: 576,
    height: 1024,
    num_inference_steps: 20,  // 30 ≈ sweet-spot vs 50 ref
    guidance_scale: 9,      // Copied from HF example
    negative_prompt: 'blurry, oversharpened, JPEG artefacts',
    seed: Math.round(Math.random() * 1e6)
};

import('../semantic-stream.js').then(module =>
    module.default(
        [{
            model: {
                scriptName
            },
            words,
       //     folderName: 'TESTXXXXXTEST',
            prompts: {

                createStyleTags: async (prompt) => {

                    const response = await openai.chat.completions.create({
                        model: "gpt-4o-mini",
                        response_format: { type: "json_object" },
                        messages: [
                            {
                                role: "system",
                                content: "You are an art film style tag generator for a text‑to‑video model. "
                                    + "Given any user sentence, return a JSON array (max 6 elements) of concise, "
                                    + "comma‑worthy tags: film genres, moods, visual styles, cinematography terms, "
                                    + "lighting, color palettes, camera techniques, or era references. Never include commentary."
                            },
                            {
                                role: "user",
                                content: `Generate tags from: "${prompt}"`
                            }
                        ]
                    });

                    // LLM is forced to reply with a JSON array per response_format.
                    const tagsArray = JSON.parse(response.choices[0].message.content);
                    console.log('tagsArray:', tagsArray);

                    return tagsArray.tags.join(", ");
                },
                //       create song lyrics (song tags are ${tagPrompt}). \n
                createLyrics: async (prompt, tagPrompt) => {
                    const response = await openai.chat.completions.create({
                        model: "gpt-4o-mini",

                        messages: [
                            {
                                role: "system",
                                content: "You are an art film scriptwriter for the ACE‑Step text‑to‑video model. "
                                    + "Given tags and a prompt, return a JSON object with a single key 'script' containing a script for a 12-second short art movie. "
                                    + "Structure: [scene 1] ... [scene 2] ... [scene 3] ... [ending] ... "
                                    + "Optionally include cinematic notations such as: [camera: close-up], [lighting: moody], [sound: ambient rain], [effect: slow motion]. "
                                    + "Focus on visual storytelling and mood, not dialogue. Never include commentary or Sound/music."
                            },
                            {
                                role: "user",
                                content: `Tags: ${tagPrompt}\nPrompt: ${prompt}`
                            }
                        ]
                    });

                    const scriptObj = JSON.parse(response.choices[0].message.content);
                    return scriptObj.script;
                },
                // max_new_tokens: 223,
                temperature: 0.4,
                top_p: 0.95,
                return_full_text: false
            },

            video: {
                //    folderName: 'ltxv13bDistilled',
                cfg: 1.0,
                steps: 7,
                motionBucketId: 127,
                fps: 30,
                seed: Math.round(1204 * Math.random()),
                //  imageDir: path.resolve(__dirname, '../images/ltx-test'),
                height_ui: 1024,
                width_ui: 576,
                downscale_factor: 0.6666666,
                duration_ui: 12,
                ui_guidance_scale: 1,
                decode_timestep: 0.05,
                decode_noise_scale: 0.025,
                improve_texture_flag: true,
                negative_prompt: 'worst quality, inconsistent motion, blurry, jittery, distorted',
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
                                                "ALWAYS include Vladimir Putin and Donald Trump together in the same scene. " +
                                                "Given user-provided words, write one vivid, camera-ready scene optimized for image generation " +
                                                "(subject, setting, style, mood, lighting, composition, camera). " +
                                                "Keep it 1–2 sentences, no lists, no dialogue, no quotes, no extra commentary."
                                        },
                                        {
                                            role: "user",
                                            content: `Create an image description using these words (must feature Vladimir Putin and Donald Trump together): ${prompt}`
                                        }
                                    ]
                                });

                                let promptText = response.choices[0].message.content.trim();
                                // Ensure both names are present even if the model under-includes.
                                if (!/Vladimir\s+Putin/i.test(promptText) || !/Donald\s+Trump/i.test(promptText)) {
                                    const src = typeof prompt === 'string' ? prompt : JSON.stringify(prompt);
                                    promptText = `Vladimir Putin and Donald Trump appear together in a vivid, camera-ready scene inspired by ${src}. Photorealistic, balanced composition, evocative lighting.`;
                                }
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
                return streams;
            }
        }]
    )).catch(err => {
        console.error('Error in start.js:', err);
        process.exit(1);
    });
