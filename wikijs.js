const wiki = require('wikijs').default;
const cheerio = require('cheerio');
const CircularLinks = require('./CircularLinks');
const pTDiffusion = require('./post-to-diffusion');
const apiData = {
    apiUrl: 'https://de.wikipedia.org/w/api.php',
    origin: null
};


const _ = {
    charSequenceCnt: 32,

    hasMultipleMeaning: obj => (!obj.content.length && Object.keys(obj.links).length),
    getContentString: (obj => {
        const startString = obj.extract ? obj.extract : '';

        return obj.content.reduce((acc, el) => {
            acc += el.content;
            return acc;
        }, startString).replace((/  |\r\n|\n|\r/gm), " ");
    }),
    getPositionByIndex: (string, subString, index) => {
        return string.split(subString, index).join(subString).length;
    },

    removeNotInTextExistings: (concatenatedContent, links) => {
        return links.filter(link => {
            const startPos = _.getPositionByIndex(concatenatedContent, link.text, link.cnt);//concatenatedContent.indexOf(link.text);
            link.startPos = startPos;

            return startPos != -1;
        })
    },

    shortPhrase(str, dir = -1) {
        const strLen = Math.min(str.length, _.charSequenceCnt);
        let shortPhrase = '';

        if (dir == -1) {
            shortPhrase = str.substring(str.length - strLen)
        } else {
            shortPhrase = str.substring(0, strLen)
        }

        if (shortPhrase.length >= 4) {
            const a = shortPhrase.split(' ');
            a.pop();
            a.shift();

            shortPhrase = a.join(' ');
        }
        return shortPhrase;
    },


    async init(title, lang) {
        await _.getArticle(title);
        return;


        // const s = await _.searchArticle('dfsdf');
        // console.log(this.circularLinks)
        const nL = this.circularLinks.getNext();
        console.log('*********', nL.title)
        await _.getArticle(nL.title);
        return

        let stop = 0;

        const b = async () => {

            if (stop++ <= 10) {
                const cLink = this.circularLinks.getNext();

                if (cLink) {
                   // console.log(stop, cLink, 'size:', Object.keys(this.circularLinks.links).length)
                    await _.getArticle(cLink.title);
                    await b();
                } else {
                    console.log('no circular links rest')
                }
            } else {
                console.log('**** end *****')
            }

        }

        //  await b();


        //  console.log('++>', JSON.stringify(this.circularLinks, null, 2));
    }
}

class WordStream {
    constructor() {
        this.circularLinks = new CircularLinks();
    }

    async searchArticle(str = 'Maus ') {
        return wiki(apiData)
            .search(str)
            .then(async p => {
                //  console.log('p', p)
                const results = p.results;

                if (!results.length) {
                    if (str.length == 1) {
                        return Promise.reject('string to small: "' + str + '"');
                    }
                    const str2 = str.substring(0, str.length - 1);
                    //  console.log('new str: ', str2);

                    return await this.searchArticle(str2);
                }

                this.circularLinks.addLinks(results)
                return this.circularLinks.getNext().title;
                //  p.next && p.next().then(console.log)
            }, (err) => {
                return 'err', err
            });
    }

    async check(wikijsResult) {

        if (_.hasMultipleMeaning(wikijsResult)) {
            this.circularLinks.addLinks(Object.keys(wikijsResult.links));
            return this.getArticle(this.circularLinks.getNext().title);
        }

        const concatenatedContent = _.getContentString(wikijsResult);

        let linkInArticle = wikijsResult.linkOccurenceArray;
        linkInArticle = _.removeNotInTextExistings(concatenatedContent, linkInArticle);

        let startPos = 0,
            endPos = concatenatedContent.length;

        linkInArticle.forEach((link, index) => {
            const linkPrev = linkInArticle[index - 1];
            const linkNext = linkInArticle[index + 1];

            let linkPrevStartPos = 0,
                linkNextStartPos = concatenatedContent.length;

            link.info = {
                prev: '',
                next: ''
            }

            if (linkPrev) {
                // console.log(linkNext.text, linkNext.cnt)
                linkPrevStartPos = _.getPositionByIndex(concatenatedContent, linkPrev.text, linkPrev.cnt);//concatenatedContent.indexOf(linkNext.text)
                linkPrevStartPos += linkPrev.text.length;

                let prevDeltaString = concatenatedContent.substring(linkPrevStartPos, link.startPos);
                prevDeltaString = _.shortPhrase(prevDeltaString, -1);
                link.info.prev = prevDeltaString;
                wikijsResult.links[link.title].sentences.prev.push(prevDeltaString)
            }

            if (linkNext) {
                linkNextStartPos = _.getPositionByIndex(concatenatedContent, linkNext.text, linkNext.cnt);//concatenatedContent.indexOf(linkNext.text)
            }

            let nextDeltaString = concatenatedContent.substring(link.startPos + link.text.length, linkNextStartPos);
            nextDeltaString = _.shortPhrase(nextDeltaString, 1);
            link.info.next = nextDeltaString;
            wikijsResult.links[link.title].sentences.next.push(nextDeltaString)


            /*console.log('prev: ', linkPrevStartPos, link.info.next)
            console.log('act: ', link.text, link.startPos, link.text.length)
            console.log('next: ', linkNextStartPos);*/


            /* console.log('link.info: ', link.info.prev, '_ ' + link.text + ' _', link.info.next);

             console.log(' ', wikijsResult.links[link.title])
             console.log(' ')*/
        });

        this.circularLinks.addLinks(wikijsResult.links)
//        console.log(' -->this.circularLinks.links ',     this.circularLinks.links)
    }

    async getArticle(title) {
        title = encodeURI(title);
        console.log('getArticle', title)


        return wiki(apiData)
            .page(title)
            .then(async page => {

                const obj = await page
                    .chain()
                    .content()
                    .summary()
                    .image()
                    //.links()
                    .request();

                obj.content = await page.content();
                obj.linkOccurenceArray = [];//QUICKFIX to have a parallel order

                const html = await page.html()
                const $ = cheerio.load(html);

                const wellSortedLinks = {}

                const links = $('a[href*="wiki/"]').each(function (index) {
                    const href = $(this).attr('href');
                    const title = $(this).attr('title');
                    const text = $(this).text();
                    const urlArr = href.split('/');
                    // console.log(index, urlArr)

                    if (urlArr.length == 3) {
                        if (urlArr[2].indexOf(':') == -1) {
                            const urlLink = urlArr[2];

                            wellSortedLinks[title] ?
                                wellSortedLinks[title].cnt++ :
                                wellSortedLinks[title] = {
                                    cnt: 1,
                                    urlLink,
                                    title,
                                    text,
                                    sentences: {prev: [], next: []}
                                };

                            obj.linkOccurenceArray.push(JSON.parse(JSON.stringify(wellSortedLinks[title])));

                            //  console.log(index,  wellSortedLinks[title])

                        } else {
                            //  console.log('weg: -', index, $(this).attr('href'))--> images
                        }
                    }
                });

                obj.links = wellSortedLinks;

                await this.check(obj);
                // console.log( 'after check',this.circularLinks )
                return obj;
            }, async (err) => {

                const foundWord = await this.searchArticle(title);
                return await this.getArticle(foundWord);
            });
    }

    getNext() {
        return this.circularLinks.getNext();
    }
}

//_.init('Anna Maus');//a existing site
//_.init('Maus', 'de');//a existing site

const a = [ 'drugs','photography', 'animal','philosophy'];//, elephant'photographie', 'phyloosivie',esoteric
const lang = 'en';
apiData.apiUrl = `https://${lang}.wikipedia.org/w/api.php`;

const list = a.map(async word => {
    const wordStream = new WordStream();
    await wordStream.getArticle(word);

    return wordStream;
});
let stop = 0;
const again = async (wordStream, stop) => {
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

}

const getPrompt = async (wordStream) => {
    const str = wordStream.map(i => {
        // await again(i, 0);
        const link = i.getNext();
       // console.log(link)

        const prev = link.sentences.prev.shift() || '';
        const title = link.title;
        const next = link.next;

        i.getArticle(link.title);

        return [prev, title, next].join(',');
    }).join(',')

    await pTDiffusion.prompt(str);
}
const loop = async (wordStream) => {
    await getPrompt(wordStream);
    setTimeout(() => {
        loop(wordStream)
    }, 1000);

}
Promise.all(list).then(async (wordStream) => {
  await  loop(wordStream);


});

