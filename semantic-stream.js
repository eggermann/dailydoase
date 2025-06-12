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

    async loop(streams, config, oldPrompt) {
        let prompt = '';

        if (!oldPrompt) {//the last api call was an error
            prompt = config.promptFunktion
                ? await config.promptFunktion(streams, config)
                : await promptCreator.default(streams, config);

            //

            console.log('org-prompt: ', chalk.red(prompt));

            //prompt = await fullFillPrompt(prompt);
        } else {
            prompt = oldPrompt
        }

        // console.log('Prompt:---> ', chalk.yellow(prompt));

        let keepPrompt = null;
        const success = await _.model.prompt(prompt, config.prompt);// v

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
                await _.loop(streams, config, keepPrompt);

            }, wait);
        }
    },
}

export default async (configs) => {

    if (!Array.isArray(configs)) {
        configs = [configs];
    }

    await store.initCache();

    const config = configs.map(async config => {
        const words = config.words;
        const wordStreams = await wordStream.initStreams(words);

        //TODO--> server.addRoute(getNext(wordStreams, config), config)

        _.model = await generator.setVersion(config);

        await _.loop(wordStreams, config).then(() => {
            console.log(chalk.green('Generator ended successfully'));
        }).catch(err => {
            console.error(chalk.red('Error starting generator:', err));
        })
    });

}

