import { readFile } from 'node:fs/promises';
import { dirname, isAbsolute, resolve } from 'node:path';

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

function resolveConfigPath(configPath, scenePath) {
  return isAbsolute(configPath)
    ? configPath
    : resolve(dirname(scenePath), configPath);
}

export async function loadSceneSequence(scenePath, defaultGeneration, {
  scheduleEnabled = true,
  generationInterval = undefined,
} = {}) {
  const absoluteScenePath = resolve(scenePath);
  const scene = JSON.parse(await readFile(absoluteScenePath, 'utf8'));
  if (!scene || typeof scene !== 'object' || Array.isArray(scene)) {
    throw new Error('Scene JSON must contain an object');
  }
  if (!Array.isArray(scene.paths) || scene.paths.length === 0) {
    throw new Error('Scene JSON paths must be a non-empty ordered list of iterator JSON paths');
  }
  if (scheduleEnabled && !['on', 'off'].includes(scene.biasMode)) {
    throw new Error('Scene JSON biasMode must be "on" or "off"');
  }

  const selectedInterval = generationInterval ?? scene.generationInterval;
  const intervalMs = scheduleEnabled
    ? parseGenerationInterval(selectedInterval, scene.paths.length)
    : null;
  const iterators = [];
  for (const [index, configPath] of scene.paths.entries()) {
    if (typeof configPath !== 'string' || !configPath.trim()) {
      throw new Error(`Scene JSON paths[${index}] must be a non-empty path string`);
    }
    const absoluteConfigPath = resolveConfigPath(configPath, absoluteScenePath);
    const config = JSON.parse(await readFile(absoluteConfigPath, 'utf8'));
    if (!config || typeof config !== 'object' || Array.isArray(config)) {
      throw new Error(`Iterator JSON must contain an object: ${absoluteConfigPath}`);
    }
    const generation = config.generation ?? {};
    if (!generation || typeof generation !== 'object' || Array.isArray(generation)) {
      throw new Error(`Iterator JSON generation must be an object: ${absoluteConfigPath}`);
    }
    iterators.push({
      path: absoluteConfigPath,
      generation: mergeSettings(defaultGeneration, generation),
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

