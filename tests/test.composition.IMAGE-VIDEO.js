
const word2 = [['fantasy', 'en'], ['sex', 'en'], ['art', 'en'], ['art performance', 'en']];
const scriptName = 'post-to-Img-Video.js'

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

            video: {

                folderName: 'ltxVideos-test',
                cfg: 3.0,
                steps: 30,
                motionBucketId: 127,
                fps:8,
                seed: Math.round(1204 * Math.random()),
              //  imageDir: path.resolve(__dirname, '../images/ltx-test'),
                height_ui: 512,
                width_ui: 704,
                duration_ui: 8,
                ui_guidance_scale: 6,
                improve_texture_flag: true,
                negative_prompt: 'worst quality, inconsistent motion, blurry, jittery, distorted',
                mode: 'image-to-video'

            },
            image: {


                staticPrompt: {
                    pre: '',
                    post: ', as a Donald Trump video in neo gothic wild western style '
                },
                modelProbeXX: {
                    // TARGET_MODEL: 'Qwen/Qwen2.5-72B-Instruct',//--> bad'meta-llama/Llama-3.3-70B-Instruct',
                    prompt: (totalPrompt) => {
                        return ` create a film scene description from -->\n
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
