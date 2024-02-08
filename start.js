import pkg from './modulePolyfill.js';

const {require} = pkg;
const chalk = require('chalk');
import getFromStableDiffusion from './lib/get-from-stable-diffusion/index.js'

const WordStream = require("./lib/word-engine/WordStream.cjs");
const NewsStream = require("./lib/word-engine/NewsStream.cjs");

const YPStream = require("./lib/word-engine/ypCommentsStream.cjs");
const server = require("./lib/server/index.cjs");
const onExit = require('./lib/helper/onExit.cjs');


const shuffleArray = array => {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const temp = array[i];
        array[i] = array[j];
        array[j] = temp;
    }
}
const nlp = require('compromise');
const {fullFillPrompt: fullFillPrompt} = getFromStableDiffusion;
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

      //  for (let i = 0; i < streams.length; i++) {
            meaningRotatingStreams.push(streams[(_.shiftCnt) % streams.length])
    //    }
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
            console.log()

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
                allIn2 = allIn2.concat(title,next)
// allIn2 = allIn2.concat(verbs.adjectives, prev, verbs.verbs)

                return _.filterEmptys(allIn2).join(' ');
            } else {
                let verbs = '';

                try {
                    verbs = _.getVerbs(next);
                } catch (err) {
                }

                //-->   i.getArticle(link.title);
                let allIn2 = [];
                //   allIn2 = allIn2.concat(verbs.adjectives, prev, verbs.verbs)
                allIn2 = allIn2.concat(next ,title)
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
    async loop(streams, options, oldPrompt) {

        let prompt = '';

        if (!oldPrompt) {
            prompt = options.promptFunktion
                ? await options.promptFunktion(streams, options)
                : await _.getPrompt(streams, options);

            prompt = nlp(prompt).text();
            console.log('org-prompt: ', chalk.red(prompt));

//prompt = await fullFillPrompt(prompt);
        } else {
            prompt = oldPrompt
        }

        //  console.log('Prompt: ', chalk.yellow(prompt), _.model);
// ----------->
        let keepPrompt = null;

        const success = await _.model.prompt(prompt, options);// v
        console.log(_.rnd_cnt++, '----------->success', success);

        if (!success) {
            keepPrompt = prompt;
        }

        const wait = _.model.config.pollingTime

        if (wait) {
            setTimeout(async () => {
                console.log('******** again ******pollingTime after ', wait)
                await _.loop(streams, options, keepPrompt);

            }, wait);
        }

    },
    async init(options) {
        const v = options.model ? options.model : 'webUi'
        _.model = await getFromStableDiffusion.setVersion(v);
        if(!  _.model ){
            console.error('no model ',v)
            process.exit();
        }

        const wordStreams = options.words.map(async wordAndLang => {
            let wordStream = null;

            if (wordAndLang[0][0] == ':') {
                const options = wordAndLang[1];

                if (wordAndLang[0] == ':YP') {
                    wordStream = new YPStream(options);
                } else {//news}
                    wordStream = new NewsStream(options);
                }
            } else {
//default wiki
                wordStream = new WordStream(wordAndLang[0], wordAndLang[1]);
            }

//readin nextfunction
            if (options.circularLinksGetNext) {
                wordStream.circularLinks.getNext =
                    options.circularLinksGetNext.bind(wordStream.circularLinks);
            }

            if (!wordStream.circularLinks.loadedFromCrash) {
                await wordStream.start();
            } else {
                console.log(wordStream.startWord, ' global.loadedFromCrash  ', wordStream.circularLinks.loadedFromCrash)
            }

            return wordStream;
        });

        return Promise.all(wordStreams).then(async (streams) => {

            onExit(streams);

            const getNext=function(streams, options){

                return async()=>{
                    await _.loop(streams, options);
                }
            }

            server.init(getNext(streams, options))
            await _.loop(streams, options);
        });
    }
};

//const words = [['medicine', 'en'], ['disney', 'en'], ['landscape', 'en'], ['esoteric', 'en']];//['drugs', 'photography', 'animal', 'philosophy'];//, elephant'photographie', 'phyloosivie',esoteric

export default async options => {

    await _.init(options);

}

//const a = _.getVerbs('beautiful running rising sun of merged lives. A beautiful cron is comining over the rainbow')
