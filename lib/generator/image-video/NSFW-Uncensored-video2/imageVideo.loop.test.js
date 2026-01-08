import 'dotenv/config';
import { jest } from '@jest/globals';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';

import { PostToHeartsync_NsfwUncensoredVideo2_ImageVideo } from './imageVideo.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

jest.setTimeout(30_000);

test('supports loop param (early-exit path)', async () => {
  const api = await new PostToHeartsync_NsfwUncensoredVideo2_ImageVideo({
    folderName: 'heartsync-loop-test',
  }).init();

  // Force early loop termination before network call
  api.roundCounter = 1;

  const imgPath = path.join(__dirname, '../../../test.datas/1755295723001-flux.jpeg');
  const imgBuffer = await fs.readFile(imgPath);

  const res = await api.prompt(imgBuffer, {
    prompt: 'loop test',
    loop: { prompts: ['next-prompt'] },
  });
  expect(res).toBe(true);
});

// npm test -- lib/generator/image-video/Heartsync/NSFW-Uncensored-video2/imageVideo.test.js