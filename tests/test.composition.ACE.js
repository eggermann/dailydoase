

const words = [['Davidstern', 'de'], ['Boobs', 'en'], ['Acid', 'en'], ['Movie', 'en']];//, ['Robotics', 'en'], [':NewsStream', {startWord: ''}], ['Humanities', 'en']];
const word2 = [['photgraphy', 'en'], ['sex', 'en'], ['art', 'en']];



const scriptName = 'post-to-ACE.js'
import('../semantic-stream.js').then(module =>
    module.default(
        [
            {

                words: word2,
                staticPrompt: {
                    pre: 'phone photo of a',
                    post: ', art performance, contemporary art,art exhibition posted to instagram, raw style'
                },
                modelProbeXX: {
                    // TARGET_MODEL: 'Qwen/Qwen2.5-72B-Instruct',//--> bad'meta-llama/Llama-3.3-70B-Instruct',
                    prompt: (totalPrompt) => {
                        return ` create a image description to start a movie  -->\n
                    ,
                     ${totalPrompt}`;
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
