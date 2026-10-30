import { isAbsolute, relative } from 'node:path';

const transientVolumeErrors = new Set(['EACCES', 'EPERM', 'EBUSY', 'ENXIO', 'ENOENT']);

export async function retryVolumeAccess(operation, { volumePath, wait, isStopping, report }) {
  while (!isStopping()) {
    try {
      return await operation();
    } catch (error) {
      const errorPath = typeof error.path === 'string' && isAbsolute(error.path) ? error.path : null;
      const relativePath = errorPath && relative(volumePath, errorPath);
      const onVolume = errorPath && relativePath !== '..' && !relativePath.startsWith('../') && !isAbsolute(relativePath);
      if (error.volumeRetryForbidden || !onVolume || !transientVolumeErrors.has(error.code)) throw error;
      report(error);
      await wait();
    }
  }
}
