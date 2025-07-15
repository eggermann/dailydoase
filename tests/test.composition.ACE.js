

const words = [['Davidstern', 'de'], ['Boobs', 'en'], ['Acid', 'en'], ['Movie', 'en']];//, ['Robotics', 'en'], [':NewsStream', {startWord: ''}], ['Humanities', 'en']];
const word2 = [['photgraphy', 'en'], ['sex', 'en'], ['art', 'en']];

import OpenAI from "openai";
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });


const streams = [['lofi', 'en'], ['hip‑hop', 'en'], ['beats', 'en'], ['relax', 'en']];

// Fast-ish options for a CI run
const fastOptions = {
    audio_duration: 2,              // 2‑second clip
    //   infer_step: 30,                 // half the default 60 (faster)
    // request mp3 directly
};


const scriptName = 'post-to-ACE.js'
import('../semantic-stream.js').then(module =>
    module.default(
        [
            {

                words: streams,
                staticPromptXX: {
                    pre: 'phone photo of a',
                    post: ', art performance, contemporary art,art exhibition posted to instagram, raw style'
                },
                modelProbe: {
                    // TARGET_MODEL: 'Qwen/Qwen2.5-72B-Instruct',//--> bad'meta-llama/Llama-3.3-70B-Instruct',
                    createStyleTags: async (prompt) => {
                        /*  Use an LLM to generate up‑to‑date ACE‑Step style tags
                            from an arbitrary sentence or scene description.
                    
                            – We instruct the model to return *only* a JSON array
                              of lowercase tag strings (max 12 items).
                            – No additional commentary is allowed; we trim and join
                              the array before returning so downstream code can treat
                              it exactly like the old “string of tags” behaviour.
                        */
                        const response = await openai.chat.completions.create({
                            model: "gpt-4o-mini",
                            response_format: { type: "json_array" },
                            messages: [
                                {
                                    role: "system",
                                    content: "You are a music‑style tag generator for the ACE‑Step text‑to‑music model. "
                                        + "Given any user sentence, return a JSON array (max 12 elements) of concise, "
                                        + "comma‑worthy tags: genres, moods, instrumentation, production descriptors, "
                                        + "tempo like “90 bpm”, or key like “c minor”. Never include commentary."
                                },
                                {
                                    role: "user",
                                    content: `Generate tags from: "${prompt}"`
                                }
                            ]
                        });

                        // LLM is forced to reply with a JSON array per response_format.
                        const tagsArray = JSON.parse(response.choices[0].message.content);
                        return tagsArray.join(", ");
                    },
                    //       create song lyrics (song tags are ${tagPrompt}). \n
                    createLyrics: (prompt, tagPrompt) => {
                        return `
                 
                        create a song with the following tags: ${tagPrompt}.\n
                        Use song structure and sound notation like:->\n
                        [verse] ... [chorus] ... [bridge] ... [outro] ...
                        [sfx: vinyl crackle] [sfx: rain] [sfx: crowd cheering] [sfx: synth swell] [sfx: bass drop]
                        [tempo: slow] [key: C minor] [instrument: piano, drums, bass], or what is usfull for a genuine song.

                    the song should be in the sense of: ${prompt}. `;
                    },
                    // max_new_tokens: 223,
                    temperature: 0.4,
                    top_p: 0.95,
                    return_full_text: false
                },

                model:
                    Object.assign(
                        {
                            pollingTime: 4000,
                            scriptName,
                            //    fluxVariant: 'dev', // or 'dev' for the dev endpoint,
                            //   guidance_scale: 0,
                            //   num_inference_steps: 24,
                            // imageDir: path.resolve(__dirname, '../images/flux-test'),
                        },
                        fluxModel
                    ),
                folderName: 'frmt'
            },

            /* {
                      words:word2,
                      pollingTime: 45500,
                      model: {
                          scriptName,
                          fluxVariant: 'dev', // schnell or 'dev' for the dev endpoint
         
                      },
                      folderName: 'FLUX-dev-compo-test'
                  }*/
        ]
    ));
