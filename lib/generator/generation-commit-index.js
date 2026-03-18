import { execFileSync } from 'child_process';
import path from 'path';
import fs from 'fs-extra';

export const DEFAULT_GENERATION_COMMIT_INDEX_FILE = 'generation-by-commit.txt';

function toPosixPath(value) {
  return value.split(path.sep).join('/');
}

export function getGitCommitHash(projectRoot) {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: projectRoot,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
  } catch {
    return '';
  }
}

export function getTrackedGenerationPath(projectRoot, folderPath) {
  const absoluteFolderPath = path.resolve(folderPath);
  const relativeFolderPath = path.relative(projectRoot, absoluteFolderPath);

  if (
    relativeFolderPath &&
    !relativeFolderPath.startsWith('..') &&
    !path.isAbsolute(relativeFolderPath)
  ) {
    return toPosixPath(relativeFolderPath);
  }

  return toPosixPath(absoluteFolderPath);
}

export async function updateGenerationCommitIndex({
  projectRoot,
  folderPath,
  commitHash,
  indexFilePath = path.join(projectRoot, DEFAULT_GENERATION_COMMIT_INDEX_FILE)
}) {
  if (!projectRoot || !folderPath || !commitHash) {
    return null;
  }

  const trackedFolderPath = getTrackedGenerationPath(projectRoot, folderPath);
  const existingLines = (await fs.pathExists(indexFilePath))
    ? (await fs.readFile(indexFilePath, 'utf-8'))
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
    : [];

  const trackedPaths = new Set(
    existingLines[0] === commitHash ? existingLines.slice(1) : []
  );

  trackedPaths.add(trackedFolderPath);

  const nextContents = [commitHash, ...trackedPaths].join('\n') + '\n';
  await fs.writeFile(indexFilePath, nextContents, 'utf-8');

  return indexFilePath;
}
