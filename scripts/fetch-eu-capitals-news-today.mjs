import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const CAPITALS = [
  { code: 'at', country: 'Austria', city: 'Vienna', latitude: 48.2082, longitude: 16.3738 },
  { code: 'be', country: 'Belgium', city: 'Brussels', latitude: 50.8503, longitude: 4.3517 },
  { code: 'bg', country: 'Bulgaria', city: 'Sofia', latitude: 42.6977, longitude: 23.3219 },
  { code: 'hr', country: 'Croatia', city: 'Zagreb', latitude: 45.815, longitude: 15.9819 },
  { code: 'cy', country: 'Cyprus', city: 'Nicosia', latitude: 35.1856, longitude: 33.3823 },
  { code: 'cz', country: 'Czechia', city: 'Prague', latitude: 50.0755, longitude: 14.4378 },
  { code: 'dk', country: 'Denmark', city: 'Copenhagen', latitude: 55.6761, longitude: 12.5683 },
  { code: 'ee', country: 'Estonia', city: 'Tallinn', latitude: 59.437, longitude: 24.7536 },
  { code: 'fi', country: 'Finland', city: 'Helsinki', latitude: 60.1699, longitude: 24.9384 },
  { code: 'fr', country: 'France', city: 'Paris', latitude: 48.8566, longitude: 2.3522 },
  { code: 'de', country: 'Germany', city: 'Berlin', latitude: 52.52, longitude: 13.405 },
  { code: 'gr', country: 'Greece', city: 'Athens', latitude: 37.9838, longitude: 23.7275 },
  { code: 'hu', country: 'Hungary', city: 'Budapest', latitude: 47.4979, longitude: 19.0402 },
  { code: 'ie', country: 'Ireland', city: 'Dublin', latitude: 53.3498, longitude: -6.2603 },
  { code: 'it', country: 'Italy', city: 'Rome', latitude: 41.9028, longitude: 12.4964 },
  { code: 'lv', country: 'Latvia', city: 'Riga', latitude: 56.9496, longitude: 24.1052 },
  { code: 'lt', country: 'Lithuania', city: 'Vilnius', latitude: 54.6872, longitude: 25.2797 },
  { code: 'lu', country: 'Luxembourg', city: 'Luxembourg', latitude: 49.6116, longitude: 6.1319 },
  { code: 'mt', country: 'Malta', city: 'Valletta', latitude: 35.8992, longitude: 14.5141 },
  { code: 'nl', country: 'Netherlands', city: 'Amsterdam', latitude: 52.3676, longitude: 4.9041 },
  { code: 'pl', country: 'Poland', city: 'Warsaw', latitude: 52.2297, longitude: 21.0122 },
  { code: 'pt', country: 'Portugal', city: 'Lisbon', latitude: 38.7223, longitude: -9.1393 },
  { code: 'ro', country: 'Romania', city: 'Bucharest', latitude: 44.4268, longitude: 26.1025 },
  { code: 'sk', country: 'Slovakia', city: 'Bratislava', latitude: 48.1486, longitude: 17.1077 },
  { code: 'si', country: 'Slovenia', city: 'Ljubljana', latitude: 46.0569, longitude: 14.5058 },
  { code: 'es', country: 'Spain', city: 'Madrid', latitude: 40.4168, longitude: -3.7038 },
  { code: 'se', country: 'Sweden', city: 'Stockholm', latitude: 59.3293, longitude: 18.0686 },
];

const RADIUS_KM = 100;
const NEWS_DIRECTORY = './news-capitals';

function getLocalDate(date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Berlin',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function getTimestamp(date) {
  return date.toISOString().replace(/[:.]/g, '-');
}

async function fetchCapitalNews(capital, apiKey, earliestPublishDate) {
  const params = new URLSearchParams({
    'location-filter': `${capital.latitude},${capital.longitude},${RADIUS_KM}`,
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

export async function fetchEuCapitalsNewsToday() {
  const apiKey = process.env.WORLDNEWS_API_KEY;
  if (!apiKey) {
    throw new Error('WORLDNEWS_API_KEY fehlt. Schlüssel in .env setzen oder exportieren.');
  }

  const startedAt = new Date();
  const date = getLocalDate(startedAt);
  const timestamp = getTimestamp(startedAt);
  const earliestPublishDate = `${date} 00:00:00`;
  const capitalResults = [];

  await mkdir(NEWS_DIRECTORY, { recursive: true });

  for (const capital of CAPITALS) {
    const path = join(NEWS_DIRECTORY, `${capital.code}-${timestamp}.json`);
    try {
      const { data, quotaLeft } = await fetchCapitalNews(capital, apiKey, earliestPublishDate);
      const news = (data.news ?? []).map((article) => ({
        ...article,
        capitalMatches: [capital.city],
      }));
      const result = {
        capital,
        radiusKm: RADIUS_KM,
        fetchedAt: new Date().toISOString(),
        requestDate: date,
        available: data.available ?? news.length,
        articleCount: news.length,
        path,
        quotaLeft,
        news,
      };
      await writeFile(path, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
      capitalResults.push(result);
      console.log(`${capital.city}: ${news.length} Artikel${quotaLeft ? ` · Restkontingent ${quotaLeft}` : ''}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const result = {
        capital,
        radiusKm: RADIUS_KM,
        fetchedAt: new Date().toISOString(),
        requestDate: date,
        articleCount: 0,
        path,
        error: message,
        news: [],
      };
      await writeFile(path, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
      capitalResults.push(result);
      console.error(`${capital.city}: ${message}`);
    }
  }

  const finishedAt = new Date();
  const allPath = join(NEWS_DIRECTORY, `all-${timestamp}.json`);
  const rawArticles = capitalResults.flatMap(({ news }) => news);
  const aggregate = {
    date,
    fetchedAt: finishedAt.toISOString(),
    radiusKm: RADIUS_KM,
    capitalCount: CAPITALS.length,
    successfulCapitalCount: capitalResults.filter(({ error }) => !error).length,
    failedCapitalCount: capitalResults.filter(({ error }) => error).length,
    totalArticleCount: rawArticles.length,
    capitalStats: capitalResults.map(({ news, ...stats }) => stats),
    paths: [...capitalResults.map(({ path }) => path), allPath],
    news: rawArticles,
  };

  await writeFile(allPath, `${JSON.stringify(aggregate, null, 2)}\n`, 'utf8');
  console.log(`Gesamt: ${rawArticles.length} API-Treffer aus ${CAPITALS.length} Hauptstadt-Radien.`);
  console.log(`Tagesdatei: ${allPath}`);
  return aggregate;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  fetchEuCapitalsNewsToday().catch((error) => {
    console.error('Fehler beim Hauptstadt-News-Abruf:', error);
    process.exitCode = 1;
  });
}
