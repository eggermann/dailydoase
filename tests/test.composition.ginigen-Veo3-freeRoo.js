import dotenv from "dotenv";
dotenv.config();
import OpenAI from "openai";
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const word2 = [['kangaroo', 'en'], ['Love', 'en'], ['Code', 'en']];
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
            folderName:  word2.map(w => w[0]).join(','),
            staticPrompt: {
                pre: 'Roo Code is an open‑source AI coding agent in VS Code — it can read/write files, run terminal commands, automate browser actions, and use OpenAI‑compatible models. Here, “Roo” refers to the animal kangaroo. All text must be readable in English. ',
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
                                content:
                                    "You are a mood‑tag generator that captures the wild spirit of Roo Code. " +
                                    "Given any user sentence, return a JSON object with a single key 'moods' (max 6, min 1) " +
                                    "containing concise mood tags only. Example: {\"moods\": []}. " +
                                    "Tags should describe emotional tones or atmospheres (e.g., chaotic, surreal, playful, cursed, epic, hilarious). " +
                                    "Never include commentary or non‑mood tags."
                            },
                            {
                                role: "user",
                                content:
                                    "Generate mood tags from: \"" + prompt + "\""
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
                                content: [
                                    "You are a meme‑video scriptwriter for an 8‑second meme ,  inspired by Roo Code culture.",
                                    "Given tags and a prompt, return a tiny script in three timed parts labeled exactly as 'sec 1', 'sec 2', and 'sec 3'.",
                                    "Use exactly this format:",
                                    "sec 1: ...",
                                    "sec n: ...",
                                    "sec n: ... , ...",
                                    "Interpret 'Roo' as the animal kangaroo (kangaroo motifs are encouraged).",
                                    "All on‑screen text must be readable in English.",
                                    "The vibe should feel surreal, hilarious, epic, or cursed — anything that screams Roo.",
                                    "Optionally include meme tropes or visual gags.",
                                    "Do not include any commentary, just the script.",
                                    "The script should be concise, punchy, and fit within 8 seconds.",
                                    "The script should be suitable for a Roo Code meme video.",
                                    
                                ].join('\n')
                            },
                            {
                                role: "user",
                                content: [
                                    `Tags: ${tagPrompt}`,
                                    `Prompt: ${prompt}`,
                                
                                ].join('\n')
                            }
                        ]
                    });
                    //console.log('response:', response.choices[0].message.content);
                    //process.exit(0);

                    //const scriptObj = JSON.parse(response.choices[0].message.content);
                    return response.choices[0].message.content;//scriptObj.script;
                },
                // max_new_tokens: 223,
                temperature: 0.4,
                top_p: 0.95,
                return_full_text: false
            },

            seed: Math.round(1204 * Math.random()),
            steps: 6,//8max
            // 4:3 aspect ratio, next higher size, both dimensions multiple of 32 (e.g., 128x168)
            height: 128 * 2.25, // 128 is a multiple of 32
            width: 168 * 2.25,  // 168 is a multiple of 32, 168/128 = 4/3
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
