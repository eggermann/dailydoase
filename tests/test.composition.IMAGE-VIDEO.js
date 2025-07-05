
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
                folderName: 'ltxv13bDistilled',
                cfg: 1.0,
                steps: 7,
                motionBucketId: 127,
                fps: 30,
                seed: Math.round(1204 * Math.random()),
                //  imageDir: path.resolve(__dirname, '../images/ltx-test'),
                height_ui: 1024 * 2,
                width_ui: 576 * 2,
                downscale_factor: 0.6666666,
                duration_ui: 15,
                ui_guidance_scale: 1,
                decode_timestep: 0.05,
                decode_noise_scale: 0.025,
                improve_texture_flag: true,
                negative_prompt: 'worst quality, inconsistent motion, blurry, jittery, distorted',
                mode: 'image-to-video',
                useImagePrompt: true,

            },
            image: {


                staticPrompt: {
                    pre: 'phone photo of a',
                    post: ', contemporary art, art exhibition posted to instagram, raw style'
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
