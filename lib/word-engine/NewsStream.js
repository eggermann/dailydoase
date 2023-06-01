const wikiParser = require('./wiki-parse-fkt');
const cheerio = require('cheerio');
const CircularLinks = require('./CircularLinks');
const NewsAPI = require("newsapi");
const newsapi = new NewsAPI('60e20619c511478fa03c7eed9b47011e');
const WordStream = require('./WordStream');

class NewsStream extends WordStream {
    constructor(options) {
        super()
        this.options = options;
        this.pageCnt = 0;
        this.circularLinks = new CircularLinks();
        this.startWord = options.startWord;
    }


    async start() {
        await this.getNews();
    }

    async check(articles) {

        Object.keys(articles).forEach(newsKey => {
            const news = articles[newsKey]


            const prevDeltaString = wikiParser.shortPhrase(news.description, -1);
            articles[news.title].sentences.prev.push(prevDeltaString)

            const nextDeltaString = wikiParser.shortPhrase(news.content, 1);
            articles[news.title].sentences.next.push(nextDeltaString)

        });

        this.circularLinks.addLinks(articles)
     //   console.log(' -->this.circularLinks.links ', this.circularLinks.links)
    }

    async getNews() {
        console.log('------>>>* getNews *')

        return new Promise((resolve, reject) => {

            newsapi.v2.everything({
                sources: 'bbc-news,the-verge',//https://newsapi.org/docs/endpoints/sources
                domains: 'bbc.co.uk,techcrunch.com',//
                language: 'en',
                sortBy: 'popularity',//'relevancy',//default publishedAt
                pageSize: '100',
                page: 1//(++ this.pageCnt % 2)+1
            }).then(response => {

                // console.log(response);

                const wellSortedLinks = {}

                response.articles.forEach(news => {

                    const title = news.title;
                    const description = news.description;
                    const content = news.content;
                    // const text = $(this).text();
                    //const urlArr = href.split('/');
                    // console.log(index, urlArr)

                    //    if (urlArr.length == 3) {
                    //      if (urlArr[2].indexOf(':') == -1) {
                    //           const urlLink = urlArr[2];

                    wellSortedLinks[title] ?
                        wellSortedLinks[title].cnt++ :
                        wellSortedLinks[title] = {
                            cnt: 1,
                            title, description, content,
                            sentences: {prev: [], next: []}
                        };
                });

                this.check(wellSortedLinks);
                return resolve();
            }, reject);
        })
    }

    async getNext() {


        if (Object.keys(this.circularLinks.links).length <= 20
            && Object.keys(this.circularLinks.usedLinks).length > 1) {//>= erste ist ursprungslink
            //not async
            const it = async () => {
                const nextLinkTitle = Object.keys(this.circularLinks.usedLinks)[1];//   const firstElKey = Object.keys(this.links)[0]//this.circularLinks.getNext().title
                const nextLink = this.circularLinks.usedLinks[nextLinkTitle];

                if (nextLink) {
                    delete this.circularLinks.usedLinks[nextLinkTitle];
                    await this.getNews();
                    /*
                    console.log('###### not tested; :load nextLink from used Link ----->', nextLink);
                    nextLink.usedCnt = nextLink.usedCnt ? nextLink.usedCnt++ : 1;
                    const nl = JSON.parse(JSON.stringify(nextLink));

                    delete this.circularLinks.usedLinks[nextLinkTitle];


                    if (nextLink.usedCnt > 4) {
                        console.log('###### not tested; :load nextLink from used Link ----->', nl);
                        await this.getNext(nextLinkTitle);
                    } else {
                        this.circularLinks.usedLinks[nextLinkTitle] = nl;
                        await it();
                    }*/
                }
            }
            await it();
        }

        return this.circularLinks.getNext();
    }
}


module.exports = NewsStream;