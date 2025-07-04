

const words = [['Davidstern', 'de'], ['Boobs', 'en'], ['Acid', 'en'], ['Movie', 'en']];//, ['Robotics', 'en'], [':NewsStream', {startWord: ''}], ['Humanities', 'en']];
const streams = [['photgraphy', 'en'], ['sex', 'en'], ['art', 'en']];



//const streams = [['lofi', 'en']];//[['lofi', 'en'], ['hip‑hop', 'en'], ['beats', 'en'], ['relax', 'en']];

// Fast-ish options for a CI run
const fastOptions = {
    audio_duration: 2,              // 2‑second clip
    //   infer_step: 30,                 // half the default 60 (faster)
    // request mp3 directly
};


const scriptName = 'post-to-create-song-ACE .js'
import('../semantic-stream.js').then(module =>
    module.default(
        [
            {

                words: streams,
                staticPromptXX: {
                    pre: 'phone photo of a',
                    post: ', art performance, contemporary art,art exhibition posted to instagram, raw style'
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

                    ),
                folderName: 'ace-compo-test',
                promptFunktion: async (streams) => {
                    return streams;
                }
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
