
import dotenv from "dotenv";
dotenv.config();
import OpenAI from "openai";
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const word2 = [['God', 'en'], ['Sport', 'en'], ['Acid', 'en']];
const scriptName = 'post-to-ginigen-Veo3-free.js'

import('../semantic-stream.js').then(module =>
    module.default(
        [{
            model: {
                scriptName,
                "link": {
                    "url": "ginigen/VEO3-Free",
                    "name": "ginigen VEO3-Free",
                    "alt": "the model name on hugginface"
                }
            },
            words: word2,
            folderName: 'GodSportAcid',
            staticPrompt: {
                pre: ' ',
                post: ' raw style',
            },
  prompts: {
               createStyleTags: async (prompt) => {
               
                    const response = await openai.chat.completions.create({
                        model: "gpt-4o-mini",
                        response_format: { type: "json_object" },
                        messages: [
                            {
                                role: "system",
                                content: "You are a mood tag generator for text‑to‑video model. "
                                    + "Given any user sentence, return a JSON array (max 6 elements, min 1) of concise mood tags only. eg: {moods=[]} "
                                    + "Tags should describe emotional tones or atmospheres (e.g., melancholic, euphoric, tense, serene, nostalgic, ominous). "
                                    + "Never include commentary or non-mood tags."
                            },
                            {
                                role: "user",
                                content: `Generate mood tags from: "${prompt}"`
                            }
                        ]
                    });

                    // LLM is forced to reply with a JSON array per response_format.
                    const tagsArray = JSON.parse(response.choices[0].message.content);

                    return tagsArray.moods.join(", ");
                },
                //       create song lyrics (song tags are ${tagPrompt}). \n
                createLyrics: async (prompt, tagPrompt) => {
               //     console.log('tagPrompt:', tagPrompt);
//console.log('prompt :', prompt);

                    const response = await openai.chat.completions.create({
                        model: "gpt-4o-mini",
                        messages: [
                            {
                                role: "system",
                                content: "You are a meme video scriptwriter for an 8-second meme generator. "
                                    + "Given tags and a prompt, return a JSON object with a single key 'script' containing a script for a short, funny, and visually engaging meme video. "
                                    + "Structure: [setup] ... [punchline] ... [ending] ... "
                                    + "Optionally include meme tropes, visual gags, or popular meme references. "
                                    + "Focus on humor, visual storytelling, and internet meme culture. But very short description"
                            },
                            {
                                role: "user",
                                content: `Tags: ${tagPrompt}\nPrompt: ${prompt}`
                            }
                        ]
                    });
//console.log('response:', response.choices[0].message.content);


                    const scriptObj = JSON.parse(response.choices[0].message.content);
                    return scriptObj.script;
                },
                // max_new_tokens: 223,
                temperature: 0.4,
                top_p: 0.95,
                return_full_text: false
            },

            seed: Math.round(1204 * Math.random()),
            steps: 4,//8max
            // 4:3 aspect ratio, next higher size, both dimensions multiple of 32 (e.g., 128x168)
            height: 32 * 9, // 128 is a multiple of 32
            width: 32 * 16,  // 168 is a multiple of 32, 168/128 = 4/3
            duration_seconds: 8,
            nag_scale: 11,
            audio_steps: 50,
            audio_cfg_strength: 2.8,

            promptFunktion: async (streams) => {
                return streams;
            }
        }]
    )).catch(err => {
        console.error('Error in start.js:', err);
        process.exit(1);
    });
