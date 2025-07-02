const model = 'post-to-Img-Video.js'

import('../semantic-stream.js').then(module =>
    module.default(
        [{
            model,
            words: [
                ['Art', 'en'],
                ['Aktzeichnen', 'de'],
                ['Figure_drawing', 'en'],
                ['Classical_element', 'en']
            ],
            staticPrompt: {
                post: ' as animal '
            },
            //     words: [['wildlife', 'en']],

            video: {
                folderName: 'ltxv13bDistilled',
                cfg: 1.0,
                steps: 7,
                motionBucketId: 127,
                fps: 30,
                seed: Math.round(1204 * Math.random()),
                //  imageDir: path.resolve(__dirname, '../images/ltx-test'),
                height_ui: 1024,
                width_ui: 576,
                downscale_factor: 0.6666666,
                duration_ui: 10,
                ui_guidance_scale: 1,
                decode_timestep: 0.05,
                decode_noise_scale: 0.025,
                improve_texture_flag: true,
                negative_prompt: 'worst quality, inconsistent motion, blurry, jittery, distorted',
                mode: 'image-to-video'

            },
            image: {
                folderName: 'ltxv13bDistilled',
                fluxVariant: 'schnell'
            },

            promptFunktion: async (streams) => {
                return streams;
            }
        }]
    )).catch(err => {
        console.error('Error in start.js:', err);
        process.exit(1);
    });
