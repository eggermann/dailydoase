

const words = [['Davidstern', 'de'], ['Boobs', 'en'], ['Acid', 'en'], ['Movie', 'en']];//, ['Robotics', 'en'], [':NewsStream', {startWord: ''}], ['Humanities', 'en']];
const word2 = [['photgraphy', 'en'], ['sex', 'en'], ['art', 'en']];

const fluxFast = {
    fluxVariant: 'schnell',   // timestep-distilled
    width: 576,
    height: 1024,
    num_inference_steps: 4,   // 1-4 only
    guidance_scale: 0.0,      // MUST stay 0
    max_sequence_length: 256, // schnells’ hard cap
    pollingTime: 1000,
    negative_prompt: '',      // optional; keep light
    seed: Math.round(Math.random() * 1e6)
};

// 🔸  High-quality – FLUX.1-dev
const fluxHQ = {
    fluxVariant: 'dev',       // guidance-distilled
    width: 576,
    height: 1024,
    num_inference_steps: 30,  // 30 ≈ sweet-spot vs 50 ref
    guidance_scale: 3.5,      // Copied from HF example
    negative_prompt: 'blurry, oversharpened, JPEG artefacts',
    seed: Math.round(Math.random() * 1e6)
};


const fluxModel = fluxHQ;

const scriptName = 'post-to-FLUX.js'
import('../semantic-stream.js').then(module =>
    module.default(
        [
            {

                words: word2,
                staticPrompt: {
                    pre: 'phone photo of a',
                    post: ', contemporary art, posted to instagram, raw style'
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
