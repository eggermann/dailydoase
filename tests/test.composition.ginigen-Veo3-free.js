const word2 = [['Worm', 'en'], ['sex', 'en'], ['art', 'en'], ['Ratte', 'de']];
const scriptName = 'post-to-ginigen-Veo3-free.js'




import('../semantic-stream.js').then(module =>
    module.default(
        [{
            model: {
                scriptName
            },
            words: word2,
            folderName: 'ginigenVeo3-free',
            staticPrompt: {
              //  pre: 'a handycam video of a',
                post: ' as horror movie, raw style'
            },

            seed: Math.round(1204 * Math.random()),
            steps: 4,//8max
            // 4:3 aspect ratio, next higher size, both dimensions multiple of 32 (e.g., 128x168)
            height: 128 , // 128 is a multiple of 32
            width: 168 ,  // 168 is a multiple of 32, 168/128 = 4/3
            duration_seconds: 8,
            nag_scale: 11,
            audio_steps: 50,
            audio_cfg_strength: 2.8,

            promptFunktion: async (streams) => {
                return streams;
            }
        }]
    )).catch(err => {
        console.error('Error in start.js:', err);
        process.exit(1);
    });
