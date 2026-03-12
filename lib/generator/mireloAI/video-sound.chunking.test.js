import { planMireloChunks } from './video-sound.js';

describe('planMireloChunks', () => {
  test('keeps every chunk below the Mirelo max and covers full duration', () => {
    const chunks = planMireloChunks(19.2, 7.9);

    expect(chunks).toEqual([
      { index: 0, start: 0, duration: 7.9 },
      { index: 1, start: 7.9, duration: 7.9 },
      { index: 2, start: 15.8, duration: 3.4 },
    ]);
  });

  test('returns one chunk when already within limit', () => {
    expect(planMireloChunks(5.5, 7.9)).toEqual([
      { index: 0, start: 0, duration: 5.5 },
    ]);
  });

  test('redistributes the tail so no chunk drops below one second', () => {
    expect(planMireloChunks(8.333, 7.9)).toEqual([
      { index: 0, start: 0, duration: 7.333 },
      { index: 1, start: 7.333, duration: 1 },
    ]);
  });
});
