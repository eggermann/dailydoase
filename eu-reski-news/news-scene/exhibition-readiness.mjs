import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { isNewAutoSingleScene } from './scene-count.mjs';

const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'));

export async function getReadyIterations(runDirectory) {
  let manifest;
  try { manifest = await readJson(join(runDirectory, 'run.json')); } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
  const ready = [];
  for (const entry of manifest.iterations || []) {
    const iterationDirectory = join(runDirectory, entry.directory);
    const record = await readJson(join(iterationDirectory, 'record.json'));
    if (record.exhibitionAbandoned?.status === 'aborted') continue;
    const scenes = record.plan?.scenes || [];
    const videos = await Promise.all(scenes.map(async (scene) => {
      try { await stat(join(iterationDirectory, 'media', `scene-${scene.index}-video.mp4`)); return true; }
      catch (error) { if (error.code === 'ENOENT') return false; throw error; }
    }));
    if (!isReadyForExhibition(record, videos)) break;
    ready.push(entry);
  }
  return ready;
}

export function isReadyForExhibition(record, sceneVideosExist) {
  if (record?.status !== 'Abgeschlossen') return false;
  const scenes = record.plan?.scenes || [];
  if (scenes.length < 2 && !isNewAutoSingleScene(record)) return false;
  return scenes.length > 0 && scenes.every((_, index) => sceneVideosExist[index] === true);
}
