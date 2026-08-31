import fs from 'fs';
import os from 'os';
import path from 'path';
import continuousPlayerDoase from '../../lib/server/continuous-player-doase.cjs';

const {
  configurationFileName,
  readRepeatAllAfter,
  repeatAllAfterThreeModules,
  writeRepeatAllAfter,
} = continuousPlayerDoase;

describe('continuous player repeat-all marker', () => {
  let partsFolder;

  beforeEach(() => {
    partsFolder = fs.mkdtempSync(path.join(os.tmpdir(), 'playerdoase-parts-'));
  });

  afterEach(() => {
    fs.rmSync(partsFolder, { recursive: true, force: true });
  });

  test('creates an editable disabled marker for a new parts folder', () => {
    const settings = readRepeatAllAfter(partsFolder);
    const configurationPath = path.join(partsFolder, configurationFileName);

    expect(settings.repeatAllAfter).toBe(-1);
    expect(settings.configurationPath).toBe(configurationPath);
    expect(settings.allPartsSinceMs).toEqual(expect.any(Number));
    expect(fs.readFileSync(configurationPath, 'utf8')).toContain('var repeatallaafter = -1;');
  });

  test('stores the three-module repeat rule without moving its creation boundary', () => {
    const initialSettings = readRepeatAllAfter(partsFolder);
    writeRepeatAllAfter(partsFolder, repeatAllAfterThreeModules);

    expect(readRepeatAllAfter(partsFolder)).toEqual(expect.objectContaining({
      repeatAllAfter: 3,
      allPartsSinceMs: initialSettings.allPartsSinceMs,
    }));
  });

  test('treats unsupported marker values as disabled', () => {
    const configurationPath = path.join(partsFolder, configurationFileName);
    fs.writeFileSync(configurationPath, 'var repeatallaafter = 9;\n', 'utf8');

    expect(readRepeatAllAfter(partsFolder).repeatAllAfter).toBe(-1);
  });
});
