import 'dotenv/config';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const EU_COUNTRIES = [
  { code: 'at', name: 'Austria' },
  { code: 'be', name: 'Belgium' },
  { code: 'bg', name: 'Bulgaria' },
  { code: 'hr', name: 'Croatia' },
  { code: 'cy', name: 'Cyprus' },
  { code: 'cz', name: 'Czechia' },
  { code: 'dk', name: 'Denmark' },
  { code: 'ee', name: 'Estonia' },
  { code: 'fi', name: 'Finland' },
  { code: 'fr', name: 'France' },
  { code: 'de', name: 'Germany' },
  { code: 'gr', name: 'Greece' },
  { code: 'hu', name: 'Hungary' },
  { code: 'ie', name: 'Ireland' },
  { code: 'it', name: 'Italy' },
  { code: 'lv', name: 'Latvia' },
  { code: 'lt', name: 'Lithuania' },
  { code: 'lu', name: 'Luxembourg' },
  { code: 'mt', name: 'Malta' },
  { code: 'nl', name: 'Netherlands' },
  { code: 'pl', name: 'Poland' },
  { code: 'pt', name: 'Portugal' },
  { code: 'ro', name: 'Romania' },
  { code: 'sk', name: 'Slovakia' },
  { code: 'si', name: 'Slovenia' },
  { code: 'es', name: 'Spain' },
  { code: 'se', name: 'Sweden' },
];

function comparePoliticsFirst(left, right) {
  const leftPolitics = left.category?.toLowerCase() === 'politics' ? 1 : 0;
  const rightPolitics = right.category?.toLowerCase() === 'politics' ? 1 : 0;
  return rightPolitics - leftPolitics
    || (right.publish_date ?? '').localeCompare(left.publish_date ?? '');
}

export function getFormattedToday(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day} 00:00:00`;
}

function getTimestamp(date) {
  return date.toISOString().replace(/[:.]/g, '-');
}

async function fetchCountryNews(country, apiKey, earliestPublishDate) {
  const params = new URLSearchParams({
    'source-country': country.code,
    'earliest-publish-date': earliestPublishDate,
    number: '100',
    sort: 'publish-time',
    'sort-direction': 'DESC',
  });

  const response = await fetch(`https://api.worldnewsapi.com/search-news?${params}`, {
    method: 'GET',
    headers: { 'x-api-key': apiKey },
  });

  if (!response.ok) {
    throw new Error(`World News API antwortet mit HTTP ${response.status}`);
  }

  return {
    data: await response.json(),
    quotaLeft: response.headers.get('X-API-Quota-Left'),
  };
}

export async function fetchMaxEuNewsToday() {
  const apiKey = process.env.WORLDNEWS_API_KEY;
  if (!apiKey) {
    throw new Error('WORLDNEWS_API_KEY fehlt. Schlüssel in .env setzen oder exportieren.');
  }

  const startedAt = new Date();
  const date = getFormattedToday(startedAt).slice(0, 10);
  const timestamp = getTimestamp(startedAt);
  const newsDirectory = fileURLToPath(new URL('../news/A/', import.meta.url));
  const countryResults = [];

  await mkdir(newsDirectory, { recursive: true });

  for (const country of EU_COUNTRIES) {
    const countryPath = join(newsDirectory, `${country.code}-${timestamp}.json`);

    try {
      const { data, quotaLeft } = await fetchCountryNews(
        country,
        apiKey,
        getFormattedToday(startedAt),
      );
      const articles = (data.news ?? []).sort(comparePoliticsFirst);

      await writeFile(countryPath, `${JSON.stringify({
        country,
        fetchedAt: startedAt.toISOString(),
        requestDate: date,
        available: data.available ?? articles.length,
        news: articles,
      }, null, 2)}\n`, 'utf8');

      countryResults.push({
        ...country,
        available: data.available ?? articles.length,
        articleCount: articles.length,
        path: countryPath,
        quotaLeft,
        news: articles,
      });
      console.log(`${country.code}: ${articles.length} Artikel`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await writeFile(countryPath, `${JSON.stringify({
        country,
        fetchedAt: new Date().toISOString(),
        requestDate: date,
        error: message,
        news: [],
      }, null, 2)}\n`, 'utf8');

      countryResults.push({
        ...country,
        available: 0,
        articleCount: 0,
        path: countryPath,
        error: message,
        news: [],
      });
      console.error(`${country.code}: ${message}`);
    }
  }

  const finishedAt = new Date();
  const allPath = join(newsDirectory, `all-${timestamp}.json`);
  const countryStats = countryResults.map(({ news, ...stats }) => stats);
  const allArticles = countryResults.flatMap((result) => result.news).sort(comparePoliticsFirst);
  const aggregate = {
    date,
    fetchedAt: finishedAt.toISOString(),
    countryCount: EU_COUNTRIES.length,
    successfulCountryCount: countryResults.filter((result) => !result.error).length,
    failedCountryCount: countryResults.filter((result) => result.error).length,
    totalArticleCount: allArticles.length,
    politicsArticleCount: allArticles.filter((article) => article.category?.toLowerCase() === 'politics').length,
    countryStats,
    paths: [...countryResults.map((result) => result.path), allPath],
    news: allArticles,
  };

  await writeFile(allPath, `${JSON.stringify(aggregate, null, 2)}\n`, 'utf8');
  console.log(`Gesamt: ${allArticles.length} Artikel aus ${EU_COUNTRIES.length} Ländern.`);
  console.log(`Tagesdatei: ${allPath}`);

  return aggregate;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  fetchMaxEuNewsToday().catch((error) => {
    console.error('Fehler beim EU-News-Abruf:', error);
    process.exitCode = 1;
  });
}
