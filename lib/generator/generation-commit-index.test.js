import os from 'os';
import path from 'path';
import fs from 'fs-extra';
import {
  DEFAULT_GENERATION_COMMIT_INDEX_FILE,
  updateGenerationCommitIndex
} from './generation-commit-index.js';

describe('generation commit index', () => {
  let projectRoot;
  let indexFilePath;

  beforeEach(async () => {
    projectRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), 'dailydoase-generation-commit-')
    );
    indexFilePath = path.join(
      projectRoot,
      DEFAULT_GENERATION_COMMIT_INDEX_FILE
    );
  });

  afterEach(async () => {
    await fs.remove(projectRoot);
  });

  test('stores the commit hash once and appends unique folder paths', async () => {
    const firstFolder = path.join(
      projectRoot,
      'lib/generator/adapter/tests/GENERATIONS/628-freshweb-balanced-good-quality-4-3-test'
    );
    const secondFolder = path.join(
      projectRoot,
      'lib/generator/adapter/tests/GENERATIONS/629-freshweb-balanced-good-quality-4-3-test'
    );

    await updateGenerationCommitIndex({
      projectRoot,
      folderPath: firstFolder,
      commitHash: 'commit-a',
      indexFilePath
    });
    await updateGenerationCommitIndex({
      projectRoot,
      folderPath: firstFolder,
      commitHash: 'commit-a',
      indexFilePath
    });
    await updateGenerationCommitIndex({
      projectRoot,
      folderPath: secondFolder,
      commitHash: 'commit-a',
      indexFilePath
    });

    const fileContents = await fs.readFile(indexFilePath, 'utf-8');

    expect(fileContents).toBe(
      [
        'commit-a',
        'lib/generator/adapter/tests/GENERATIONS/628-freshweb-balanced-good-quality-4-3-test',
        'lib/generator/adapter/tests/GENERATIONS/629-freshweb-balanced-good-quality-4-3-test',
        ''
      ].join('\n')
    );
  });

  test('resets the tracked folder list when the commit changes', async () => {
    const oldFolder = path.join(
      projectRoot,
      'lib/generator/adapter/tests/GENERATIONS/628-freshweb-balanced-good-quality-4-3-test'
    );
    const newFolder = path.join(
      projectRoot,
      'lib/generator/adapter/tests/GENERATIONS/700-freshweb-balanced-good-quality-4-3-test'
    );

    await updateGenerationCommitIndex({
      projectRoot,
      folderPath: oldFolder,
      commitHash: 'commit-a',
      indexFilePath
    });
    await updateGenerationCommitIndex({
      projectRoot,
      folderPath: newFolder,
      commitHash: 'commit-b',
      indexFilePath
    });

    const fileContents = await fs.readFile(indexFilePath, 'utf-8');

    expect(fileContents).toBe(
      [
        'commit-b',
        'lib/generator/adapter/tests/GENERATIONS/700-freshweb-balanced-good-quality-4-3-test',
        ''
      ].join('\n')
    );
  });
});
