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

const shuffleArray = array => {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const temp = array[i];
        array[i] = array[j];
        array[j] = temp;
    }
}

const { fullFillPrompt: fullFillPrompt } = generator;

// The semantic-stream package installs an uncaught-exception handler that
// exits immediately. Log the original error first so production runs leave a
// usable diagnosis instead of stopping after a model request without context.
process.prependListener('uncaughtException', (error) => {
    console.error('[semantic-stream] uncaught exception:', error?.stack || error);
});

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

const waitForSemanticStream = (delayMs) => new Promise((resolve) => {
    setTimeout(resolve, delayMs);
});

const isWikipediaRateLimit = (error) => {
    const message = String(error?.message || error || '');
    return message.includes('429') || message.includes('Too Many Requests');
};

export const initWordStreamsSequentially = async (
    words,
    {
        // The dependency's legacy exit hooks call process.exit() for every
        // uncaught exception. That hides the actual rendering failure and can
        // leave a trailer iteration with no diagnosable result. This process
        // owns lifecycle and error reporting, so streams must not register
        // their own global exit handlers.
        initSingleStream = (word) => wordStream.initStreams([word], {
            registerExitHandlers: false,
        }),
        pauseBetweenStreamsMs = 2000,
        rateLimitRetryMs = 10000,
        maxAttempts = 3,
        wait = waitForSemanticStream,
    } = {}
) => {
    const initializedStreams = [];

    for (let wordIndex = 0; wordIndex < words.length; wordIndex += 1) {
        const word = words[wordIndex];
        let initializedStream = null;

        for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
            try {
                const streams = await initSingleStream(word);
                initializedStream = streams[0];
                break;
            } catch (error) {
                const canRetry = isWikipediaRateLimit(error) && attempt < maxAttempts;
                if (!canRetry) {
                    throw error;
                }

                const retryDelay = rateLimitRetryMs * attempt;
                console.warn(
                    `[semantic-stream] Wikipedia rate limit for ${toWordLabel(word)}; retry ${attempt}/${maxAttempts - 1} in ${retryDelay}ms.`
                );
                await wait(retryDelay);
            }
        }

        if (!initializedStream) {
            throw new Error(`Semantic Stream failed to initialize ${toWordLabel(word)}.`);
        }
        initializedStreams.push(initializedStream);

        const hasAnotherStream = wordIndex < words.length - 1;
        if (hasAnotherStream && pauseBetweenStreamsMs > 0) {
            await wait(pauseBetweenStreamsMs);
        }
    }

    return initializedStreams;
};

export const getWordStreams = async (
    words,
    {
        forceRefresh = false,
        initStreams = initWordStreamsSequentially,
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

// Normal retries preserve the prepared prompt. Long-running renderers can
// discard a failed iteration after provider-level retries and ask their live
// word streams for fresh terms on the next scheduled run.
const resolveAdvanceOnFailure = (config = {}) => Boolean(config?.model?.advanceOnFailure);

const resolveFailureRecoveryIterations = (config = {}) => {
    const configuredCount = Number(config?.model?.failureRecoveryIterations);
    return Number.isFinite(configuredCount) && configuredCount > 0
        ? Math.floor(configuredCount)
        : 0;
};

const resolveFailureRecoveryDelayMs = (config = {}) => {
    const configuredDelay = Number(config?.model?.failureRecoveryDelayMs);
    return Number.isFinite(configuredDelay) && configuredDelay > 0
        ? configuredDelay
        : 1;
};

export const resolveMaxIterations = (config = {}) => {
    const configuredLimit = Number(config?.model?.maxIterations);
    if (configuredLimit === -1) {
        return -1;
    }
    if (Number.isFinite(configuredLimit) && configuredLimit > 0) {
        return Math.floor(configuredLimit);
    }
    return -1;
};

export const shouldScheduleNextIteration = ({
    iteration,
    maxIterations,
    wait,
    success,
    retryOnFailure,
} = {}) => {
    const reachedFiniteLimit = maxIterations !== -1 && iteration >= maxIterations;
    if (reachedFiniteLimit || !wait) {
        return false;
    }
    return success !== false || retryOnFailure;
};

const _ = {
    rnd_cnt: [], // Now an array, one counter per stream index
    async configPromptFunktion(streams) { return streams },

    getLoop: function (model, config) {
        let iteration = 0;
        let pendingFailureRecoveryIterations = 0;

        const loop = async (streams, oldPrompt) => {
            iteration += 1;

            let prompt = '';
            console.log('config.id', config.id);



            let keepPrompt = null;
            let success = false;
            try {
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
                success = await model.prompt(prompt, config);// v
            } catch (error) {
                console.error('[semantic-stream] iteration crashed before completion:', error?.stack || error);
            }
          
          
          //TODO --> somehow keep prompt when false to not repeat the same prompt eg stream get next and api calls 
            console.log('success:', success);



            // Use config.rndIndex to select the correct counter for this stream
            const idx = Number.isInteger(config.rndIndex) ? config.rndIndex : 0;


            const advanceOnFailure = resolveAdvanceOnFailure(config);
            const recoveryIteration = pendingFailureRecoveryIterations > 0;
            if (recoveryIteration) {
                pendingFailureRecoveryIterations -= 1;
            }
            if (!success) {
                keepPrompt = advanceOnFailure ? null : prompt;
                console.error(chalk.red('---> no success'), success);
                if (advanceOnFailure) {
                    if (!recoveryIteration) {
                        pendingFailureRecoveryIterations = resolveFailureRecoveryIterations(config);
                    }
                    console.warn(chalk.yellow(
                        '[semantic-stream] iteration failed after provider retries; discarding it and advancing to fresh semantic terms.'
                    ));
                }
            } else {
                _.rnd_cnt[idx] = (_.rnd_cnt[idx] ?? 0) + 1;
                //  console.log(_.rnd_cnt[idx], '---> success', success, config.model);

            }

            const hasPollingTime = !!config.model
              && Object.prototype.hasOwnProperty.call(config.model, 'pollingTime');
            const pollingWait = hasPollingTime ? config.model.pollingTime : 4000;
            const wait = pendingFailureRecoveryIterations > 0
                ? resolveFailureRecoveryDelayMs(config)
                : pollingWait;
            const retryOnFailure = resolveRetryOnFailure(config);
            const maxIterations = resolveMaxIterations(config);
            const scheduleNextIteration = shouldScheduleNextIteration({
                iteration,
                maxIterations,
                wait,
                success,
                retryOnFailure,
            });

            if (scheduleNextIteration) {
                setTimeout(async () => {
                    const nextRunLabel = pendingFailureRecoveryIterations > 0
                        ? `failure recovery; ${pendingFailureRecoveryIterations} fresh iteration(s) still queued`
                        : 'normal forward iteration';
                    console.log('******** again ****** polling interval ', 'wait:', wait, nextRunLabel)
                    await loop(streams, keepPrompt);

                }, wait);
            } else if (maxIterations !== -1 && iteration >= maxIterations) {
                console.log(chalk.green(`[semantic-stream] reached ${maxIterations} iterations; stopping in the same output folder.`));
            }

            return success;
        }


        return loop
    }
}

export const createSemanticStreamLoop = (model, config) => _.getLoop(model, config);

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

    await Promise.all(configs.map(async (config, index) => {
        const words = config.words;

        const wordStreams = await getWordStreams(words);

        //TODO--> server.addRoute(getNext(wordStreams, config), config)
        const model = await generator.setVersion(config);

        await createSemanticStreamLoop(model, config)(wordStreams).then((success) => {
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
        }).catch(err => {
            console.error(chalk.red('Error starting generator:', err));
        })
    }));

}
