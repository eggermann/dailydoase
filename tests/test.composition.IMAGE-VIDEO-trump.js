const scriptName = 'post-to-Img-Video.js'

import('../semantic-stream.js').then(module =>
    module.default(
        [{
            staticPrompt: ' as a Donald Trump video in wild western style ',
            //     words: [['wildlife', 'en']],
            words: [['Donald Trump', 'en'], ['History', 'en'], ['Pumpkin', 'en']],
            model: {
                scriptName
            },
            video: {

                folderName: 'ltxVideos-test',
                cfg: 3.0,
                steps: 45,
                motionBucketId: 127,
                fps: 6,
                seed: Math.round(1204 * Math.random()),
              //  imageDir: path.resolve(__dirname, '../images/ltx-test'),
                height_ui: 512,
                width_ui: 704,
                duration_ui: 8,
                ui_guidance_scale: 1,
                improve_texture_flag: true,
                negative_prompt: 'worst quality, inconsistent motion, blurry, jittery, distorted',
                mode: 'image-to-video'

            },
            image: {
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
