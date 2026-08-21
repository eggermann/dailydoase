//TODO move to ./Lib
import wordStream from 'semantic-stream'

import generator from './lib/generator/index.js'
import promptCreator from './lib/prompt-creator.js';
import pkg from './lib/modulePolyfill.js';

import store from './lib/store.cjs';
const { require } = pkg;
const chalk = require('chalk');

const WORD_STREAM_CACHE_KEY = '__dailydoaseSemanticStreamCache';
const SEMANTIC_STREAM_LOG_MAX_LENGTH = 1600;
export const SEMANTIC_STREAM_TITLE_FILTER = Object.freeze(['doi', 'isbn']);

const createSemanticStreamInitOptions = () => ({
    filter: [...SEMANTIC_STREAM_TITLE_FILTER],
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
        initStreams = (nextWords, options) => wordStream.initStreams(nextWords, options),
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
        .then(() => initStreams(words, createSemanticStreamInitOptions()))
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

const truncateLogValue = (value, maxLength = SEMANTIC_STREAM_LOG_MAX_LENGTH) => {
    const normalized = String(value ?? '').trim();
    if (!normalized) {
        return '';
    }
    if (normalized.length <= maxLength) {
        return normalized;
    }
    return `${normalized.slice(0, maxLength - 3).trim()}...`;
};

const formatLoopResponse = (prompt) => {
    if (typeof prompt === 'string') {
        return truncateLogValue(prompt.replace(/\s+/g, ' ').trim());
    }

    if (Array.isArray(prompt)) {
        return truncateLogValue(prompt.map(toWordLabel).filter(Boolean).join(' | '));
    }

    if (prompt && typeof prompt === 'object') {
        if (typeof prompt.prompt === 'string') {
            return truncateLogValue(prompt.prompt.replace(/\s+/g, ' ').trim());
        }

        try {
            return truncateLogValue(JSON.stringify(prompt, null, 2));
        } catch (error) {
            return truncateLogValue(String(prompt));
        }
    }

    return truncateLogValue(String(prompt ?? ''));
};

const consumeSemanticStreamLogResponse = (config = {}) => {
    if (!config || typeof config !== 'object') {
        return '';
    }

    const customResponse = config.semanticStreamLogResponse;
    if (customResponse === undefined || customResponse === null || customResponse === '') {
        return '';
    }

    delete config.semanticStreamLogResponse;
    return formatLoopResponse(customResponse);
};

const resolveRetryOnFailure = (config = {}) => {
    if (!config?.model || !Object.prototype.hasOwnProperty.call(config.model, 'retryOnFailure')) {
        return true;
    }
    return Boolean(config.model.retryOnFailure);
};

export const shouldScheduleNextIteration = ({
    iteration = 0,
    maxIterations = null,
    pollingTime = 0,
    success,
    retryOnFailure = true,
} = {}) => {
    const parsedMaxIterations = Number(maxIterations);
    const reachedIterationLimit = Number.isFinite(parsedMaxIterations)
        && parsedMaxIterations > 0
        && iteration >= Math.floor(parsedMaxIterations);

    if (reachedIterationLimit || !pollingTime) {
        return false;
    }

    return success !== false || retryOnFailure;
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
            const loopResponse = consumeSemanticStreamLogResponse(config) || formatLoopResponse(prompt);
            if (loopResponse) {
                const responseLabel = oldPrompt ? 'base-retry-response' : 'base-response';
                console.log(chalk.magentaBright(`[semantic-stream] ${responseLabel} ${iteration}:`));
                console.log(chalk.magentaBright(loopResponse));
            }

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
            const retryOnFailure = resolveRetryOnFailure(config);

            const scheduleNextIteration = shouldScheduleNextIteration({
                iteration,
                maxIterations: config.model?.maxIterations,
                pollingTime: wait,
                success,
                retryOnFailure,
            });

            if (scheduleNextIteration) {
                setTimeout(async () => {
                    console.log('******** again ****** polling interval ', 'wait:', wait)
                    await loop(streams, keepPrompt);

                }, wait);
            } else if (Number(config.model?.maxIterations) > 0 && iteration >= Number(config.model.maxIterations)) {
                console.log(chalk.green(`[semantic-stream] reached max iterations: ${config.model.maxIterations}`));
            }

            return success;
        }


        return loop
    }
}

export const resolveLoopOutcome = ({ success, pollingTime, retryOnFailure = true }) => {
    if (success === false && !pollingTime) {
        throw new Error('Generator returned false');
    }

    if (pollingTime && (success !== false || retryOnFailure)) {
        return {
            status: success === false ? 'scheduled-retry' : 'scheduled-next-run',
            success
        };
    }

    if (success === false) {
        return {
            status: 'failed',
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

    await Promise.all(configs.map(async (config) => {
        const words = config.words;

        const wordStreams = await getWordStreams(words);

        //TODO--> server.addRoute(getNext(wordStreams, config), config)
        const model = await generator.setVersion(config);

        try {
            const success = await _.getLoop(model, config)(wordStreams);
            const hasPollingTime = !!config.model
              && Object.prototype.hasOwnProperty.call(config.model, 'pollingTime');
            const pollingTime = hasPollingTime ? config.model.pollingTime : 4000;
            const retryOnFailure = resolveRetryOnFailure(config);
            const outcome = resolveLoopOutcome({ success, pollingTime, retryOnFailure });

            if (outcome.status === 'completed') {
                console.log(chalk.green('Generator ended successfully'));
            } else {
                console.log(chalk.yellow(`Generator loop ${outcome.status}`));
            }
        } catch (err) {
            console.error(chalk.red('Error starting generator:', err));
        }
    }));

}
