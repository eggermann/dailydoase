//TODO move to ./Lib
import wordStream from 'semantic-stream'

import generator from './lib/generator/index.js'
import promptCreator from './lib/prompt-creator.js';
import pkg from './lib/modulePolyfill.js';

import store from './lib/store.cjs';
const { require } = pkg;
const chalk = require('chalk');

const WORD_STREAM_CACHE_KEY = '__dailydoaseSemanticStreamCache';

const shuffleArray = array => {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const temp = array[i];
        array[i] = array[j];
        array[j] = temp;
    }
}

const { fullFillPrompt: fullFillPrompt } = generator;

const getWordStreamCache = () => {
    if (!globalThis[WORD_STREAM_CACHE_KEY]) {
        globalThis[WORD_STREAM_CACHE_KEY] = new Map();
    }

    return globalThis[WORD_STREAM_CACHE_KEY];
};

export const getWordStreamCacheKey = (words) => JSON.stringify(words ?? []);

export const clearWordStreamCache = () => {
    getWordStreamCache().clear();
};

export const getWordStreams = async (
    words,
    {
        forceRefresh = false,
        initStreams = (nextWords) => wordStream.initStreams(nextWords),
    } = {}
) => {
    const cache = getWordStreamCache();
    const cacheKey = getWordStreamCacheKey(words);

    if (forceRefresh) {
        cache.delete(cacheKey);
    }

    if (cache.has(cacheKey)) {
        return cache.get(cacheKey);
    }

    const pendingStreams = Promise.resolve()
        .then(() => initStreams(words))
        .catch((error) => {
            cache.delete(cacheKey);
            throw error;
        });

    cache.set(cacheKey, pendingStreams);
    return pendingStreams;
};

const toWordLabel = (entry) => {
    if (Array.isArray(entry)) {
        const [value, langOrOptions] = entry;
        if (typeof value === 'string' && typeof langOrOptions === 'string') {
            return `${value} (${langOrOptions})`;
        }
        if (typeof value === 'string') {
            return value;
        }
        return JSON.stringify(entry);
    }
    if (typeof entry === 'string') return entry;
    if (entry && typeof entry === 'object') {
        return entry.startWord || entry.word || JSON.stringify(entry);
    }
    return String(entry ?? '');
};

const formatLoopWords = (config, streams) => {
    const configuredWords = Array.isArray(config?.words)
        ? config.words.map(toWordLabel).filter(Boolean)
        : [];

    if (configuredWords.length > 0) {
        return configuredWords.join(' | ');
    }

    if (Array.isArray(streams)) {
        return streams
            .map((stream) => stream?.startWord || stream?.word || '')
            .filter(Boolean)
            .join(' | ');
    }

    return '';
};

const formatLoopPrompt = (prompt) => {
    if (typeof prompt === 'string') {
        return prompt.replace(/\s+/g, ' ').trim();
    }
    if (Array.isArray(prompt)) {
        return prompt.map(toWordLabel).filter(Boolean).join(' | ');
    }
    if (prompt && typeof prompt === 'object') {
        if (typeof prompt.prompt === 'string') return prompt.prompt.replace(/\s+/g, ' ').trim();
        return '';
    }
    return '';
};


const _ = {
    rnd_cnt: [], // Now an array, one counter per stream index
    async configPromptFunktion(streams) { return streams },

    getLoop: function (model, config) {
        let iteration = 0;

        const loop = async (streams, oldPrompt) => {
            iteration += 1;

            let prompt = '';
            console.log('config.id', config.id);



            if (!oldPrompt) {//the last api call was sucessfull
                prompt = config.promptFunktion
                    ? await config.promptFunktion(streams, config)
                    : await promptCreator.default(streams, config);

                //

                //     console.log('org-prompt: ', chalk.red(model.id +' '+ prompt));

                //prompt = await fullFillPrompt(prompt);
            } else {
                prompt = oldPrompt
            }

            const loopWords = formatLoopWords(config, streams);
            const loopPrompt = formatLoopPrompt(prompt);
            const logSuffix = loopPrompt && loopPrompt !== loopWords
                ? ` -> ${loopPrompt}`
                : '';
            console.log(chalk.green(`[semantic-stream] iteration ${iteration}: ${loopWords}${logSuffix}`));

            // console.log('Prompt:---> ', chalk.yellow(prompt));

            let keepPrompt = null;
            const success = await model.prompt(prompt, config);// v
          
          
          //TODO --> somehow keep prompt when false to not repeat the same prompt eg stream get next and api calls 
            console.log('success:', success);



            // Use config.rndIndex to select the correct counter for this stream
            const idx = Number.isInteger(config.rndIndex) ? config.rndIndex : 0;


            if (!success) {
                keepPrompt = prompt;
                console.error(chalk.red('---> no success'), success);
            } else {
                _.rnd_cnt[idx] = (_.rnd_cnt[idx] ?? 0) + 1;
                //  console.log(_.rnd_cnt[idx], '---> success', success, config.model);

            }

            const hasPollingTime = !!config.model
              && Object.prototype.hasOwnProperty.call(config.model, 'pollingTime');
            const wait = hasPollingTime ? config.model.pollingTime : 4000;

            if (wait) {
                setTimeout(async () => {
                    console.log('******** again ****** polling interval ', 'wait:', wait)
                    await loop(streams, keepPrompt);

                }, wait);
            }

            return success;
        }


        return loop
    }
}

export const resolveLoopOutcome = ({ success, pollingTime }) => {
    if (success === false && !pollingTime) {
        throw new Error('Generator returned false');
    }

    if (pollingTime) {
        return {
            status: success === false ? 'scheduled-retry' : 'scheduled-next-run',
            success
        };
    }

    return {
        status: 'completed',
        success
    };
}

export default async (configs) => {

    if (!Array.isArray(configs)) {
        configs = [configs];
    }

    await store.initCache();

    configs.map(async (config, index) => {
        const words = config.words;

        const wordStreams = await getWordStreams(words);

        //TODO--> server.addRoute(getNext(wordStreams, config), config)
        const model = await generator.setVersion(config);

        await _.getLoop(model, config)(wordStreams).then((success) => {
            const hasPollingTime = !!config.model
              && Object.prototype.hasOwnProperty.call(config.model, 'pollingTime');
            const pollingTime = hasPollingTime ? config.model.pollingTime : 4000;
            const outcome = resolveLoopOutcome({ success, pollingTime });

            if (outcome.status === 'completed') {
                console.log(chalk.green('Generator ended successfully'));
            } else {
                console.log(chalk.yellow(`Generator loop ${outcome.status}`));
            }
        }).catch(err => {
            console.error(chalk.red('Error starting generator:', err));
        })
    });

}
