const getFromStableDiffusion = require('./lib/get-from-stable-diffusion');
const WordStream = require("./lib/WordStream");
const server = require("./lib/server");

const chalk = require('chalk');
let _pollingTime = null;
const shuffleArray = array => {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const temp = array[i];
        array[i] = array[j];
        array[j] = temp;
    }
}
const nlp = require('compromise');
const _ = {
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
    /*this handle the form of link*/
    shiftCnt: 0,
    async getPrompt(streams, options) {
        let allIn = [];
        let mains = ''

        const meaningRotatingStreams = [];

        for (let i = 0; i <= streams.length; i++) {
            meaningRotatingStreams.push(streams[(i + _.shiftCnt) % streams.length])
        }
        _.shiftCnt++

        let prompt = meaningRotatingStreams.map(i => {
            // await again(i, 0);
            const link = i.getNext();
            //  console.log(link)
            const prev = link.sentences && link.sentences.prev.shift() || '';
            const title = link.title;
            const next = link.sentences && link.sentences.next.shift() || '';

            const verbs = _.getVerbs(next);
            //-->   i.getArticle(link.title);
            allIn.push(verbs.verbs, verbs.adjectives)
            return _.filterEmptys([prev, title/* next*/]).join(' ');
        }).filter(i => i)
        //   .join(',');
        allIn = _.filterEmptys(allIn);// randomImageOrientations :['spot on ', 'in background ']

        if (options.randomImageOrientations) {
            options.randomImageOrientations.forEach((i, index) => {

                const pos = Math.floor(Math.random() * (prompt.length - 1));

                prompt[pos] = i + ' ' + prompt[pos];
            })
        }

        //shuffleArray(prompt);
        //   prompt = prompt.join(`[${mains}] `);
        prompt = prompt.join(`,`);
        // shuffleArray(prompt);

        prompt += allIn.join(',');
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
        } else {
            prompt = oldPrompt
        }

        console.log(chalk.yellow(prompt));
        // ----------->
        const success = await _.model.prompt(prompt, options);

        let keepPrompt = null;
        if (!success) {
            keepPrompt = prompt;
        }

        setTimeout(async () => {
            console.log('******** again ******')
            await _.loop(streams, options, keepPrompt);

        }, _.model.config.pollingTime);
    },
    async init(options) {
        _.model = getFromStableDiffusion.setVersion('webUi');//('huggin');

        const wordStreams = options.words.map(async wordAndLang => {
            const wordStream = new WordStream(wordAndLang[0], wordAndLang[1]);

            if (options.circularLinksGetNext) {
                wordStream.circularLinks.getNext =
                    options.circularLinksGetNext.bind(wordStream.circularLinks);
            }

            await wordStream.start();
            return wordStream;
        });

        return Promise.all(wordStreams).then(async (streams) => {
            return await _.loop(streams, options);
        });
    }
};

//const words = [['medicine', 'en'], ['disney', 'en'], ['landscape', 'en'], ['esoteric', 'en']];//['drugs', 'photography', 'animal', 'philosophy'];//, elephant'photographie', 'phyloosivie',esoteric

module.exports = async options => {
    server.init();
    await _.init(options);
}

//const a = _.getVerbs('beautiful running rising sun of merged lives. A beautiful cron is comining over the rainbow')