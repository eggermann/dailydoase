import { describe, expect, test } from '@jest/globals';
import { autoDirectorPromptVersion } from '../../eu-reski-news/news-scene/auto-director.mjs';
import { isReadyForExhibition } from '../../eu-reski-news/news-scene/exhibition-readiness.mjs';

const scene = (index) => ({ index });

describe('exhibition readiness', () => {
  test('allows new one-scene Auto iterations with zero glue bridges', () => {
    const autoSingleScene = {
      status: 'Abgeschlossen',
      autoMode: true,
      autoDecision: { promptVersion: autoDirectorPromptVersion },
      sceneCount: 1,
      plan: { scenes: [scene(1)] },
    };
    expect(isReadyForExhibition(autoSingleScene, [true])).toBe(true);
    expect(isReadyForExhibition(autoSingleScene, [false])).toBe(false);
  });

  test('keeps manual and historical singleton behavior, while allowing later iterations after Auto singleton', () => {
    const manualSingleScene = { status: 'Abgeschlossen', plan: { scenes: [scene(1)] } };
    const historicalAuto = {
      status: 'Abgeschlossen',
      autoMode: true,
      autoDecision: { promptVersion: 'eu-reski-auto-director-v1' },
      sceneCount: 1,
      plan: { scenes: [scene(1)] },
    };
    const manualTwoScenes = { status: 'Abgeschlossen', plan: { scenes: [scene(1), scene(2)] } };
    expect(isReadyForExhibition(manualSingleScene, [true])).toBe(false);
    expect(isReadyForExhibition(historicalAuto, [true])).toBe(false);
    expect([isReadyForExhibition({
      status: 'Abgeschlossen',
      autoMode: true,
      autoDecision: { promptVersion: autoDirectorPromptVersion },
      sceneCount: 1,
      plan: { scenes: [scene(1)] },
    }, [true]), isReadyForExhibition(manualTwoScenes, [true, true])]).toEqual([true, true]);
  });
});
