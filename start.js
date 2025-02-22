import pkg from './modulePolyfill.js';

const {require} = pkg;
const chalk = require('chalk');

import generator from './lib/generator/index.js'
import wordStream from 'semantic-stream'

const server = require("./lib/server/index.cjs");
const dotenv = require('dotenv');

dotenv.config();


const Groq = require('groq-sdk');

const groq = new Groq({
    apiKey: process.env[process.env.GROQ_API_KEY], // This is the default and can be omitted
});

async function mixNewsWithGroq(n1, n2) {
    //  const n1Text = n1.description, n2Text = n2.description;
    const n1Text = JSON.stringify(n1), n2Text = JSON.stringify(n2);

    const prompt = `a detailed real only prompt for a image machine mixed from -->
    ${n1Text},${n2Text}.  pure prompt for direct use on inference,only value: the value :
`;

    const chatCompletion = await groq.chat.completions.create({
        messages: [{role: 'user', content: prompt}],
        model: 'mixtral-8x7b-32768',
    });
    const text = chatCompletion.choices[0].message.content

    console.log('textfrom GROQ----->', chalk.blue(text));
    return text
}

const shuffleArray = array => {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const temp = array[i];
        array[i] = array[j];
        array[j] = temp;
    }
}
const nlp = require('compromise');
const {fullFillPrompt: fullFillPrompt} = generator;
const _ = {
    rnd_cnt: 0,
    filterEmptys: arr => arr.filter(i => i && i.length > 1),
    getVerbs: (phrase) => {


        //  phrase='Somebody once told me the world is gonna roll me';

        // nlp('Somebody once told me the world is gonna roll me').verbs().out('array')
        const verbs = nlp(phrase).verbs().toInfinitive().out('array');
        // const adjectives = nlp(phrase).verbs().adverbs().out('array');
        const adjectives = nlp(phrase).adjectives().out('array');
        // console.log(t,  nlp(phrase).verbs().out('array');
        console.log(chalk.blue(verbs));
        console.log(chalk.red(adjectives));
        return {
            verbs: _.filterEmptys(verbs),
            adjectives: _.filterEmptys(adjectives)
        };

    },
    //_*this handle the form of link_*_//
    shiftCnt: 0,
    async getPrompt(streams, options) {


        let allIn = [];
        let mains = '';

        const meaningRotatingStreams = [];

        for (let i = 0; i < streams.length; i++) {
            meaningRotatingStreams.push(streams[(Math.round(_.shiftCnt + (Math.random() * 10))) % streams.length])//pickt unterschiedlichmal streams
        }

        _.shiftCnt++
        console.log('-------> start word mixing <----------')
        let prompts = meaningRotatingStreams.map(async (i, index) => {
            console.log('STREAM-', index);

            //todo create prompt for "word in stream eg newsstream

            const link = await i.getNext();

            const prev = link.sentences && link.sentences.prev.shift() || '';
            const title = link.title;
            const next = link.sentences && link.sentences.next.shift() || '';
            console.log('++++++next : ', next, '++++++title : ', title, '++++++prev : ', prev)

            if (i.isYP) {
                let verbs = '';

                try {
                    verbs = _.getVerbs(next);
                } catch (err) {
                }

                //-->   i.getArticle(link.title);
                let allIn2 = [];
                //   allIn2 = allIn2.concat(verbs.adjectives, prev, verbs.verbs)
                //        allIn2 = allIn2.concat(title)
                allIn2 = allIn2.concat(title, next)
// allIn2 = allIn2.concat(verbs.adjectives, prev, verbs.verbs)

                return _.filterEmptys(allIn2).join(' ');
            } else if (i.isNews) {

                const n1 = link;
                const n2 = await i.getNext();
                //     console.log('----------',n1,n2);


                n1.prompt = await mixNewsWithGroq(n1, n2)

                return n1;
            } else {
                let verbs = '';

                try {
                    verbs = _.getVerbs(next);
                } catch (err) {
                }

                //-->   i.getArticle(link.title);
                let allIn2 = [];
                //   allIn2 = allIn2.concat(verbs.adjectives, prev, verbs.verbs)
                allIn2 = allIn2.concat(next, title)
// allIn2 = allIn2.concat(verbs.adjectives, prev, verbs.verbs)

                return _.filterEmptys(allIn2).join(' ');
            }
        })

        prompts = await Promise.all(prompts);

        ///NOT FOE ALLL   TODO  console.log(prompt)
        //   .join(',');
//        allIn = _.filterEmptys(allIn);// randomImageOrientations :['spot on ', 'in background ']

        //      console.log('---->',prompt)
        //  process.exit();
        if (options.randomImageOrientations) {
            prompts.forEach((i, index) => {

                const pos = Math.floor(Math.random() * (prompts.length + 1) * prompts.length);
                if (prompts[pos]) {
                    const randomPos = Math.floor(Math.random() * options.randomImageOrientations.length);
                    prompts[pos] = options.randomImageOrientations[randomPos] + ' ' + prompts[pos];
                }
            })
            /* options.randomImageOrientations.forEach((i, index) => {

                const pos = Math.floor(Math.random() * (prompt.length + 1));
                if (prompt[pos]) {
                    prompt[pos] = i + ' ' + prompt[pos];
                }

            })*/
        }

//shuffleArray(prompt);
//   prompt = prompt.join(`[${mains}] `);
        const prompt = prompts.join(` `);


// shuffleArray(prompt);

// prompt += allIn.join(',');
//>-const shuffledArr = array => array.sort(() => 0.5 - Math.random());
        return prompt;
    },
    async loop(streams, config, oldPrompt) {

        let prompt = '';

        if (!oldPrompt) {//the last api call was an error
            prompt = config.promptFunktion
                ? await config.promptFunktion(streams, config)
                : await _.getPrompt(streams, config);

            prompt = nlp(prompt).text();
            console.log('org-prompt: ', chalk.red(prompt));

//prompt = await fullFillPrompt(prompt);
        } else {
            prompt = oldPrompt
        }

        console.log('Prompt: ', chalk.yellow(prompt));

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


        if (!_.model) {
            console.error('no model ', v)
            process.exit();
        }

        const words = config.words;
        const wordStreams = await wordStream.initStreams(words);

        const getNext = function (streams, options) {

            return async () => {
       //         await _.loop(streams, options);
            }
        }

        server.init(getNext(wordStreams, config))
    await _.loop(wordStreams, config);
    }
};

//const words = [['medicine', 'en'], ['disney', 'en'], ['landscape', 'en'], ['esoteric', 'en']];//['drugs', 'photography', 'animal', 'philosophy'];//, elephant'photographie', 'phyloosivie',esoteric

export default async config => {
    await _.init(config);

}

//const a = _.getVerbs('beautiful running rising sun of merged lives. A beautiful cron is comining over the rainbow')


