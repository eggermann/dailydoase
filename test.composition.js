const words = [['wildlife', 'en'], ['Robotics', 'en']];//, [':NewsStream', {startWord: ''}], ['Humanities', 'en']];

/*
const scriptName = 'post-to-youtube.js'

import('./start.js').then(module =>
    module.default({words, model:{
            scriptName
        }}));

*/


const scriptName = 'post-to-genSeq.js'
import('./start.js').then(module =>
    module.default({
        words, model: {
            scriptName
        },
        XXpromptFunktion: async (streams, options) => { 
            return streams;
        }
    }));

