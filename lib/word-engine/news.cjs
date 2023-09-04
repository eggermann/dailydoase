const NewsAPI = require('newsapi');
const newsapi = new NewsAPI('60e20619c511478fa03c7eed9b47011e');
//https://www.npmjs.com/package/newsapi
newsapi.v2.everything({
    sources: 'bbc-news,the-verge',
    domains: 'bbc.co.uk,techcrunch.com',
    language: 'en',
    sortBy: 'publishedAt',
    page: 2
}, {noCache: true}).then(response => {
   // console.log(response);
    console.log(response.articles[0]);
    /*
      {
        status: "ok",
        articles: [...]
      }
    */
});
