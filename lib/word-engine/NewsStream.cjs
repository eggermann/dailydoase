const wikiParser = require('./wiki-parse-fkt.cjs');
const CircularLinks = require('./CircularLinks.cjs');
const WordStream = require('./WordStream.cjs');
const NewsAPI = require("newsapi");
const axios = require('axios');
require('dotenv').config({path:__dirname+'/.env'});


const newsApiKey = process.env.NEWS_API_KEY

const newsapi = new NewsAPI(newsApiKey);
const _={};
class NewsStream extends WordStream {
    constructor(options) {
        super();
        this.options = options;
        this.pageCnt = 0;
        this.circularLinks = new CircularLinks(':News');
        this.isNews = true;
    }

    async start() {
        await this.getNews();
    }

    async check(articles) {
        for (const newsKey of Object.keys(articles)) {
            const news = articles[newsKey];
            news.description = news.description || '';

            // Get previous and next sentences
            const prevDeltaString = wikiParser.shortPhrase(news.description, -1);
            const nextDeltaString = wikiParser.shortPhrase(news.content, 1);

            articles[news.title].sentences.prev.push(prevDeltaString);
            articles[news.title].sentences.next.push(nextDeltaString);
        }

        this.circularLinks.addLinks(articles);
    }

    async getSources() {
        try {
            const response = await axios.get(`https://newsapi.org/v2/top-headlines/sources?apiKey=${newsApiKey}`);
            const sources = response.data.sources.map(item => item.id).join(',');
            return sources;
        } catch (error) {
            console.error(error);
            return 'bbc.co.uk,techcrunch.com';
        }
    }

    async getNews() {
        const newsSources = await this.getSources();
        //  console.log('------>>>* getNews from sources*',sources);

        try {

            const response = await newsapi.v2.everything({
                sources: newsSources,//'bbc-news,the-verge',//https://newsapi.org/docs/endpoints/sources
                //   domains: 'bbc.co.uk,techcrunch.com',//
                language: 'en',
                // sortBy: 'popularity',//'relevancy',//default publishedAt
                pageSize: '100',
                page: 1//(++ this.pageCnt % 2)+1
            }, {noCache: true});

            const wellSortedLinks = {};

            response.articles.forEach(news => {
                const {title, description, content} = news;

                if (!wellSortedLinks[title]) {
                    wellSortedLinks[title] = {
                        cnt: 1,
                        title, description, content,
                        sentences: {prev: [], next: []}
                    };
                } else {
                    wellSortedLinks[title].cnt++;
                }
            });

           // console.log(wellSortedLinks,Object.keys(wellSortedLinks).length)

            _.wellSortedLinks=wellSortedLinks

             await this.check(wellSortedLinks);

        } catch (error) {
            console.error('Error fetching news:', error);
            return await this.check(_.wellSortedLinks);
        }
    }

    async getNext() {
        if (Object.keys(this.circularLinks.links).length <= 2) {


            const nextLinkTitle = Object.keys(this.circularLinks.usedLinks)[1];
            const nextLink = this.circularLinks.usedLinks[nextLinkTitle];

            if (nextLink) {
                //delete the first in brain to keep actuality
                delete this.circularLinks.usedLinks[nextLinkTitle];

                await this.getNews();

            }
        }

        return this.circularLinks.getNext();
    }
}

// Test Function to verify the NewsStream class
const testNewsStream = async () => {
    const options = {}; // Customize your options if needed
    const newsStream = new NewsStream(options);

    console.log('Starting NewsStream...');
    await newsStream.start();

    async function logNextLinkPeriodically() {
        while (true) {
            const nextLink = await newsStream.getNext();
           console.log('Next link:', nextLink,nextLink.title);
            await new Promise(resolve => setTimeout(resolve, 3200)); // sleep for 1200ms
        }
    }

    logNextLinkPeriodically();
};

module.exports =NewsStream;

//testNewsStream();