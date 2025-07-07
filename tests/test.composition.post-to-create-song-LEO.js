

const words = [['Davidstern', 'de'], ['Boobs', 'en'], ['Acid', 'en'], ['Movie', 'en']];//, ['Robotics', 'en'], [':NewsStream', {startWord: ''}], ['Humanities', 'en']];
const streams = [['Bass', 'en'], ['Sex', 'en'], ['art', 'en'], ['Beat', 'en']];



//const streams = [['lofi', 'en']];//[['lofi', 'en'], ['hip‑hop', 'en'], ['beats', 'en'], ['relax', 'en']];

// Fast-ish options for a CI run



const scriptName = 'post-to-create-song-LEO.js'
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
                            cfg_coef: 1.8,
                            temperature: 0.5,
                            top_k: 15

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
