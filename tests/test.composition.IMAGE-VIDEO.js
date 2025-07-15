import dotenv from "dotenv";
dotenv.config();
import OpenAI from "openai";
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const scriptName = 'post-to-Img-Video.js'
const word2 = [['life', 'en'], ['body', 'en'], ['art performance', 'en']];
const fluxHQ = {
    fluxVariant: 'dev',       // guidance-distilled
    width: 576,
    height: 1024,
    num_inference_steps: 30,  // 30 ≈ sweet-spot vs 50 ref
    guidance_scale: 3.5,      // Copied from HF example
    negative_prompt: 'blurry, oversharpened, JPEG artefacts',
    seed: Math.round(Math.random() * 1e6)
};


import('../semantic-stream.js').then(module =>
    module.default(
        [{
            model: {
                scriptName
            },
            words: word2,
            folderName: 'HYGH-Image-Video',
            staticPrompt: {
                post: ' as animal '
            },
            prompts: {
                createStyleTags: async (prompt) => {

                    const response = await openai.chat.completions.create({
                        model: "gpt-4o-mini",
                        response_format: { type: "json_object" },
                        messages: [
                            {
                                role: "system",
                                content: "You are an art film style tag generator for the ACE‑Step text‑to‑video model. "
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

                folderName: 'ltxVideos-test',
                cfg: 3.0,
                steps: 30,
                motionBucketId: 127,
                fps: 8,
                seed: Math.round(1204 * Math.random()),
                //  imageDir: path.resolve(__dirname, '../images/ltx-test'),
                width_ui: 576 ,
                height_ui: 1024 ,
                duration_ui: 8,
                ui_guidance_scale: 6,
                improve_texture_flag: true,
                negative_prompt: 'worst quality, inconsistent motion, blurry, jittery, distorted',
                mode: 'image-to-video'

            },
            image: {


                staticPrompt: {
                    post: ', as theater performance, posted to instagram, raw style',
                    pre: 'phone photo of a '
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

                model: fluxHQ

            },


            promptFunktion: async (streams) => {
                return streams;
            }
        }]
    )).catch(err => {
        console.error('Error in start.js:', err);
        process.exit(1);
    });
