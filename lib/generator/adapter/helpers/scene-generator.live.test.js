import { describe, expect, test } from '@jest/globals';
import dotenv from 'dotenv';
import fs from 'fs-extra';
import OpenAI from 'openai';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Taktmuster } from 'taktmuster';

import {
  DEFAULT_SCENE_SYSTEM_PROMPT,
  createSceneGenerator,
  resolveSceneLengthsInput,
} from './scene-generator.js';

/**
 * Copy/paste from /Users/eggermann/Projekte/dailydoase/lib/generator/adapter/helpers:
 * RUN_LIVE_OPENAI_TESTS=1 npm test -- scene-generator.live.test.js --runInBand
 * RUN_LIVE_OPENAI_TESTS=1 npm test -- scene-generator.live.test.js --runInBand -t "returns one scene per configured scene length when sceneLengths is a function"
 * RUN_LIVE_OPENAI_TESTS=1 npm test -- scene-generator.live.test.js --runInBand -t "camera config mode keeps useCameraShot available in the returned schema"
 *
 * Copy/paste from /Users/eggermann/Projekte/dailydoase:
 * RUN_LIVE_OPENAI_TESTS=1 npm test -- lib/generator/adapter/helpers/scene-generator.live.test.js --runInBand
 * RUN_LIVE_OPENAI_TESTS=1 npm test -- lib/generator/adapter/helpers/scene-generator.live.test.js --runInBand -t "returns one scene per configured scene length when sceneLengths is a function"
 * RUN_LIVE_OPENAI_TESTS=1 npm test -- lib/generator/adapter/helpers/scene-generator.live.test.js --runInBand -t "camera config mode keeps useCameraShot available in the returned schema"
 */

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const LIVE_FIXTURE_DIR = path.join(__dirname, 'test-data');

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const RUN_LIVE_OPENAI_TESTS = ['1', 'true', 'yes', 'on'].includes(
  String(process.env.RUN_LIVE_OPENAI_TESTS || '').trim().toLowerCase()
);

const maybeDescribe = RUN_LIVE_OPENAI_TESTS && OPENAI_API_KEY ? describe : describe.skip;

const saveLiveFixture = async (fileName, payload) => {
  await fs.ensureDir(LIVE_FIXTURE_DIR);
  const targetPath = path.join(LIVE_FIXTURE_DIR, fileName);
  await fs.writeJson(targetPath, payload, { spaces: 2 });
  return targetPath;
};

const createTmLengthSource = ({ takt = 4, type = 'balanced' } = {}) => {
  const tm = new Taktmuster();
  if (typeof tm.setTakt === 'function') tm.setTakt(takt);
  if (typeof tm.setType === 'function') tm.setType(type);
  return () => tm.getNext();
};

maybeDescribe('scene-generator live OpenAI integration', () => {
  const createLiveGenerator = () => {
    const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
    return createSceneGenerator({
      openai,
      model: OPENAI_MODEL,
      systemPrompt: DEFAULT_SCENE_SYSTEM_PROMPT,
      temperature: 0.2,
      top_p: 0.9,
    });
  };

  test(
    /**
     * Copy/paste from /Users/eggermann/Projekte/dailydoase/lib/generator/adapter/helpers:
     * RUN_LIVE_OPENAI_TESTS=1 npm test -- scene-generator.live.test.js --runInBand -t "returns one scene per configured scene length when sceneLengths is a function"
     */
    'returns one scene per configured scene length when sceneLengths is a function',
    async () => {
      const generateScenes = createLiveGenerator();
      const sceneCount = 3;
      const sceneLengthSource = createTmLengthSource({ takt: 4, type: 'balanced' });
      const resolvedSceneLengths = await resolveSceneLengthsInput(sceneLengthSource, sceneCount, 3);

      const scenePlan = await generateScenes({
        sceneCount,
        sceneLengths: createTmLengthSource({ takt: 4, type: 'balanced' }),
        configMode: 'generated',
        visualDirection: 'documentary, realistic, coherent scene progression',
        sourceCues: [
          'bauhaus workshop',
          'camera history',
          'modern architecture',
        ],
      });

      const fixturePath = await saveLiveFixture('scene-generator.generated.live.json', {
        model: OPENAI_MODEL,
        configMode: 'generated',
        sceneCount,
        totalDurationSeconds: resolvedSceneLengths.reduce((sum, value) => sum + value, 0),
        scenePlan,
      });
      console.log(`[scene-generator.live] saved fixture: ${fixturePath}`);

      expect(scenePlan).toHaveLength(sceneCount);
      expect(resolvedSceneLengths).toHaveLength(sceneCount);
      for (const [index, scene] of scenePlan.entries()) {
        expect(scene.index).toBe(index + 1);
        expect(typeof scene.title).toBe('string');
        expect(scene.title.length).toBeGreaterThan(0);
        expect(typeof scene.imageDescription).toBe('string');
        expect(scene.imageDescription.length).toBeGreaterThan(0);
        expect(['lastFrame', 'newImage']).toContain(scene.frameSource);
        expect(['firstLast', 'singleImage']).toContain(scene.videoMode);
        expect(typeof scene.durationSeconds).toBe('number');
        expect(scene.durationSeconds).toBeGreaterThan(0);
      }
    },
    120000
  );

  test(
    /**
     * Copy/paste from /Users/eggermann/Projekte/dailydoase/lib/generator/adapter/helpers:
     * RUN_LIVE_OPENAI_TESTS=1 npm test -- scene-generator.live.test.js --runInBand -t "camera config mode keeps useCameraShot available in the returned schema"
     */
    'camera config mode keeps useCameraShot available in the returned schema',
    async () => {
      const generateScenes = createLiveGenerator();
      const sceneCount = 3;
      const resolvedSceneLengths = await resolveSceneLengthsInput(
        createTmLengthSource({ takt: 4, type: 'balanced' }),
        sceneCount,
        3
      );

      const scenePlan = await generateScenes({
        sceneCount,
        sceneLengths: createTmLengthSource({ takt: 4, type: 'balanced' }),
        configMode: 'camera',
        visualDirection: 'webcam-shot flow, candid, documentary, grounded motion',
        sourceCues: [
          'camera snapshot',
          'person at desk',
          'room light shift',
        ],
      });

      const fixturePath = await saveLiveFixture('scene-generator.camera.live.json', {
        model: OPENAI_MODEL,
        configMode: 'camera',
        sceneCount,
        totalDurationSeconds: resolvedSceneLengths.reduce((sum, value) => sum + value, 0),
        scenePlan,
      });
      console.log(`[scene-generator.live] saved fixture: ${fixturePath}`);

      expect(scenePlan).toHaveLength(sceneCount);
      for (const scene of scenePlan) {
        expect(typeof scene.useCameraShot).toBe('boolean');
        expect(['lastFrame', 'newImage']).toContain(scene.frameSource);
        expect(['firstLast', 'singleImage']).toContain(scene.videoMode);
        expect(typeof scene.durationSeconds).toBe('number');
        expect(scene.durationSeconds).toBeGreaterThan(0);
      }
    },
    120000
  );
});
