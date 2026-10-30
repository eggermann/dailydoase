import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, test } from '@jest/globals';
import { getIteratorStartTime, loadSceneSequence, parseGenerationInterval, preserveEquivalentSchedule, resolveParallelSceneSchedule } from '../../eu-reski-news/news-scene/scene-sequence.mjs';
import { createSceneCountStream, replaySavedSceneCount, resolveSceneCountSettings } from '../../eu-reski-news/news-scene/scene-count.mjs';
import { autoDirectorPromptVersion } from '../../eu-reski-news/news-scene/auto-director.mjs';

const temporaryDirectories = [];

async function makeSceneDirectory() {
  const directory = await mkdtemp(join(tmpdir(), 'eu-reski-scene-sequence-'));
  temporaryDirectories.push(directory);
  await mkdir(directory, { recursive: true });
  return directory;
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('EU-RESKI scene sequence', () => {
  test('real scene directory keeps manual and Auto settings and rhythm streams isolated', async () => {
    class IsolatedTaktmuster {
      static instances = [];
      constructor() { this.calls = 0; IsolatedTaktmuster.instances.push(this); }
      setTakt() {}
      setType() {}
      getNext() { this.calls += 1; return { patternValue: 4 }; }
    }
    const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../..');
    const defaults = JSON.parse(await readFile(join(repoRoot, 'eu-reski-news/default-exhibition-settings.json'), 'utf8')).generation;
    const sequence = await loadSceneSequence(join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'exhibition-scene-sequence'), defaults, { scheduleEnabled: false });
    const [autoScene, manualScene] = sequence.iterators;
    const createStream = (generation) => createSceneCountStream(resolveSceneCountSettings({
      'scene-count-mode': generation.sceneCount.mode,
      scenes: generation.sceneCount.count,
      'scene-count-takt': generation.sceneCount.takt,
      'scene-count-numerator': generation.sceneCount.numerator,
      'scene-count-denominator': generation.sceneCount.denominator,
      'scene-count-type': generation.sceneCount.type,
      'scene-count-bias': generation.sceneCount.bias,
      'min-scenes': generation.sceneCount.minimum,
      'max-scenes': generation.sceneCount.maximum,
    }), IsolatedTaktmuster);
    const autoStream = createStream(autoScene.generation);
    const manualStream = createStream(manualScene.generation);

    expect(autoScene).toMatchObject({ name: 'run-001-exhibition', generation: { autoMode: true } });
    expect(manualScene).toMatchObject({ name: 'run-005-prompt-path', generation: { autoMode: false, storyModel: 'gpt-4o-mini' } });
    expect(defaults).toMatchObject({
      iterations: 4,
      legacyGuernicaStyleReferencePrompt: true,
      articleImageReference: true,
      preserveCubistVideoStyle: true,
      videoAudioDirection: 'on',
      sceneCount: { numerator: 4, denominator: 4, bias: 1 },
    });
    expect(replaySavedSceneCount({
      autoMode: true,
      sceneCount: 4,
      autoDecision: { promptVersion: autoDirectorPromptVersion, sceneCount: 4 },
    }, autoStream)).toMatchObject({ count: 4, replayed: false });
    expect(replaySavedSceneCount({ sceneCount: 5 }, manualStream)).toMatchObject({ count: 5, replayed: true });
    expect(IsolatedTaktmuster.instances.map(({ calls }) => calls)).toEqual([0, 1]);
  });

  test('loads .scene.json files alphabetically and merges per-iteration overrides over defaults', async () => {
    const directory = await makeSceneDirectory();
    const defaults = { iterations: 4, sceneCount: { mode: 'taktmuster', bias: 1 }, audio: { direction: 'off' } };
    await writeFile(join(directory, 'scene.json'), JSON.stringify({ generationIntervalInMinutes: '60', biasMode: 'on' }));
    await writeFile(join(directory, '02-second.scene.json'), JSON.stringify({ name: 'Second', generationOverrides: { sceneCount: { bias: 3 }, audio: { direction: 'on' } } }));
    await writeFile(join(directory, '01-first.scene.json'), JSON.stringify({ name: 'First', generationOverrides: { iterations: 2 } }));

    const sequence = await loadSceneSequence(directory, defaults, { scheduleEnabled: false });

    expect(sequence.iterators.map(({ name }) => name)).toEqual(['First', 'Second']);
    expect(sequence.iterators[0].generation).toEqual({ iterations: 2, sceneCount: { mode: 'taktmuster', bias: 1 }, audio: { direction: 'off' } });
    expect(sequence.iterators[1].generation).toEqual({ iterations: 4, sceneCount: { mode: 'taktmuster', bias: 3 }, audio: { direction: 'on' } });
    expect(sequence.scheduleEnabled).toBe(false);
  });

  test('enables interval interpolation only when requested and honors -1 as off', async () => {
    const directory = await makeSceneDirectory();
    await writeFile(join(directory, 'scene.json'), JSON.stringify({ generationIntervalInMinutes: '60', biasMode: 'on', iterations: [{ name: 'A' }, { name: 'B' }] }));
    const defaults = {};
    const normal = await loadSceneSequence(join(directory, 'scene.json'), defaults, { scheduleEnabled: false });
    const interpolated = await loadSceneSequence(join(directory, 'scene.json'), defaults, { scheduleEnabled: true });
    const disabled = await loadSceneSequence(join(directory, 'scene.json'), defaults, { scheduleEnabled: true, generationInterval: '-1' });

    expect(normal.scheduleEnabled).toBe(false);
    expect(interpolated.intervalMs).toBe(3_600_000);
    expect(interpolated.biasMode).toBe('on');
    expect(disabled.scheduleEnabled).toBe(false);
    expect(disabled.intervalMs).toBeNull();
    expect(parseGenerationInterval('7.5m')).toBe(450_000);
    expect(parseGenerationInterval('-1')).toBeNull();
  });

  test('places scheduled starts evenly, with optional half-slot bias', () => {
    const start = 1_000;
    expect([0, 1, 2].map((index) => getIteratorStartTime(start, index, 3_600_000, 3, 'off')))
      .toEqual([1_000, 1_201_000, 2_401_000]);
    expect([0, 1, 2].map((index) => getIteratorStartTime(start, index, 3_600_000, 3, 'on')))
      .toEqual([601_000, 1_801_000, 3_001_000]);
  });

  test('protects parallel runs with a default hourly schedule and validates explicit rates', () => {
    expect(resolveParallelSceneSchedule({})).toEqual({
      scheduleEnabled: true, generationInterval: '1h', intervalMs: 3_600_000, biasMode: 'off',
    });
    expect(resolveParallelSceneSchedule({ configuredInterval: '60', configuredBiasMode: 'on' })).toEqual({
      scheduleEnabled: true, generationInterval: '60m', intervalMs: 3_600_000, biasMode: 'on',
    });
    expect(resolveParallelSceneSchedule({ requestedInterval: '30m', configuredInterval: '60', configuredBiasMode: 'on' })).toEqual({
      scheduleEnabled: true, generationInterval: '30m', intervalMs: 1_800_000, biasMode: 'on',
    });
    expect(resolveParallelSceneSchedule({ configuredInterval: '-1' })).toMatchObject({ scheduleEnabled: false, intervalMs: null });
    expect(() => resolveParallelSceneSchedule({ requestedInterval: 'nonsense' })).toThrow(/generationInterval/);
    expect(() => resolveParallelSceneSchedule({ configuredBiasMode: 'unknown' })).toThrow(/biasMode/);
  });

  test('preserves an equivalent saved duration spelling on resume', () => {
    const current = resolveParallelSceneSchedule({ configuredInterval: '600' });
    const saved = { scheduleEnabled: true, generationInterval: '10h', biasMode: 'off' };
    expect(preserveEquivalentSchedule(current, saved).generationInterval).toBe('10h');
    expect(preserveEquivalentSchedule(current, { ...saved, generationInterval: '9h' })).toEqual(current);
    expect(preserveEquivalentSchedule(current, { ...saved, biasMode: 'on' })).toEqual(current);
  });
});
