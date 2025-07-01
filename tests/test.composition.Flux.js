

const words = [['Davidstern', 'de'], ['Boobs', 'en'], ['Acid', 'en'], ['Movie', 'en']];//, ['Robotics', 'en'], [':NewsStream', {startWord: ''}], ['Humanities', 'en']];
const word2 = [['sea', 'en'], ['photgraphy', 'en'], ['sex', 'en'], ['art', 'en']];


const scriptName = 'post-to-FLUX.js'
import('../semantic-stream.js').then(module =>
    module.default(
        [
            {
                staticPromptXXX: ' as a Donald Trump fan mobile shot',

                words: word2,
                modelProbe: {
                    prompt: (totalPrompt) => {
                        return ` a very short porn image description , mobile shot perspective from the following words -->\n
                    ,
                     ${totalPrompt}`;
                    },
                    max_new_tokens: 223,
                    temperature: 0.4,
                    top_p: 0.95,
                    return_full_text: false
                },

                model: {
                    pollingTime: 1000,
                    scriptName,
                    fluxVariant: 'dev', // or 'dev' for the dev endpoint,
                    guidance_scale: 0,
                    num_inference_steps: 24,
                    // imageDir: path.resolve(__dirname, '../images/flux-test'),
                },
                folderName: 'XXtest__FLUX-schnell'
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
