import { randomUUID } from 'node:crypto';
import { readFile, readdir, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { articleKey as createArticleKey } from '../scripts/news-eu-relevance.mjs';
import { isProcessOwnerAlive, processStartToken, withDirectoryLock } from './directory-lock.mjs';

const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'));

async function saveJson(path, value) {
  const temporaryPath = `${path}.${randomUUID()}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await rename(temporaryPath, path);
}

async function readProgress(progressPath, fallback) {
  const stored = await readJson(progressPath).catch((error) => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });
  return {
    ...(fallback || {}),
    ...(stored || {}),
    seenArticleKeys: [...new Set([...(fallback?.seenArticleKeys || []), ...(stored?.seenArticleKeys || [])])],
    reservations: { ...(fallback?.reservations || {}), ...(stored?.reservations || {}) },
  };
}

function reservationLockPath(progressPath) {
  return `${progressPath}.lock`;
}

async function commitReservedArticle(progress, reservationId, reservation) {
  progress.seenArticleKeys = [...new Set([...(progress.seenArticleKeys || []), reservation.articleKey])];
  progress.sourceAggregate = reservation.sourceAggregate;
  progress.aggregateHash = reservation.aggregateHash;
  progress.nextDraw = Math.max(Number(progress.nextDraw || 0), Number(reservation.draw || 0) + 1);
  progress.reservations[reservationId] = { ...reservation, status: 'committed', committedAt: new Date().toISOString() };
}

async function reconcileOrphanedReservations(progress, currentReservationId) {
  for (const [reservationId, reservation] of Object.entries(progress.reservations || {})) {
    if (reservation.status !== 'reserved' || reservationId === currentReservationId) continue;
    if (await isProcessOwnerAlive(reservation.owner) !== false) continue;

    let record;
    try { record = await readJson(reservation.recordPath); } catch (error) {
      if (error.code === 'ENOENT') {
        delete progress.reservations[reservationId];
        continue;
      }
      throw error;
    }
    if (createArticleKey(record.article) !== reservation.articleKey) {
      throw new Error(`Global article reservation ${reservationId} conflicts with its saved iteration record; refusing recovery.`);
    }
    await commitReservedArticle(progress, reservationId, reservation);
  }
}

export async function reserveGlobalArticle({
  progressPath,
  articleProgress,
  collection,
  reservationId,
  recordPath,
  hasUsableArticleImage,
}) {
  return withDirectoryLock(reservationLockPath(progressPath), async () => {
    const progress = await readProgress(progressPath, articleProgress);
    progress.reservations ||= {};
    await reconcileOrphanedReservations(progress, reservationId);

    const existing = progress.reservations[reservationId];
    if (existing?.status === 'committed') {
      throw new Error(`Global article reservation ${reservationId} is already committed; resume its saved iteration instead of starting it again.`);
    }
    if (existing?.status === 'reserved') {
      if (await stat(recordPath).then(() => true, (error) => {
        if (error.code === 'ENOENT') return false;
        throw error;
      })) {
        throw new Error(`Global article reservation ${reservationId} already has an iteration record; resume it instead of selecting another article.`);
      }
      existing.owner = { processId: process.pid, processStart: processStartToken(process.pid) };
      existing.recordPath = recordPath;
      await saveJson(progressPath, progress);
      return {
        article: existing.article,
        draw: existing.draw,
        aggregateIndex: existing.aggregateIndex,
        score: existing.score,
        articleProgress: progress,
        reservationId,
        resumedReservation: true,
      };
    }

    const reservedKeys = new Set(Object.values(progress.reservations)
      .filter(({ status }) => status === 'reserved')
      .map(({ articleKey }) => articleKey));
    const seenArticleKeys = new Set(progress.seenArticleKeys || []);
    if (!progress.seenArticleKeys?.length && progress.sourceAggregate === collection.aggregatePath) {
      for (let index = 0; index < Math.min(Number(progress.nextDraw || 0), collection.candidates.length); index += 1) {
        seenArticleKeys.add(createArticleKey(collection.candidates[index].article));
      }
    }
    const startDraw = progress.sourceAggregate === collection.aggregatePath
      ? Number(progress.nextDraw || 0) % collection.candidates.length
      : 0;
    let draw = -1;
    for (let offset = 0; offset < collection.candidates.length; offset += 1) {
      const candidateIndex = (startDraw + offset) % collection.candidates.length;
      const candidate = collection.candidates[candidateIndex];
      const key = createArticleKey(candidate.article);
      if (seenArticleKeys.has(key) || reservedKeys.has(key)) continue;
      if (await hasUsableArticleImage(candidate.article.image)) {
        draw = candidateIndex;
        break;
      }
      console.warn(`Skip article with missing or broken image: ${candidate.article.title || '(untitled)'}`);
    }
    if (draw < 0) {
      const unseen = collection.candidates.filter(({ article }) => {
        const key = createArticleKey(article);
        return !seenArticleKeys.has(key) && !reservedKeys.has(key);
      }).length;
      if (!unseen) {
        throw new Error(`Global article queue exhausted: all ${collection.candidates.length} eligible stories in ${collection.aggregateFile} were already used or reserved`);
      }
      throw new Error('No ranked article has a reachable JPEG, PNG or WebP image');
    }

    const selected = collection.candidates[draw];
    const reservation = {
      status: 'reserved',
      reservationId,
      articleKey: createArticleKey(selected.article),
      article: selected.article,
      sourceAggregate: collection.aggregatePath,
      aggregateHash: collection.aggregateHash,
      draw,
      aggregateIndex: selected.aggregateIndex,
      score: selected.score,
      recordPath,
      owner: { processId: process.pid, processStart: processStartToken(process.pid) },
      reservedAt: new Date().toISOString(),
    };
    progress.reservations[reservationId] = reservation;
    progress.sourceAggregate = collection.aggregatePath;
    progress.aggregateHash = collection.aggregateHash;
    progress.nextDraw = draw + 1;
    await saveJson(progressPath, progress);
    return { ...selected, draw, articleProgress: progress, reservationId, resumedReservation: false };
  });
}

export async function commitGlobalArticleReservation({ progressPath, articleProgress, reservationId, article, selection }) {
  return withDirectoryLock(reservationLockPath(progressPath), async () => {
    const progress = await readProgress(progressPath, articleProgress);
    progress.reservations ||= {};
    const selectedKey = createArticleKey(article);
    const reservation = progress.reservations[reservationId];
    if (reservation && reservation.articleKey !== selectedKey) {
      throw new Error(`Global article reservation ${reservationId} does not match its saved iteration article.`);
    }
    const committed = reservation || {
      articleKey: selectedKey,
      sourceAggregate: selection.sourceAggregate,
      aggregateHash: selection.aggregateHash,
      draw: selection.draw,
      committedAt: new Date().toISOString(),
    };
    await commitReservedArticle(progress, reservationId, committed);
    const committedReservations = Object.entries(progress.reservations)
      .filter(([, entry]) => entry.status === 'committed')
      .sort((left, right) => String(left[1].committedAt).localeCompare(String(right[1].committedAt)));
    for (const [oldId] of committedReservations.slice(0, Math.max(0, committedReservations.length - 128))) {
      delete progress.reservations[oldId];
    }
    await saveJson(progressPath, progress);
    return progress;
  });
}

export function articleProgressSnapshot(progress) {
  if (!progress) return null;
  const { reservations, ...snapshot } = progress;
  return snapshot;
}
