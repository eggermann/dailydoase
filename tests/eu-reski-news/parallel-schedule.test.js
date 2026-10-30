import { describe, expect, test } from '@jest/globals';
import { advanceWorkerSchedule, claimCampaignStart, createInitialWorkerSchedule, pacedWorkerSchedule, recoverWorkerSchedule } from '../../eu-reski-news/news-scene/parallel-schedule.mjs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('persistent parallel worker schedules', () => {
  test('spaces simultaneous starts globally and remembers the last start after restart', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'campaign-pacing-'));
    try {
      const clock = join(directory, 'clock.json');
      const claims = await Promise.all(Array.from({ length: 11 }, () => claimCampaignStart(clock, 180000, 1000000)));
      expect(claims.filter((claim) => claim.claimed)).toHaveLength(1);
      expect(claims.filter((claim) => !claim.claimed).every((claim) => claim.waitMs === 180000)).toBe(true);
      expect(await claimCampaignStart(clock, 180000, 1179999)).toEqual({ claimed: false, waitMs: 1 });
      expect(await claimCampaignStart(clock, 180000, 1180000)).toEqual({ claimed: true, startAtMs: 1180000 });
      expect(pacedWorkerSchedule({ lastStartAtMs: 1000000, nextStartAtMs: 8200000 }, 1100000, 1980000).nextStartAtMs).toBe(2980000);
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
  test('derives independent 10/hour and 5/hour spacing from a common hour window', () => {
    const auto = createInitialWorkerSchedule(10_000, 360_000, 'on');
    const manual = createInitialWorkerSchedule(10_000, 720_000, 'on');
    expect(auto.nextStartAtMs).toBe(190_000);
    expect(manual.nextStartAtMs).toBe(370_000);
    expect(advanceWorkerSchedule(auto, 10_000, 360_000).schedule.nextStartAtMs).toBe(550_000);
    expect(advanceWorkerSchedule(manual, 10_000, 720_000).schedule.nextStartAtMs).toBe(1_090_000);
  });

  test('never catches up missed starts after restart or a long generation', () => {
    const recovered = recoverWorkerSchedule({ lastStartAtMs: 10_000, nextStartAtMs: 370_000 }, 1_000_000, 360_000);
    expect(recovered.nextStartAtMs).toBe(1_360_000);

    const afterLongGeneration = advanceWorkerSchedule({ nextStartAtMs: 370_000 }, 1_000_000, 360_000);
    expect(afterLongGeneration.startAtMs).toBe(1_000_000);
    expect(afterLongGeneration.schedule.nextStartAtMs).toBe(1_360_000);
  });

  test('preserves a future scheduled slot and repairs invalid saved state safely', () => {
    expect(recoverWorkerSchedule({ nextStartAtMs: 2_000 }, 1_000, 60_000).nextStartAtMs).toBe(2_000);
    expect(recoverWorkerSchedule({}, 1_000, 60_000).nextStartAtMs).toBe(61_000);
    expect(recoverWorkerSchedule({ scenePath: '/scene', intervalMs: 60_000 }, 1_000, 60_000))
      .toMatchObject({ scenePath: '/scene', intervalMs: 60_000, nextStartAtMs: 61_000 });
    expect(advanceWorkerSchedule({ scenePath: '/scene', nextStartAtMs: 2_000 }, 1_000, 60_000).schedule)
      .toMatchObject({ scenePath: '/scene', nextStartAtMs: 62_000 });
  });
});
