import { expect, test } from '@jest/globals';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';

import { formatSelfomatRunLog, saveSelfomatRunLog } from './selfomat-run-log.js';

test('formats all final Selfomat prompts as readable text', () => {
  const log = formatSelfomatRunLog({
    iteration: 2,
    sourceImage: '/test/selfie_02.jpg',
    semanticTopics: ['love', 'animal'],
    semanticCues: ['a gentle animal-like gesture'],
    visionPrompt: 'Describe people.',
    visionResult: 'One person.',
    scenePlanSystemPrompt: 'Plan a short film.',
    storyTransportPrompt: 'Previous final beat: a wave.',
    announcement: 'Ich seh dich. Gleich winkst du.',
    scenePlan: [{
      title: 'A small greeting', durationSeconds: 3, castUse: 'cast-001 returns',
      actorsInteraction: 'They wave.', stillPrompt: 'A candid selfie.',
      imageDescription: 'A hand rises.', singleImagePrompt: 'The hand moves.', videoPrompt: 'A small wave.',
    }],
  });

  expect(log).toContain('# Selfomat Prompt Log');
  expect(log).toContain('Semantic topics: love | animal');
  expect(log).toContain('## Vision prompt');
  expect(log).toContain('## Scene-planner context');
  expect(log).toContain('## Single-image video prompt');
  expect(log).toContain('A small wave.');
});

test('saves each iteration in its own prompt log file', async () => {
  const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), 'selfomat-prompt-log-'));
  const target = await saveSelfomatRunLog({ outputDir, iteration: 2, scenePlan: [] });
  await expect(fs.readFile(target, 'utf8')).resolves.toContain('Iteration: 2');
  await fs.remove(outputDir);
});

test('image-only log omits video prompt sections', () => {
  const log = formatSelfomatRunLog({
    iteration: 1,
    imageOnly: true,
    scenePlan: [{
      title: 'One visible gesture',
      stillPrompt: 'A candid image of one gesture.',
      singleImagePrompt: 'Render the gesture as one still image.',
      videoPrompt: 'This must not appear in image-only log.',
    }],
  });

  expect(log).toContain('## Image render prompt');
  expect(log).not.toContain('## Single-image video prompt');
  expect(log).not.toContain('## Video prompt');
  expect(log).not.toContain('This must not appear in image-only log.');
});
