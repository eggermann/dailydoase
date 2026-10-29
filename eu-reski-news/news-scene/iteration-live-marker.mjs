import { randomUUID } from 'node:crypto';
import { rename, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export const iterationLiveMarkerName = 'live.json';

export async function writeIterationLiveMarker(directory, marker) {
  const markerPath = join(directory, iterationLiveMarkerName);
  const temporaryPath = `${markerPath}.${randomUUID()}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(marker, null, 2)}\n`, 'utf8');
  await rename(temporaryPath, markerPath);
}

export async function clearIterationLiveMarker(directory) {
  try {
    await unlink(join(directory, iterationLiveMarkerName));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}
