const wiki = require('wikijs').default;
const cheerio = require('cheerio');
const CircularLinks = class {
    constructor() {
        this.links = {};
        this.usedLinks = {};
    }

    addUsedLink(link) {
        const linkKey = link.link;
        this.usedLinks[linkKey] ?
            this.usedLinks[linkKey].cnt++ :
            this.usedLinks[linkKey] = {cnt: 1};
    }

    addLinks(links) {
        links.reduce((acc, link) => {
            acc[link] ?
                acc[link].cnt++ :
                acc[link] = {cnt: 1, link};

            return acc;
        }, this.links);
    }

    getNext() {
        const firstElKey = Object.keys(this.links)[0]
        const nextEl = this.links[firstElKey];
        this.addUsedLink(nextEl);
        console.log('next circular link: ', nextEl)
        delete this.links[firstElKey];

        return nextEl.link;
    }
}


const apiData = {
    apiUrl: 'https://de.wikipedia.org/w/api.php',
    origin: null
};

const _ = {
    charSequenceCnt: 128,
    circularLinks: new CircularLinks(),
    async searchArticle(str = 'Maus ') {
        return wiki(apiData)
            .search(str)
            .then(async p => {
                console.log('p', p)
                const results = p.results;

                if (!results.length) {
                    if (str.length == 1) {
                        return Promise.reject('string to small: "' + str + '"');
                    }
                    const str2 = str.substring(0, str.length - 1);
                    console.log('new str: ', str2);

                    return await this.searchArticle(str2);
                }

                this.circularLinks.addLinks(results)
                return this.circularLinks.getNext();
                //  p.next && p.next().then(console.log)
            }, (err) => {
                return 'err', err
            });
    },
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
    removeNotExistings: (concatenatedContent, obj, linkKeys) => {
        return linkKeys.filter((i, index) => {
            const link = obj.links[i]
            const startPos = _.getPositionByIndex(concatenatedContent, link.text, link.cnt);//concatenatedContent.indexOf(link.text);
            obj.links[i].startPos = startPos;
            return startPos != -1;
        })
    },
    shortPhrase(str, dir = -1) {
        console.log('---', str.length, _.charSequenceCnt)
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

    async check(wikijsResult) {

        if (_.hasMultipleMeaning(wikijsResult)) {
            this.circularLinks.addLinks(Object.keys(wikijsResult.links));
            return this.getArticle(this.circularLinks.getNext());
        }
        const concatenatedContent = _.getContentString(wikijsResult);
        let linkKeys = Object.keys(wikijsResult.links);

        //console.log('check --->', wikijsResult.content, 'wikijsResult.links', wikijsResult.links, linkKeys)
        // console.log(concatenatedContent);

        let startPos = 0,
            endPos = concatenatedContent.length;

        linkKeys = _.removeNotExistings(concatenatedContent, wikijsResult, linkKeys);
//linkOccurenceArray//todo: for i=link.cnt{ get pos, push to info sentences}
        linkKeys = linkKeys.filter((i, index) => {

            const link = wikijsResult.links[i];
            const linkNext = linkKeys[index + 1] && wikijsResult.links[linkKeys[index + 1]];
            const linkPrev = linkKeys[index - 1] && wikijsResult.links[linkKeys[index - 1]];

            let linkPrevStartPos = 0,
                linkNextStartPos = concatenatedContent.length;

            link.info = {
                prev: '',
                next: ''
            }

            //~~~
            if (linkPrev) {
                // console.log(linkNext.text, linkNext.cnt)
                linkPrevStartPos = _.getPositionByIndex(concatenatedContent, linkPrev.text, linkPrev.cnt);//concatenatedContent.indexOf(linkNext.text)
                linkPrevStartPos += linkPrev.text.length;

                let prevDeltaString = concatenatedContent.substring(linkPrevStartPos, link.startPos);
                prevDeltaString = _.shortPhrase(prevDeltaString, -1);

            }

            if (linkNext) {
                linkNextStartPos = _.getPositionByIndex(concatenatedContent, linkNext.text, linkNext.cnt);//concatenatedContent.indexOf(linkNext.text)
            }



            // console.log('prevDeltaString: ', linkPrevStartPos, link.startPos, 'PreviewString len:', prevDeltaString)

            let nextDeltaString = concatenatedContent.substring(link.startPos + link.text.length, linkNextStartPos);
            nextDeltaString = _.shortPhrase(nextDeltaString, 1);




            console.log('prev: ', linkPrevStartPos,link.info.next)
            console.log('act: ', link.text, link.startPos, link.text.length)
            console.log('next: ', linkNextStartPos);
            console.log(' ')



            return true;
        })

    },

    async getArticle(title) {
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

                /*console.log(obj);
                 process.exit();*/


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
                                wellSortedLinks[title] = {cnt: 1, urlLink, title, text};

                            obj.linkOccurenceArray.push(title);


                            //  console.log(index,  wellSortedLinks[title])

                        } else {
                            console.log('weg: -', index, $(this).attr('href'))
                        }
                    }

                });

                console.log(wellSortedLinks)
                obj.links = wellSortedLinks;


//console.log(obj)
                await _.check(obj);
                return obj;
            }, async (err) => {

                console.log('!!!!!!', err)
                const foundWord = await _.searchArticle(title);
                return await this.getArticle(foundWord);
            });
    },

    async init(title) {
        const obj = await _.getArticle(title);
        //await _.check(obj);
        // const s = await _.searchArticle('dfsdf');
        console.log(this.circularLinks)
    }
}
_.init('Anna Maus');//a existing site
