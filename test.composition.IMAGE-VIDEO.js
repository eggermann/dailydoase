const scriptName = 'post-to-Img-Video.js'

import('./semantic-stream.js').then(module =>
    module.default(
        [{
            words: [['wildlife', 'en']],
           // words: [['Donald Trump', 'en']],//,['History', 'en'],['Pumpkin', 'en']
            model: {
                scriptName
            },
            video: {
                //width_ui: 256,
               // height_ui: 256,
               // randomize_seed: false,                 // we control the seed manually
               // seed_ui: Math.floor(Math.random() * 1e9) // different seed on every run
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
