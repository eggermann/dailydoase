import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { articleKey } from '../scripts/news-eu-relevance.mjs';

const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'));

export function relevanceFileName(aggregate, aggregateFile) {
  const sourceSpecificName = `eu-relevance-${aggregateFile.replace(/^all-/, '').replace(/\.json$/, '')}.json`;
  const dateTag = String(aggregate.date || aggregateFile).replace(/[^a-zA-Z0-9-]/g, '-');
  return [sourceSpecificName, `eu-relevance-${dateTag}.json`];
}

export async function findRankedNewsCollections(newsDirectory) {
  let directoryEntries;
  try {
    directoryEntries = await readdir(newsDirectory);
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
  const files = directoryEntries
    .filter((name) => /^all-.*\.json$/.test(name))
    .sort()
    .reverse();
  const rankedCollections = [];

  for (const aggregateFile of files) {
    const aggregatePath = join(newsDirectory, aggregateFile);
    const aggregate = await readJson(aggregatePath);
    let relevance = null;
    let relevancePath = null;
    for (const fileName of relevanceFileName(aggregate, aggregateFile)) {
      const candidatePath = join(newsDirectory, fileName);
      try {
        relevance = await readJson(candidatePath);
        relevancePath = candidatePath;
        break;
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
    }
    if (!relevance) continue;
    if (relevance.sourceFile !== aggregateFile || !Object.keys(relevance.entries || {}).length) continue;

    const scores = new Map(Object.entries(relevance.entries).map(([key, entry]) => {
      const score = Number(entry.euRelevance);
      return [key, Number.isFinite(score) ? score : undefined];
    }));
    const seenStoryImages = new Set();
    const candidates = (aggregate.news || [])
      .map((article, index) => ({ article, aggregateIndex: index, score: scores.get(articleKey(article)) }))
      .filter(({ article }) => /^https?:\/\//i.test(article.image || '') && (article.text || article.summary))
      .sort((left, right) => (right.score ?? -1) - (left.score ?? -1)
        || (right.article.publish_date ?? '').localeCompare(left.article.publish_date ?? '')
        || left.aggregateIndex - right.aggregateIndex)
      .filter(({ article }) => {
        let imageUrl;
        try {
          imageUrl = new URL(article.image);
          imageUrl.hash = '';
        } catch {
          return false;
        }
        const storyImage = [article.source_country || '', article.publish_date || '', imageUrl.href].join('|');
        if (seenStoryImages.has(storyImage)) return false;
        seenStoryImages.add(storyImage);
        return true;
      });

    if (candidates.length) rankedCollections.push({
      aggregate,
      aggregateFile,
      aggregatePath,
      relevance,
      relevancePath,
      candidates,
      fetchedAt: aggregate.fetchedAt || null,
    });
  }

  return rankedCollections;
}
