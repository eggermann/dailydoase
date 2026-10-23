import { createHash } from 'node:crypto';

export function articleIdentity(article) {
  const normalizedTitle = (article.title ?? '')
    .normalize('NFKC')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase();
  return [article.source_country ?? '', article.publish_date ?? '', normalizedTitle].join('|');
}

export function articleKey(article) {
  return createHash('sha256').update(articleIdentity(article)).digest('hex');
}
