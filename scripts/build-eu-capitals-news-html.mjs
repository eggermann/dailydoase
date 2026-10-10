import { readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const newsDirectory = join(projectDirectory, 'news-capitals');
const aggregateFiles = (await readdir(newsDirectory))
  .filter((file) => /^all-.*\.json$/.test(file))
  .sort()
  .reverse();

if (aggregateFiles.length === 0) {
  throw new Error('Keine Hauptstadt-Gesamtdatei in ./news-capitals gefunden.');
}

const aggregate = JSON.parse(await readFile(join(newsDirectory, aggregateFiles[0]), 'utf8'));

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]);
}

function safeHttpsUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.href : '';
  } catch {
    return '';
  }
}

const seen = new Map();
const articles = [];

for (const article of aggregate.news) {
  const title = (article.title ?? '')
    .normalize('NFKC')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase();
  const key = [article.source_country ?? '', article.publish_date ?? '', title].join('|');
  const existingArticle = seen.get(key);
  if (existingArticle) {
    existingArticle.capitalMatches = [...new Set([
      ...existingArticle.capitalMatches,
      ...(article.capitalMatches ?? []),
    ])];
    continue;
  }
  const uniqueArticle = { ...article, capitalMatches: [...(article.capitalMatches ?? [])] };
  seen.set(key, uniqueArticle);
  articles.push(uniqueArticle);
}

articles.sort((left, right) => (right.publish_date ?? '').localeCompare(left.publish_date ?? ''));

const capitalStats = aggregate.capitalStats.map((capital) => `
  <li><strong>${escapeHtml(capital.capital.city)}</strong> · ${capital.articleCount} Treffer${capital.error ? ' · fehlgeschlagen' : ''}</li>`).join('');

const articleCards = articles.map((article) => {
  const imageUrl = safeHttpsUrl(article.image);
  const articleUrl = safeHttpsUrl(article.url);
  const title = escapeHtml(article.title || 'Ohne Titel');
  const heading = articleUrl
    ? `<a href="${escapeHtml(articleUrl)}" target="_blank" rel="noopener noreferrer">${title}</a>`
    : title;
  const image = imageUrl ? `<img src="${escapeHtml(imageUrl)}" alt="" loading="lazy">` : '';
  const metadata = [
    article.publish_date,
    article.source_country?.toUpperCase(),
    article.language?.toUpperCase(),
    ...(article.capitalMatches ?? []),
  ].filter(Boolean).map(escapeHtml).join(' · ');
  const summary = article.summary ? `<p class="summary">${escapeHtml(article.summary)}</p>` : '';

  return `
    <article class="item">
      ${image}
      <div class="item-content">
        <p class="meta">${metadata}</p>
        <h2>${heading}</h2>
        ${summary}
      </div>
    </article>`;
}).join('');

const html = `<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="Nachrichten aus einem Umkreis von 100 km um EU-Hauptstädte am ${escapeHtml(aggregate.date)}.">
  <title>EU-Hauptstadt-News vom ${escapeHtml(aggregate.date)}</title>
  <style>
    :root { color-scheme: light; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #182230; background: #f3f5f7; }
    * { box-sizing: border-box; }
    body { margin: 0; }
    header { padding: 2rem max(1rem, calc((100vw - 1180px) / 2)); background: #132b3a; color: #fff; }
    header h1 { margin: 0 0 .4rem; font-size: clamp(1.6rem, 4vw, 2.4rem); }
    header p { margin: 0; color: #d3e2e9; }
    main { max-width: 1180px; margin: auto; padding: 1.25rem 1rem 3rem; }
    h2 { font-size: 1.1rem; line-height: 1.35; }
    .stats { display: flex; flex-wrap: wrap; gap: .45rem; padding: 0; margin: 0 0 1.4rem; list-style: none; }
    .stats li { padding: .4rem .6rem; border: 1px solid #dce2e7; border-radius: 999px; background: white; color: #52606d; font-size: .82rem; }
    .item { display: flex; gap: 1rem; margin: 0 0 .8rem; padding: .8rem; border: 1px solid #e0e5e9; border-radius: .8rem; background: white; box-shadow: 0 2px 8px #1020300a; }
    .item img { flex: 0 0 180px; width: 180px; height: 120px; border-radius: .45rem; object-fit: cover; background: #e7ebef; }
    .item-content { min-width: 0; }
    .meta { margin: 0 0 .4rem; color: #657380; font-size: .76rem; text-transform: uppercase; letter-spacing: .04em; }
    .item h2 { margin: 0 0 .4rem; }
    .item h2 a { color: #123f62; text-decoration: none; }
    .item h2 a:hover { text-decoration: underline; }
    .summary { margin: 0; color: #34414d; line-height: 1.45; }
    @media (max-width: 600px) { .item { display: block; } .item img { width: 100%; height: auto; aspect-ratio: 16 / 9; margin-bottom: .75rem; } }
  </style>
</head>
<body>
  <header>
    <h1>EU-Hauptstadt-News</h1>
    <p>Sammlung vom ${escapeHtml(aggregate.date)} · 100 km Radius · ${articles.length} eindeutige Artikel aus ${aggregate.totalArticleCount} Treffern · ${aggregate.successfulCapitalCount}/${aggregate.capitalCount} Hauptstadtabfragen erfolgreich</p>
  </header>
  <main>
    <h2>Treffer pro Hauptstadt</h2>
    <ul class="stats">${capitalStats}
    </ul>
    <h2>Artikel · neueste zuerst</h2>
    <section aria-label="Artikelliste">${articleCards}
    </section>
  </main>
</body>
</html>
`;

const outputPath = join(newsDirectory, 'articles.html');
await writeFile(outputPath, html, 'utf8');
console.log(`Statische HTML-Seite erstellt: ${outputPath} (${articles.length} Artikel)`);
