import continuousPlayerFolder from '../../lib/server/continuous-player-folder.cjs';

const { chooseContinuousPlayerFolder } = continuousPlayerFolder;

describe('continuous player default folder', () => {
  const expectedFolder = 'GENERATIONS/newest/parts';
  const fallbackFolder = 'GENERATIONS/87-freshweb/parts';

  test('keeps the newest parts folder after its first video appears', () => {
    const hasVideos = (folder) => folder === expectedFolder;

    expect(chooseContinuousPlayerFolder({
      expectedFolder,
      fallbackFolder,
      hasVideos,
    })).toBe(expectedFolder);
  });

  test('uses the 87 fallback while the newest parts folder is empty', () => {
    const hasVideos = (folder) => folder === fallbackFolder;

    expect(chooseContinuousPlayerFolder({
      expectedFolder,
      fallbackFolder,
      hasVideos,
    })).toBe(fallbackFolder);
  });

  test('keeps the expected folder when neither folder has a video', () => {
    expect(chooseContinuousPlayerFolder({
      expectedFolder,
      fallbackFolder,
      hasVideos: () => false,
    })).toBe(expectedFolder);
  });
});
