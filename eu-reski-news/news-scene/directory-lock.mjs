import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, open, readdir, readFile, rename, rmdir, stat, unlink } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { homedir } from 'node:os';

const ownerPrefix = '.owner-';
const ownerSuffix = '.json';

export function localDirectoryLockPath(
  resourcePath,
  lockDirectory = process.env.EXHIBITION_LOCK_DIRECTORY || join(homedir(), '.dailydoase', 'locks'),
) {
  const resourceKey = createHash('sha256').update(resolve(resourcePath)).digest('hex');
  return join(lockDirectory, `${resourceKey}.lock`);
}

export function processStartToken(processId = process.pid) {
  try {
    return execFileSync('ps', ['-p', String(processId), '-o', 'lstart='], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 3000,
    }).trim() || null;
  } catch {
    return null;
  }
}

export async function isProcessOwnerAlive(owner) {
  if (!Number.isSafeInteger(owner.processId) || owner.processId < 1) return null;
  try {
    process.kill(owner.processId, 0);
  } catch (error) {
    if (error.code === 'ESRCH') return false;
    if (error.code !== 'EPERM') return null;
  }
  if (!owner.processStart) return null;
  const currentStart = processStartToken(owner.processId);
  return currentStart ? currentStart === owner.processStart : null;
}

function delay(milliseconds) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

async function removeDirectoryIfEmpty(path) {
  try { await rmdir(path); } catch (error) { if (!['ENOENT', 'ENOTEMPTY', 'EEXIST'].includes(error.code)) throw error; }
}

async function cleanupStaleDirectory(lockPath, ownerFileName, owner, initializationTimeoutMs) {
  const lockDirectoryStat = await stat(lockPath).catch((error) => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });
  if (!lockDirectoryStat?.isDirectory()) return false;

  let stale = false;
  if (!ownerFileName) {
    stale = Date.now() - lockDirectoryStat.mtimeMs >= initializationTimeoutMs;
  } else {
    const ownerStatus = await isProcessOwnerAlive(owner);
    stale = ownerStatus === false;
  }
  if (!stale) return false;

  const quarantinePath = `${lockPath}.stale-${randomUUID()}`;
  try {
    await rename(lockPath, quarantinePath);
  } catch (error) {
    if (['ENOENT', 'EEXIST', 'ENOTEMPTY'].includes(error.code)) return false;
    throw error;
  }

  const quarantinedEntries = await readdir(quarantinePath).catch((error) => {
    if (error.code === 'ENOENT') return [];
    throw error;
  });
  if (ownerFileName && quarantinedEntries.includes(ownerFileName)) {
    const quarantinedOwner = await readFile(join(quarantinePath, ownerFileName), 'utf8')
      .then((contents) => JSON.parse(contents))
      .catch(() => null);
    if (!quarantinedOwner || await isProcessOwnerAlive(quarantinedOwner) !== false) {
      try { await rename(quarantinePath, lockPath); } catch (restoreError) {
        if (!['ENOENT', 'EEXIST', 'ENOTEMPTY'].includes(restoreError.code)) throw restoreError;
      }
      return false;
    }
  } else if (ownerFileName) {
    try { await rename(quarantinePath, lockPath); } catch (restoreError) {
      if (!['ENOENT', 'EEXIST', 'ENOTEMPTY'].includes(restoreError.code)) throw restoreError;
    }
    return false;
  }

  for (const entry of quarantinedEntries) await unlink(join(quarantinePath, entry)).catch(() => {});
  await removeDirectoryIfEmpty(quarantinePath);
  return true;
}

async function waitForLegacyFile(lockPath, retryMs) {
  const details = await stat(lockPath).catch((error) => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });
  if (!details || details.isDirectory()) return false;

  const contents = await readFile(lockPath, 'utf8').catch(() => '');
  const legacyProcessId = Number(contents.trim());
  if (Number.isSafeInteger(legacyProcessId) && legacyProcessId > 0) {
    try {
      process.kill(legacyProcessId, 0);
      const legacyStartedAt = Date.parse(processStartToken(legacyProcessId) || '');
      const lockCreatedAt = details.mtimeMs;
      if (!Number.isFinite(legacyStartedAt) || legacyStartedAt <= lockCreatedAt + 2000) {
        await delay(retryMs);
        return true;
      }
    } catch (error) {
      if (error.code !== 'ESRCH') {
        await delay(retryMs);
        return true;
      }
    }
  } else if (Date.now() - details.mtimeMs < 60_000) {
    await delay(retryMs);
    return true;
  }

  const quarantinePath = `${lockPath}.legacy-${randomUUID()}`;
  try { await rename(lockPath, quarantinePath); } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
  await unlink(quarantinePath).catch(() => {});
  return false;
}

export async function withDirectoryLock(lockPath, task, {
  retryMs = 50,
  initializationTimeoutMs = 60_000,
  beforeOwnerWrite = async () => {},
  failFast = false,
} = {}) {
  await mkdir(dirname(lockPath), { recursive: true });
  let ownerFileName;
  let ownerDirectoryIdentity;

  while (!ownerFileName) {
    try {
      await mkdir(lockPath);
      const directoryStat = await stat(lockPath);
      ownerDirectoryIdentity = `${directoryStat.dev}:${directoryStat.ino}`;
      try {
        const token = randomUUID();
        ownerFileName = `${ownerPrefix}${token}${ownerSuffix}`;
        const owner = {
          token,
          processId: process.pid,
          processStart: processStartToken(process.pid),
          acquiredAt: new Date().toISOString(),
        };
        await beforeOwnerWrite();
        const ownerHandle = await open(join(lockPath, ownerFileName), 'wx');
        try { await ownerHandle.writeFile(`${JSON.stringify(owner)}\n`, 'utf8'); } finally { await ownerHandle.close(); }

        const currentStat = await stat(lockPath);
        const currentIdentity = `${currentStat.dev}:${currentStat.ino}`;
        const contents = await readdir(lockPath);
        if (currentIdentity !== ownerDirectoryIdentity
          || contents.length !== 1
          || contents[0] !== ownerFileName) {
          await unlink(join(lockPath, ownerFileName)).catch(() => {});
          ownerFileName = null;
          continue;
        }
      } catch (error) {
        if (ownerFileName) await unlink(join(lockPath, ownerFileName)).catch(() => {});
        ownerFileName = null;
        await removeDirectoryIfEmpty(lockPath);
        throw error;
      }
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const legacyHandled = await waitForLegacyFile(lockPath, retryMs);
      if (legacyHandled) {
        if (failFast) throw new Error('An exhibition run is already active.');
        continue;
      }
      const entries = await readdir(lockPath).catch((readError) => {
        if (readError.code === 'ENOENT') return null;
        if (readError.code === 'ENOTDIR') return null;
        throw readError;
      });
      if (entries === null) continue;
      const ownerFiles = entries.filter((name) => name.startsWith(ownerPrefix) && name.endsWith(ownerSuffix));
      if (ownerFiles.length !== 1) {
        const cleaned = await cleanupStaleDirectory(lockPath, null, null, initializationTimeoutMs);
        if (!cleaned && failFast) throw new Error('An exhibition run is already active.');
        if (!cleaned) await delay(retryMs);
        continue;
      }
      const currentOwnerFile = ownerFiles[0];
      const owner = await readFile(join(lockPath, currentOwnerFile), 'utf8')
        .then((contents) => JSON.parse(contents))
        .catch(() => null);
      if (!owner) {
        if (failFast) throw new Error('An exhibition run is already active.');
        await delay(retryMs);
        continue;
      }
      const cleaned = await cleanupStaleDirectory(lockPath, currentOwnerFile, owner, initializationTimeoutMs);
      if (!cleaned && failFast) throw new Error('An exhibition run is already active.');
      if (!cleaned) await delay(retryMs);
    }
  }

  const ownerPath = join(lockPath, ownerFileName);
  try {
    return await task();
  } finally {
    await unlink(ownerPath).catch((error) => { if (error.code !== 'ENOENT') throw error; });
    await removeDirectoryIfEmpty(lockPath);
  }
}
