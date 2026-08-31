const fs = require('fs');
const path = require('path');

const configurationFileName = 'freezeMovieParts.playerdoase.js';
const configurationExamplePath = path.join(
  __dirname,
  'freezeMovieParts.playerdoase.example.js'
);
const repeatAllAfterThreeModules = 3;
const disabledRepeatAllAfter = -1;
const createdAtMarker = '__PLAYERDOASE_CREATED_AT__';
const createdAtPattern = /playerdoase-created-at:\s*(\d+)/i;

const normalizeRepeatAllAfter = (value) => (
  Number(value) === repeatAllAfterThreeModules
    ? repeatAllAfterThreeModules
    : disabledRepeatAllAfter
);

const getConfigurationPath = (partsFolder) => path.join(
  partsFolder,
  configurationFileName
);

const createPlayerConfiguration = ({ repeatAllAfter, createdAtMs }) => fs
  .readFileSync(configurationExamplePath, 'utf8')
  .replace(createdAtMarker, String(createdAtMs))
  .replace(/repeatallaafter\s*=\s*-?\d+\s*;/i, `repeatallaafter = ${repeatAllAfter};`);

const ensurePlayerConfiguration = (partsFolder) => {
  const configurationPath = getConfigurationPath(partsFolder);
  if (!fs.existsSync(configurationPath)) {
    fs.writeFileSync(
      configurationPath,
      createPlayerConfiguration({
        repeatAllAfter: disabledRepeatAllAfter,
        createdAtMs: Date.now(),
      }),
      'utf8'
    );
  }
  return configurationPath;
};

const readRepeatAllAfter = (partsFolder) => {
  const configurationPath = ensurePlayerConfiguration(partsFolder);
  const configuration = fs.readFileSync(configurationPath, 'utf8');
  const match = configuration.match(/\brepeatallaafter\s*=\s*(-?\d+)\s*;/i);
  const createdAtMatch = configuration.match(createdAtPattern);
  const fallbackCreatedAtMs = fs.statSync(configurationPath).birthtimeMs;

  return {
    configurationPath,
    repeatAllAfter: normalizeRepeatAllAfter(match?.[1]),
    allPartsSinceMs: Number(createdAtMatch?.[1]) || fallbackCreatedAtMs,
  };
};

const writeRepeatAllAfter = (partsFolder, value) => {
  const currentSettings = readRepeatAllAfter(partsFolder);
  const repeatAllAfter = normalizeRepeatAllAfter(value);
  const configuration = createPlayerConfiguration({
    repeatAllAfter,
    createdAtMs: currentSettings.allPartsSinceMs,
  });

  fs.writeFileSync(currentSettings.configurationPath, configuration, 'utf8');

  return {
    configurationPath: currentSettings.configurationPath,
    repeatAllAfter,
    allPartsSinceMs: currentSettings.allPartsSinceMs,
  };
};

module.exports = {
  configurationFileName,
  disabledRepeatAllAfter,
  getConfigurationPath,
  readRepeatAllAfter,
  repeatAllAfterThreeModules,
  writeRepeatAllAfter,
};
