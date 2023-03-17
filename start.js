const getFromStableDiffusion = require('./lib/get-from-stable-diffusion');
const WordStream = require("./lib/WordStream");
const server = require("./lib/server");

let _pollingTime = null;
const shuffleArray = array => {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const temp = array[i];
        array[i] = array[j];
        array[j] = temp;
    }
}

const _ = {
    /*this handle the form of link*/


    shiftCnt: 0,


    async getPrompt(streams, options) {
        let allIn = [];
        let prompt = streams.map(i => {
            // await again(i, 0);
            const link = i.getNext();
            //  console.log(link)
            const prev = link.sentences && link.sentences.prev.shift() || '';
            const title = link.title;
            const next = link.sentences && link.sentences.next.shift() || '';

            //-->   i.getArticle(link.title);
            allIn.push(prev, title/*, next*/)
            return [prev, title/*, next*/].filter(i => i).join(' ');
        }).filter(i => i).join(',');

        allIn = allIn.filter(i => i);// randomImageOrientations :['spot on ', 'in background ']

        if (options.randomImageOrientations) {
            options.randomImageOrientations.forEach(i => {
                const pos = Math.floor(Math.random() * allIn.length);

                allIn[pos] = i + allIn[pos];
            })
        }
        shuffleArray(allIn);



        //  prompt = allIn.join(' , ');
        //>-const shuffledArr = array => array.sort(() => 0.5 - Math.random());
        return prompt;
    },
    async loop(streams, options) {

        let prompt = options.promptFunktion
            ? await options.promptFunktion(streams, options)
            : await _.getPrompt(streams, options);


        //  console.log('generated prompt', prompt);
        await _.model.prompt(prompt, options);

        setTimeout(async () => {
            await _.loop(streams, options);
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

        Promise.all(wordStreams).then(async (streams) => {
            return await _.loop(streams, options);
        });
    }
};


//const words = [['medicine', 'en'], ['disney', 'en'], ['landscape', 'en'], ['esoteric', 'en']];//['drugs', 'photography', 'animal', 'philosophy'];//, elephant'photographie', 'phyloosivie',esoteric

module.exports = async options => {
    server.init();
    await _.init(options);
}


