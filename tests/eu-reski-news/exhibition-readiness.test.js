import { describe, expect, test } from '@jest/globals';
import { autoDirectorPromptVersion } from '../../eu-reski-news/news-scene/auto-director.mjs';
import { getReadyIterations, isReadyForExhibition } from '../../eu-reski-news/news-scene/exhibition-readiness.mjs';
import { terminalVideoFailure } from '../../eu-reski-news/news-scene/abandoned-iteration.mjs';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const scene = (index) => ({ index });

describe('exhibition readiness', () => {
  test('skips a permanently aborted iteration without hiding a later finished film', async () => {
    const run = await mkdtemp(join(tmpdir(), 'exhibition-aborted-'));
    try {
      await writeFile(join(run, 'run.json'), JSON.stringify({ iterations: [{ directory: 'iteration-001' }, { directory: 'iteration-002' }] }));
      for (const name of ['iteration-001', 'iteration-002']) await mkdir(join(run, name, 'media'), { recursive: true });
      await writeFile(join(run, 'iteration-001', 'record.json'), JSON.stringify({ exhibitionAbandoned: { status: 'aborted' } }));
      await writeFile(join(run, 'iteration-002', 'record.json'), JSON.stringify({ status: 'Abgeschlossen', plan: { scenes: [scene(1), scene(2)] } }));
      for (const index of [1, 2]) await writeFile(join(run, 'iteration-002', 'media', `scene-${index}-video.mp4`), 'video');
      expect((await getReadyIterations(run)).map((entry) => entry.directory)).toEqual(['iteration-002']);
      expect(terminalVideoFailure({ videoResults: [{ errorCode: 'VIDEO_PROVIDER_TERMINAL_ERROR' }] })).toBeTruthy();
      expect(terminalVideoFailure({ videoResults: [{ errorCode: 'VIDEO_STILL_PROCESSING' }] })).toBeNull();
    } finally { await rm(run, { recursive: true, force: true }); }
  });
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
