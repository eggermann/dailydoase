import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, test } from '@jest/globals';
import { offlineTestEnvironment } from './offline-test-environment.js';
import { articleProgressSnapshot, commitGlobalArticleReservation, reserveGlobalArticle } from '../../eu-reski-news/news-scene/global-article-reservations.mjs';

const moduleUrl = new URL('../../eu-reski-news/news-scene/global-article-reservations.mjs', import.meta.url).href;
let temporaryRoot;

function fixtureCollection(count = 3) {
  const candidates = Array.from({ length: count }, (_, index) => ({
    article: {
      id: `article-${index + 1}`,
      title: `Article ${index + 1}`,
      source_country: 'EU',
      publish_date: `2026-10-${String(index + 1).padStart(2, '0')}`,
      image: `https://mock.invalid/${index + 1}.png`,
    },
    aggregateIndex: index,
    score: 1 - index / 10,
  }));
  return { aggregatePath: '/tmp/all-fixture.json', aggregateFile: 'all-fixture.json', aggregateHash: 'fixture-hash', candidates };
}

function startReservationProcess({ progressPath, reservationId, recordPath, candidates, holdAfterReserve = false, readyPath = '' }) {
  const program = `
    const { reserveGlobalArticle } = await import(${JSON.stringify(moduleUrl)});
    const { writeFile } = await import('node:fs/promises');
    const candidates = JSON.parse(process.env.CANDIDATES).map((candidate) => ({ ...candidate }));
    const result = await reserveGlobalArticle({
      progressPath: process.env.PROGRESS_PATH,
      collection: { aggregatePath: '/tmp/all-fixture.json', aggregateFile: 'all-fixture.json', aggregateHash: 'fixture-hash', candidates },
      reservationId: process.env.RESERVATION_ID,
      recordPath: process.env.RECORD_PATH,
      hasUsableArticleImage: async () => true,
    });
    if (process.env.HOLD_AFTER_RESERVE === '1') {
      await writeFile(process.env.READY_PATH, 'reserved');
      setInterval(() => {}, 1000);
      await new Promise(() => {});
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 400));
    process.stdout.write(JSON.stringify({ id: result.article.id, draw: result.draw }));
  `;
  const child = spawn(process.execPath, ['--input-type=module', '-e', program], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: offlineTestEnvironment({
      PROGRESS_PATH: progressPath,
      RESERVATION_ID: reservationId,
      RECORD_PATH: recordPath,
      CANDIDATES: JSON.stringify(candidates),
      HOLD_AFTER_RESERVE: holdAfterReserve ? '1' : '0',
      READY_PATH: readyPath,
    }),
  });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
  child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
  const closed = new Promise((resolveClose) => child.once('close', (code, signal) => resolveClose({ code, signal, stdout, stderr })));
  return { child, closed };
}

afterEach(async () => {
  if (temporaryRoot) await rm(temporaryRoot, { recursive: true, force: true });
  temporaryRoot = null;
});

describe('global article reservations', () => {
  test('two real worker processes cannot reserve the same article', async () => {
    temporaryRoot = await mkdtemp(join(tmpdir(), 'eu-reski-article-race-'));
    const progressPath = join(temporaryRoot, 'global-article-progress.json');
    const candidates = fixtureCollection().candidates;
    const first = startReservationProcess({
      progressPath, reservationId: 'run-a::iteration-001', recordPath: join(temporaryRoot, 'a.json'), candidates,
    });
    const second = startReservationProcess({
      progressPath, reservationId: 'run-b::iteration-001', recordPath: join(temporaryRoot, 'b.json'), candidates,
    });
    const results = await Promise.all([first.closed, second.closed]);
    expect(results.map(({ code }) => code)).toEqual([0, 0]);
    const selected = results.map(({ stdout }) => JSON.parse(stdout).id);
    expect(new Set(selected).size).toBe(2);
    const progress = JSON.parse(await readFile(progressPath, 'utf8'));
    expect(Object.values(progress.reservations).map(({ article }) => article.id).sort()).toEqual([...selected].sort());
    expect(progress.seenArticleKeys).toEqual([]);
  });

  test('releases a crashed pre-record reservation and eventually returns its article to the queue', async () => {
    temporaryRoot = await mkdtemp(join(tmpdir(), 'eu-reski-article-recovery-'));
    const progressPath = join(temporaryRoot, 'global-article-progress.json');
    const collection = fixtureCollection();
    const crashedRecordPath = join(temporaryRoot, 'crashed', 'record.json');
    const crashedReadyPath = join(temporaryRoot, 'crashed-owner-ready');
    const crashedReservation = startReservationProcess({
      progressPath,
      reservationId: 'run-crashed::iteration-001',
      recordPath: crashedRecordPath,
      candidates: collection.candidates,
      holdAfterReserve: true,
      readyPath: crashedReadyPath,
    });
    const crashDeadline = Date.now() + 5000;
    while (Date.now() < crashDeadline) {
      try { await access(crashedReadyPath); break; } catch {}
      if (crashedReservation.child.exitCode !== null) throw new Error('Reservation owner exited before it could be crashed');
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 10));
    }
    await access(crashedReadyPath);
    crashedReservation.child.kill('SIGKILL');
    const crashedResult = await crashedReservation.closed;
    expect(crashedResult.signal).toBe('SIGKILL');

    const commit = async (reservation, reservationId, recordPath) => {
      await mkdir(dirname(recordPath), { recursive: true });
      await writeFile(recordPath, JSON.stringify({ article: reservation.article }));
      return commitGlobalArticleReservation({
        progressPath,
        articleProgress: reservation.articleProgress,
        reservationId,
        article: reservation.article,
        selection: {
          sourceAggregate: collection.aggregatePath,
          aggregateHash: collection.aggregateHash,
          draw: reservation.draw,
        },
      });
    };

    const second = await reserveGlobalArticle({
      progressPath,
      collection,
      reservationId: 'run-b::iteration-001',
      recordPath: join(temporaryRoot, 'b', 'record.json'),
      hasUsableArticleImage: async () => true,
    });
    expect(second.article.id).toBe('article-2');
    await commit(second, 'run-b::iteration-001', join(temporaryRoot, 'b', 'record.json'));

    const third = await reserveGlobalArticle({
      progressPath,
      collection,
      reservationId: 'run-c::iteration-001',
      recordPath: join(temporaryRoot, 'c', 'record.json'),
      hasUsableArticleImage: async () => true,
    });
    expect(third.article.id).toBe('article-3');
    await commit(third, 'run-c::iteration-001', join(temporaryRoot, 'c', 'record.json'));

    const fourth = await reserveGlobalArticle({
      progressPath,
      collection,
      reservationId: 'run-d::iteration-001',
      recordPath: join(temporaryRoot, 'd', 'record.json'),
      hasUsableArticleImage: async () => true,
    });
    expect(fourth.article.id).toBe('article-1');
    expect(articleProgressSnapshot(fourth.articleProgress).seenArticleKeys).toHaveLength(2);
    await expect(access(crashedRecordPath)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  test('recovers a persisted record as committed after a crash before history commit', async () => {
    temporaryRoot = await mkdtemp(join(tmpdir(), 'eu-reski-article-commit-'));
    const progressPath = join(temporaryRoot, 'global-article-progress.json');
    const collection = fixtureCollection();
    const recordPath = join(temporaryRoot, 'run', 'iteration-001', 'record.json');
    await mkdir(join(temporaryRoot, 'run', 'iteration-001'), { recursive: true });
    const ownerReadyPath = join(temporaryRoot, 'owner-ready');
    const initialProcess = startReservationProcess({
      progressPath, reservationId: 'run::iteration-001', recordPath, candidates: collection.candidates,
      holdAfterReserve: true, readyPath: ownerReadyPath,
    });
    const crashDeadline = Date.now() + 5000;
    while (Date.now() < crashDeadline) {
      try { await access(ownerReadyPath); break; } catch {}
      if (initialProcess.child.exitCode !== null) throw new Error('Reservation owner exited before it could be crashed');
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 10));
    }
    await access(ownerReadyPath);
    initialProcess.child.kill('SIGKILL');
    expect((await initialProcess.closed).signal).toBe('SIGKILL');
    await mkdir(dirname(recordPath), { recursive: true });
    await writeFile(recordPath, JSON.stringify({ article: collection.candidates[0].article }));

    const next = await reserveGlobalArticle({
      progressPath, collection, reservationId: 'next::iteration-001', recordPath: join(temporaryRoot, 'next.json'),
      hasUsableArticleImage: async () => true,
    });
    expect(next.article.id).toBe('article-2');
    expect(next.articleProgress.seenArticleKeys).toHaveLength(1);
    expect(next.articleProgress.reservations['run::iteration-001'].status).toBe('committed');
  });
});
