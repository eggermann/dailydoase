import { describe, expect, test } from '@jest/globals';
import { mergeRunnerArguments } from '../../eu-reski-news/news-scene/runner-arguments.mjs';

const paths = { newsDirectory: '/news', outputDirectory: '/output' };

describe('exhibition CLI argument precedence', () => {
  test('explicit disable flags override scene/default settings', () => {
    const merged = mergeRunnerArguments([
      '--use-style-reference', '--use-guernica-figure-reference',
      '--preserve-cubist-video-style', '--videos-after-each-iteration',
    ], [
      '--no-style-reference', '--no-guernica-figure-reference',
      '--no-preserve-cubist-video-style', '--no-videos-after-each-iteration',
      '--iterator-plan=/saved/plan.json',
    ], paths);

    for (const flag of ['--use-style-reference', '--use-guernica-figure-reference', '--preserve-cubist-video-style', '--videos-after-each-iteration']) {
      expect(merged).not.toContain(flag);
    }
    expect(merged).toEqual(expect.arrayContaining([
      '--no-style-reference', '--no-guernica-figure-reference',
      '--no-preserve-cubist-video-style', '--no-videos-after-each-iteration',
      '--iterator-plan=/saved/plan.json',
    ]));
  });

  test('explicit enable flags override disabled defaults and finite iteration count follows exhibition limit', () => {
    const merged = mergeRunnerArguments([
      '--no-style-reference', '--no-guernica-figure-reference',
      '--no-preserve-cubist-video-style', '--no-videos-after-each-iteration',
      '--iterations=-1',
    ], [
      '--use-style-reference', '--use-guernica-figure-reference',
      '--preserve-cubist-video-style', '--videos-after-each-iteration',
      '--iterations=3',
    ], { ...paths, stopAfterIterations: 3 });

    for (const flag of ['--no-style-reference', '--no-guernica-figure-reference', '--no-preserve-cubist-video-style', '--no-videos-after-each-iteration', '--iterations=-1']) {
      expect(merged).not.toContain(flag);
    }
    expect(merged).toEqual(expect.arrayContaining([
      '--use-style-reference', '--use-guernica-figure-reference',
      '--preserve-cubist-video-style', '--videos-after-each-iteration', '--iterations=3',
    ]));
    expect(() => mergeRunnerArguments([], ['--iterations=4'], { ...paths, stopAfterIterations: 3 }))
      .toThrow(/stop-after-iterations/);
  });
});
