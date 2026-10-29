import { readFile, readdir, stat } from 'node:fs/promises';
import { resolve } from 'node:path';

export function mergeSettings(defaults, overrides) {
  if (!overrides || typeof overrides !== 'object' || Array.isArray(overrides)) return overrides ?? defaults;
  const merged = { ...defaults };
  for (const [key, value] of Object.entries(overrides)) {
    merged[key] = value && typeof value === 'object' && !Array.isArray(value)
      ? mergeSettings(defaults?.[key] && typeof defaults[key] === 'object' ? defaults[key] : {}, value)
      : value;
  }
  return merged;
}

export function parseGenerationInterval(value) {
  if (value === -1 || value === '-1') return null;
  if (typeof value !== 'string') throw new Error('generationInterval must be -1 or duration such as "1h"');

  const match = /^(\d+(?:\.\d+)?)(ms|s|m|h)$/.exec(value.trim());
  if (!match) throw new Error('generationInterval must be -1 or duration such as "1h"');

  const amount = Number(match[1]);
  const multiplier = { ms: 1, s: 1000, m: 60_000, h: 3_600_000 }[match[2]];
  const milliseconds = amount * multiplier;
  if (!Number.isSafeInteger(milliseconds) || milliseconds < 1) {
    throw new Error('generationInterval must resolve to a positive whole number of milliseconds');
  }
  return milliseconds;
}

export function resolveParallelSceneSchedule({
  requestedInterval,
  configuredInterval,
  configuredBiasMode,
} = {}) {
  const selectedInterval = requestedInterval ?? (configuredInterval === undefined ? '1h' : String(configuredInterval));
  if (selectedInterval === '-1') {
    return { scheduleEnabled: false, generationInterval: '-1', intervalMs: null, biasMode: null };
  }
  const duration = /^\d+(?:\.\d+)?$/.test(String(selectedInterval))
    ? `${selectedInterval}m`
    : String(selectedInterval);
  const intervalMs = parseGenerationInterval(duration);
  const biasMode = configuredBiasMode ?? 'off';
  if (!['on', 'off'].includes(biasMode)) throw new Error('Parallel scene biasMode must be "on" or "off"');
  return { scheduleEnabled: true, generationInterval: duration, intervalMs, biasMode };
}

export async function loadSceneSequence(scenePath, defaultGeneration, {
  scheduleEnabled = true,
  generationInterval = undefined,
} = {}) {
  const absoluteScenePath = resolve(scenePath);
  const sceneLocation = await stat(absoluteScenePath);
  const isSceneDirectory = sceneLocation.isDirectory();
  const directoryEntries = isSceneDirectory ? await readdir(absoluteScenePath, { withFileTypes: true }) : [];
  const metadataPath = isSceneDirectory ? resolve(absoluteScenePath, 'scene.json') : absoluteScenePath;
  const hasMetadataFile = isSceneDirectory && directoryEntries.some((entry) => entry.isFile() && entry.name === 'scene.json');
  const scene = isSceneDirectory
    ? hasMetadataFile ? JSON.parse(await readFile(metadataPath, 'utf8')) : {}
    : JSON.parse(await readFile(absoluteScenePath, 'utf8'));
  if (!scene || typeof scene !== 'object' || Array.isArray(scene)) {
    throw new Error('Scene JSON must contain an object');
  }
  let sceneIterations = scene.iterations;
  if (isSceneDirectory) {
    const iterationFileNames = directoryEntries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.scene.json'))
      .map((entry) => entry.name)
      .sort((left, right) => left.localeCompare(right, 'en'));
    sceneIterations = await Promise.all(iterationFileNames.map(async (fileName) =>
      JSON.parse(await readFile(resolve(absoluteScenePath, fileName), 'utf8'))));
  } else if (!Array.isArray(sceneIterations)
    && typeof scene.name === 'string'
    && scene.generationOverrides && typeof scene.generationOverrides === 'object'
    && !Array.isArray(scene.generationOverrides)) {
    sceneIterations = [scene];
  }
  if (!Array.isArray(sceneIterations) || sceneIterations.length === 0) {
    throw new Error(isSceneDirectory
      ? `Scene folder must contain .scene.json files: ${absoluteScenePath}`
      : 'Scene JSON iterations must be a non-empty ordered list');
  }
  const minutes = scene.generationIntervalInMinutes;
  if (scheduleEnabled && generationInterval === undefined && minutes !== undefined
    && String(minutes) !== '-1' && !/^\d+(?:\.\d+)?$/.test(String(minutes))) {
    throw new Error('generationIntervalInMinutes must be a positive number of minutes or -1');
  }
  const selectedInterval = generationInterval ?? (minutes === undefined ? undefined : String(minutes) === '-1' ? '-1' : `${minutes}m`);
  const activeSchedule = scheduleEnabled && selectedInterval !== '-1';
  if (activeSchedule && !['on', 'off'].includes(scene.biasMode)) {
    throw new Error('Scene JSON biasMode must be "on" or "off"');
  }

  const intervalMs = activeSchedule
    ? parseGenerationInterval(selectedInterval, sceneIterations.length)
    : null;
  const iterators = [];
  for (const [index, iteration] of sceneIterations.entries()) {
    if (!iteration || typeof iteration !== 'object' || Array.isArray(iteration)) {
      throw new Error(`Scene JSON iterations[${index}] must be an object`);
    }
    if (typeof iteration.name !== 'string' || !iteration.name.trim()) {
      throw new Error(`Scene JSON iterations[${index}].name must be a non-empty string`);
    }
    const generationOverrides = iteration.generationOverrides ?? {};
    if (!generationOverrides || typeof generationOverrides !== 'object' || Array.isArray(generationOverrides)) {
      throw new Error(`Scene JSON iterations[${index}].generationOverrides must be an object`);
    }
    iterators.push({
      name: iteration.name.trim(),
      generation: mergeSettings(defaultGeneration, generationOverrides),
    });
  }

  return {
    path: absoluteScenePath,
    configuredGenerationInterval: minutes === undefined ? undefined : String(minutes),
    configuredBiasMode: scene.biasMode,
    scheduleEnabled: activeSchedule,
    generationInterval: activeSchedule ? selectedInterval : null,
    intervalMs,
    biasMode: activeSchedule ? scene.biasMode : null,
    iterators,
  };
}

export function getIteratorStartTime(startedAt, index, intervalMs, iteratorCount, biasMode) {
  const slotMs = intervalMs / iteratorCount;
  const biasMs = biasMode === 'on' ? slotMs / 2 : 0;
  const cycle = Math.floor(index / iteratorCount);
  const slot = index % iteratorCount;
  return startedAt + (cycle * intervalMs) + biasMs + (slot * slotMs);
}
