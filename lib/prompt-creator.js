import { CamembertForSequenceClassification } from '@huggingface/transformers';
import { get } from 'browser-sync';
import nlp from 'compromise'

let shiftCnt = 0;
let rnd_cnt = 0;

function filterEmptys(arr) {
    return arr.filter(i => i && i.length > 1);
}

function getVerbs(phrase) {

    //  phrase='Somebody once told me the world is gonna roll me';

    // nlp('Somebody once told me the world is gonna roll me').verbs().out('array')
    const verbs = nlp(phrase).verbs().toInfinitive().out('array');
    const adjectives = nlp(phrase).adjectives().out('array');
    // console.log(t,  nlp(phrase).verbs().out('array');
    // console.log(chalk.blue(verbs));
    // console.log(chalk.red(adjectives));
    return {
        verbs: filterEmptys(verbs),
        adjectives: filterEmptys(adjectives)
    };
}

/**
 * Mixes two news objects into a prompt using Groq.
 * @param {Object} n1
 * @param {Object} n2
 * @returns {Promise<string>}
 */
async function mixNewsWithGroq(n1, n2) {
    const n1Text = JSON.stringify(n1), n2Text = JSON.stringify(n2);
    const prompt = `a detailed real only prompt for a image machine mixed from -->
    ${n1Text},${n2Text}.  pure prompt for direct use on inference,only value: the value :
    `;
    const chatCompletion = await groq.chat.completions.create({
        messages: [{ role: 'user', content: prompt }],
        model: 'mixtral-8x7b-32768',
    });
    const text = chatCompletion.choices[0].message.content;
    // console.log('textfrom GROQ----->', chalk.blue(text));
    return text;
}

/**
   * Generate a prompt for a single stream.
   * @param {Object} i - Stream object
   * @param {number} index - Index in array
   * @returns {Promise<string|Object>}
   */
async function generatePromptForStream(stream, index) {
   // console.log(`STREAM ${index}`);

    const link = await stream.getNext();

    const prev = link.sentences && link.sentences.prev.shift() || '';
    const title = link.title;
    const next = link.sentences && link.sentences.next.shift() || '';
    //console.log('++++++next : ', next, '++++++title : ', title, '++++++prev : ', prev);

    if (stream.isYP) {
        let verbs = '';
        try {
            verbs = getVerbs(next);
        } catch (err) { }
        let allIn2 = [];
        allIn2 = allIn2.concat(title, next);

        return filterEmptys(allIn2).join(' ');
    } else if (stream.isNews) {
        const n1 = link;
        const n2 = await stream.getNext();
        n1.prompt = await mixNewsWithGroq(n1, n2);

        return n1;
    } else {
        let allIn2 = [];
        allIn2 = allIn2.concat(next, title);

        return filterEmptys(allIn2).join(' ');
    }
}

function getindex(type, streams) {
    let index;
    if (type === 'linear') {
        index = shiftCnt % streams.length;
    } else if (type === 'random') {
        index = Math.floor(Math.random() * streams.length);
    } else if (type === 'sequential') {
        index = shiftCnt % streams.length;
    } else {
        index = (Math.round(shiftCnt + (Math.random() * 10))) % streams.length;
    }

    shiftCnt++;
    return index;
}

/**
 * Main prompt creation logic.
 */
export default {
    async default(streams, options) {
        let allIn = [];

        if (streams.length === 0) {
            console.error('No streams provided');
            return '';
        }
        const streamMixType = options.streamMixType || 'linear';//default'
        const meaningRotatingStreams = [];
        for (let i = 0; i < streams.length; i++) {
            const index = getindex(streamMixType, streams);
            meaningRotatingStreams.push(streams[index]);
        }

        let prompts = meaningRotatingStreams.map(generatePromptForStream);
        prompts = await Promise.all(prompts);

        if (options.randomImageOrientations) {
            prompts.forEach((i, index) => {
                const pos = Math.floor(Math.random() * (prompts.length + 1) * prompts.length);
                if (prompts[pos]) {
                    const randomPos = Math.floor(Math.random() * options.randomImageOrientations.length);
                    prompts[pos] = options.randomImageOrientations[randomPos] + ' ' + prompts[pos];
                }
            });
        }

        let prompt = prompts.join(` `);
        prompt = nlp(prompt).text();
        return prompt;
    }
}