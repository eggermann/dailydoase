const word2 = [['art', 'en'], ['human body', 'en'], ['history', 'en']];
const scriptName = 'post-to-ginigen-Veo3-free.js'


import('../semantic-stream.js').then(module =>
    module.default(
        [{
            model: {
                scriptName,
                "link": {
                    "url": "ginigen/VEO3-Free",
                    "name": "ginigen VEO3-Free",
                    "alt": "the model name on hugginface"
                }
            },
            words: word2,
            folderName: 'ginigenVeo3-free',
            staticPrompt: {
                 pre: 'the fallowing is a video of a social media post :',
                post: ' raw style, eerie atmosphere',
            },

            seed: Math.round(1204 * Math.random()),
            steps: 4,//8max
            // 4:3 aspect ratio, next higher size, both dimensions multiple of 32 (e.g., 128x168)
            height: 160, // 128 is a multiple of 32
            width: 190,  // 168 is a multiple of 32, 168/128 = 4/3
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
