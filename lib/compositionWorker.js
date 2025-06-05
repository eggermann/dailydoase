import { parentPort, workerData } from 'worker_threads';
import generator from './generator/index.js';
import wordStream from 'semantic-stream';
import nlp from 'compromise';

// Helper functions
const filterEmptys = arr => arr.filter(i => i && i.length > 1);

const getVerbs = (phrase) => {
    const verbs = nlp(phrase).verbs().toInfinitive().out('array');
    const adjectives = nlp(phrase).adjectives().out('array');
    return {
        verbs: filterEmptys(verbs),
        adjectives: filterEmptys(adjectives)
    };
};

// Main prompt generation function
async function getPrompt(streams, options) {
    let shiftCnt = 0;
    const meaningRotatingStreams = [];

    for (let i = 0; i < streams.length; i++) {
        meaningRotatingStreams.push(streams[(Math.round(shiftCnt + (Math.random() * 10))) % streams.length]);
    }
    shiftCnt++;

    console.log('-------> start word mixing <----------');
    let prompts = await Promise.all(streams.map(async (stream, index) => {
        console.log('STREAM-', index);
        const link = await stream.getNext();
        
        if (stream.isYP) {
            const title = link.title;
            const next = link.sentences && link.sentences.next.shift() || '';
            return filterEmptys([title, next]).join(' ');
        } else if (stream.isNews) {
            return link.prompt || '';
        } else {
            const title = link.title;
            const next = link.sentences && link.sentences.next.shift() || '';
            return filterEmptys([next, title]).join(' ');
        }
    }));

    if (options.randomImageOrientations) {
        prompts.forEach((_, index) => {
            const pos = Math.floor(Math.random() * (prompts.length + 1) * prompts.length);
            if (prompts[pos]) {
                const randomPos = Math.floor(Math.random() * options.randomImageOrientations.length);
                prompts[pos] = options.randomImageOrientations[randomPos] + ' ' + prompts[pos];
            }
        });
    }

    return prompts.join(' ');
}

async function processComposition(config) {
    try {
        const model = await generator.setVersion(config);
        if (!model) {
            throw new Error('No model initialized');
        }

        const words = config.words;
        const wordStreams = await wordStream.initStreams(words);

        const loop = async () => {
            try {
                const prompt = await generator.fullFillPrompt(
                    config.promptFunktion ? 
                    await config.promptFunktion(wordStreams, config) : 
                    await getPrompt(wordStreams, config)
                );
                
                const success = await model.prompt(prompt, config.prompt);
                
                if (success) {
                    // Wait for polling interval before next iteration
                    const wait = config.model?.pollingTime || 4000;
                    setTimeout(loop, wait);
                } else {
                    // Retry immediately with same prompt if failed
                    loop();
                }
            } catch (error) {
                parentPort.postMessage({ type: 'error', error: error.message });
            }
        };

        // Start the processing loop
        loop();

    } catch (error) {
        parentPort.postMessage({ type: 'error', error: error.message });
    }
}

parentPort.on('message', (message) => {
    if (message.type === 'start') {
        processComposition(workerData);
    }
});