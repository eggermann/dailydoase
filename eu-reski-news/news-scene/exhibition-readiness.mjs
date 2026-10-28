import { isNewAutoSingleScene } from './scene-count.mjs';

export function isReadyForExhibition(record, sceneVideosExist) {
  if (record?.status !== 'Abgeschlossen') return false;
  const scenes = record.plan?.scenes || [];
  if (scenes.length < 2 && !isNewAutoSingleScene(record)) return false;
  return scenes.length > 0 && scenes.every((_, index) => sceneVideosExist[index] === true);
}
