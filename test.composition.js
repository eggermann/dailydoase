const words = [['wildlife', 'en']];//, ['Robotics', 'en'], [':NewsStream', {startWord: ''}], ['Humanities', 'en']];

/*
const scriptName = 'post-to-youtube.js'

import('./start.js').then(module =>
    module.default({words, model:{
            scriptName
        }}));

*/

/*
const scriptName = 'post-to-genSeq.js'
import('./start.js').then(module =>
    module.default({
        words, model: {
            scriptName
        },
        promptFunktion: async (streams, options) => { 
            return streams;
        }
    }));
*/


const scriptName = 'post-to-FLUX.js'
import('./start.js').then(module =>
    module.default(
        [
            {
                words,
                model: {
                    scriptName,
                    fluxVariant: 'schnell', // or 'dev' for the dev endpoint
                    // imageDir: path.resolve(__dirname, '../images/flux-test'),

                },
                folderName: 'FLUX-schnell-compo-test'
            }
        ]
    ));
