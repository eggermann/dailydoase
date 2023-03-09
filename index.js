//_.init('Anna Maus');//a existing site
//_.init('Maus', 'de');//a existing site

const pTDiffusion = require("./helpers/post-to-diffusion");
const WordStream = require("./helpers/WordStream");

/*let stop = 0; const again = async (wordStream, stop) => {
    if (stop++ <= 2) {
        const cLink = wordStream.getNext();

        if (cLink) {
            //   console.log(stop, cLink, 'size:', Object.keys(wordStream.circularLinks.links).length)
            await wordStream.getArticle(cLink.title);
            await again(wordStream, stop);
        } else {
            console.log('no circular links rest')
        }
    } else {
        console.log('**** end *****')
    }

}*/

const _ = {
    /*this handle the form of link*/
    async getPrompt(streams) {
        const prompt = streams.map(i => {
            // await again(i, 0);
            const link = i.getNext();
            //  console.log(link)
            const prev = link.sentences.prev.shift() || '';
            const title = link.title;
            const next = link.sentences.prev.shift() || '';

            //-->   i.getArticle(link.title);

            return [prev, title, next].join(' ').trim();
        }).join(' , ')

        //>-const shuffledArr = array => array.sort(() => 0.5 - Math.random());


await pTDiffusion.prompt(prompt + ', oil painting, UHD ');





    },
    async loop(streams) {
        await _.getPrompt(streams);

        setTimeout(async () => {
            await _.loop(streams);
        }, 1000);

    },
    async init(words) {

        const wordStreams = words.map(async wordAndLang => {
            const wordStream = new WordStream(wordAndLang[0], wordAndLang[1]);
            await wordStream.start();

            return wordStream;
        });

        Promise.all(wordStreams).then(async (streams) => {
            return await _.loop(streams);
        });
    }
}


//const words = [['medicine', 'en'], ['disney', 'en'], ['landscape', 'en'], ['esoteric', 'en']];//['drugs', 'photography', 'animal', 'philosophy'];//, elephant'photographie', 'phyloosivie',esoteric
const words = [['medicine', 'en']];//, elephant'photographie', 'phyloosivie',esoteric

(async () => {
    await _.init(words);
})()


