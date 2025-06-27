import wordStream from 'semantic-stream'
import generator from './lib/generator/index.js'
import promptCreator from './lib/prompt-creator.js';
import pkg from './modulePolyfill.js';

import store from './lib/store.cjs';
const { require } = pkg;
const chalk = require('chalk');

const shuffleArray = array => {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const temp = array[i];
        array[i] = array[j];
        array[j] = temp;
    }
}

const { fullFillPrompt: fullFillPrompt } = generator;


const _ = {
    rnd_cnt: [], // Now an array, one counter per stream index
    async configPromptFunktion(streams) { return streams },

    getLoop: function (model, config) {

        const loop = async (streams, oldPrompt) => {


            let prompt = '';
            console.log('config.id', config.id);

            

            if (!oldPrompt) {//the last api call was an error
                prompt = config.promptFunktion
                    ? await config.promptFunktion(streams, config)
                    : await promptCreator.default(streams, config);

                //

           //     console.log('org-prompt: ', chalk.red(model.id +' '+ prompt));

                //prompt = await fullFillPrompt(prompt);
            } else {
                prompt = oldPrompt
            }

            // console.log('Prompt:---> ', chalk.yellow(prompt));

            let keepPrompt = null;
            const success = await model.prompt(prompt, config);// v
           
            console.log('XXX3:',success);


            
            // Use config.rndIndex to select the correct counter for this stream
            const idx = Number.isInteger(config.rndIndex) ? config.rndIndex : 0;


            if (!success) {
                keepPrompt = prompt;
                console.error(chalk.red('---> no success', config.model));
            } else {
                _.rnd_cnt[idx] = (_.rnd_cnt[idx] ?? 0) + 1;
                console.log(_.rnd_cnt[idx], '---> success', success, config.model);

            }

            const wait = config.pollingTime || 4000;

            if (wait) {
                setTimeout(async () => {
                    console.log('******** again ****** polling interval ', config.model, 'wait:', wait)
                    await loop(streams, keepPrompt);

                }, wait);
            }
        }


        return loop
    }
}

export default async (configs) => {

    if (!Array.isArray(configs)) {
        configs = [configs];
    }

    await store.initCache();

    configs.map(async config => {
        const words = config.words;

        const wordStreams = await wordStream.initStreams(words);

        //TODO--> server.addRoute(getNext(wordStreams, config), config)
console.log('XXX1:');

        const model = await generator.setVersion(config);

console.log('XXX2:');

        await _.getLoop(model, config)(wordStreams).then(() => {
            console.log(chalk.green('Generator ended successfully'));
        }).catch(err => {
            console.error(chalk.red('Error starting generator:', err));
        })
    });

}

