import pkg from './modulePolyfill.js';

const { require } = pkg;
const chalk = require('chalk');

import generator from './lib/generator/index.js'
import wordStream from 'semantic-stream'
import promptCreator from './lib/prompt-creator.js';

const server = require("./lib/server/index.cjs");

const dotenv = require('dotenv');


dotenv.config();


const Groq = require('groq-sdk');

const groq = new Groq({
    apiKey: process.env[process.env.GROQ_API_KEY], // This is the default and can be omitted
});



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
    rnd_cnt: 0,
    //_*this handle the form of link_*_//
    shiftCnt: 0,

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

        console.log('Prompt:---> ', chalk.yellow(prompt),_.model);

        let keepPrompt = null;

        const success = await _.model.prompt(prompt, config.prompt);// v

        console.log(_.rnd_cnt++, '----------->success', success);

        if (!success) {
            keepPrompt = prompt;
        }

        const wait = config.model?.pollingTime || 4000;

        if (wait) {
            setTimeout(async () => {
                console.log('******** again ****** polling interval ', wait)
                await _.loop(streams, config, keepPrompt);

            }, wait);
        }

    },
    async init(config) {
        _.model = await generator.setVersion(config);
        console.log(config.saveItemPath)


        if (!_.model) {
            console.error('no model ', _.model)

        }

        const words = config.words;
        const wordStreams = await wordStream.initStreams(words);

        const getNext = function (streams, options) {

            return async () => {
                //         await _.loop(streams, options);
            }
        }

        server.init(getNext(wordStreams, config), config)
        await _.loop(wordStreams, config);
    }
};

//const words = [['medicine', 'en'], ['disney', 'en'], ['landscape', 'en'], ['esoteric', 'en']];//['drugs', 'photography', 'animal', 'philosophy'];//, elephant'photographie', 'phyloosivie',esoteric

export default async config => {
    await _.init(config);

}

//const a = _.getVerbs('beautiful running rising sun of merged lives. A beautiful cron is comining over the rainbow')


