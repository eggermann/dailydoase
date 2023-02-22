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
    async check(obj) {
        //check meaning of word
        const hasMultipleMeaning = (!obj.content.length && Object.keys(obj.links).length);
        if (hasMultipleMeaning) {

            this.circularLinks.addLinks(Object.keys(obj.links));
            return this.getArticle(this.circularLinks.getNext());
        }

        let linkKeys = Object.keys(obj.links);
        console.log('check --->', obj.content, 'obj.links', obj.links, linkKeys)
        const startString = obj.extract ? obj.extract : '';
        const concatedContent = obj.content.reduce((acc, el) => {
            acc += el.content;
            return acc;
        }, startString).replace((/  |\r\n|\n|\r/gm), " ");


        console.log(concatedContent);

        let startPos = 0,
            endPos = concatedContent.length;

        //∂ preLinkPosition+word <-> positionLink// math.min(sequenzlen, ∂)
        //∂ positionLink+linklength <-> startPostLink//
        function getPosition(string, subString, index) {
            return string.split(subString, index).join(subString).length;
        }

        linkKeys = linkKeys.filter((i, index) => {
            const link = obj.links[i]
            startPos = getPosition(concatedContent, link.text, link.cnt);//concatedContent.indexOf(link.text);
            obj.links[i].startPos = startPos;
            return startPos != -1;
        })


        linkKeys = linkKeys.filter((i, index) => {

            const link = obj.links[i]
            const link2 = linkKeys[index + 1] && obj.links[linkKeys[index + 1]];

            if (!link2) {
                endPos = concatedContent.length;
            } else {
               // console.log(link2.text, link2.cnt)
                endPos = getPosition(concatedContent, link2.text, link2.cnt) ;//concatedContent.indexOf(link2.text)
            }

            if ((endPos - link.startPos) > 0) {
                //endPos = concatedContent.length;
            }

            link.endPos = endPos;

            console.log(link.text, 'startPos: ', link.startPos, 'endPos: ', endPos)

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
                // obj.links = wellSortedLinks;


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
_.init('Anna Maus');
