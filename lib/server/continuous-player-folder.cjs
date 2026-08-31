const chooseContinuousPlayerFolder = ({
  expectedFolder,
  fallbackFolder,
  hasVideos,
}) => {
  if (hasVideos(expectedFolder)) {
    return expectedFolder;
  }

  if (hasVideos(fallbackFolder)) {
    return fallbackFolder;
  }

  return expectedFolder;
};

module.exports = {
  chooseContinuousPlayerFolder,
};
