import { describe, expect, test } from '@jest/globals';
import { advanceWorkerSchedule, createInitialWorkerSchedule, recoverWorkerSchedule } from '../../eu-reski-news/news-scene/parallel-schedule.mjs';

describe('persistent parallel worker schedules', () => {
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
