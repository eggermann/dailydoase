import { readFile, readdir, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

export const DEFAULT_GENERATION_INTERVAL_MS = 5000;

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

export function parseGenerationInterval(value, iteratorCount = 1) {
  if (value === -1 || value === '-1') return DEFAULT_GENERATION_INTERVAL_MS * iteratorCount;
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
      .filter((entry) => entry.isFile() && entry.name.endsWith('.json') && entry.name !== 'scene.json')
      .map((entry) => entry.name)
      .sort((left, right) => left.localeCompare(right, 'en'));
    sceneIterations = await Promise.all(iterationFileNames.map(async (fileName) =>
      JSON.parse(await readFile(resolve(absoluteScenePath, fileName), 'utf8'))));
  }
  if (!Array.isArray(sceneIterations) || sceneIterations.length === 0) {
    throw new Error(isSceneDirectory
      ? `Scene folder must contain iteration JSON files: ${absoluteScenePath}`
      : 'Scene JSON iterations must be a non-empty ordered list');
  }
  if (scheduleEnabled && !['on', 'off'].includes(scene.biasMode)) {
    throw new Error('Scene JSON biasMode must be "on" or "off"');
  }

  const selectedInterval = generationInterval ?? scene.generationInterval;
  const intervalMs = scheduleEnabled
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
    scheduleEnabled,
    generationInterval: scheduleEnabled ? selectedInterval : null,
    intervalMs,
    biasMode: scheduleEnabled ? scene.biasMode : null,
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

