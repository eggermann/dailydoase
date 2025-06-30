

const words = [['Davidstern', 'de'], ['Boobs', 'en'], ['Acid', 'en'], ['Movie', 'en']];//, ['Robotics', 'en'], [':NewsStream', {startWord: ''}], ['Humanities', 'en']];
const word2 = [['Davidstern', 'de'], ['Davidstern', 'en'], ['Davidstern', 'fr']];


const scriptName = 'post-to-FLUX.js'
import('../semantic-stream.js').then(module =>
    module.default(
        [
            {
                staticPrompt: ' as a Donald Trump fan mobile shot',

                words: words,
                modelProbePromptXXX:(totalPrompt)=>{
                    return `create a erotic dirty image description with the following:
                     ${totalPrompt} <-- use strong adjectives and nouns, no verbs, no adverbs, no articles, no prepositions`;
                },

                model: {
                    pollingTime: 1000,
                    scriptName,
                    fluxVariant: 'dev', // or 'dev' for the dev endpoint,
                    guidance_scale:0,
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