// test.composition.ACE.js

const words = [['Chopin', 'en'], ['Synthesizer', 'en'], ['Melody', 'en']];
const scriptName = 'post-to-ACE.js';

import('./semantic-stream.js').then(module =>
    module.default([
        {
            words,
            model: {
                scriptName,
                audio_duration: 45,
               // prePrompt: 'A Chopin on synthesizer melody',
               // lyrics: '',
                infer_step: 50,
                // imageDir can be added if needed
            },
            folderName: 'ACE-compo-test',
             promptFunktion: async (streams, options) => {
            
                return streams;
            }
        }
    ])
);