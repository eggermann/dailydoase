import { expect, test } from '@jest/globals';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';

import {
  formatSelfomatRunLog,
  formatSelfomatRunLogHtml,
  saveSelfomatRunLog,
} from './selfomat-run-log.js';

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
      imageDescription: 'A hand rises.', cameraCue: 'The camera pans toward the hand.', singleImagePrompt: 'The hand moves.', videoPrompt: 'A small wave.',
    }],
  });

  expect(log).toContain('# Selfomat Prompt Log');
  expect(log).toContain('Semantic topics: love | animal');
  expect(log).toContain('## Vision prompt');
  expect(log).toContain('## Scene-planner context');
  expect(log).toContain('## Iteration structure');
  expect(log).toContain('input → vision/assets → semantic stream → Taktmuster → GPT scene planner → render prompts → StoryTransport');
  expect(log).toContain('## Camera cue');
  expect(log).toContain('The camera pans toward the hand.');
  expect(log).toContain('## Single-image video prompt');
  expect(log).toContain('A small wave.');
  expect(log).toContain('## BEFORE → planner input');
  expect(log).toContain('## AFTER → carried to next scene');
});

test('saves each iteration in its own prompt log file', async () => {
  const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), 'selfomat-prompt-log-'));
  const target = await saveSelfomatRunLog({ outputDir, iteration: 2, scenePlan: [] });
  try {
    expect(target).toBe(path.join(outputDir, 'selfomat-prompt-log', 'iteration-0002.html'));
    await expect(fs.readFile(target, 'utf8')).resolves.toContain('Iteration: 2');
    await expect(fs.pathExists(target.replace(/\.html$/, '.txt'))).resolves.toBe(false);
  } finally {
    await fs.remove(outputDir);
  }
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
  expect(log).toContain('## Media mode');
  expect(log).toContain('"videoPromptSent": false');
  expect(log).not.toContain('## Single-image video prompt');
  expect(log).not.toContain('## Video prompt');
  expect(log).not.toContain('This must not appear in image-only log.');
});

test('formats provenance as colored HTML and saves a companion file', async () => {
  const html = formatSelfomatRunLogHtml({
    iteration: 1,
    sourceImage: '/tmp/original-selfie.jpg',
    semanticCues: ['love'],
    sourceCuePattern: [1],
    sourceCuePatternTrace: [{ call: 'taktmuster.getNext()', patternValue: 1 }],
    sourceCueBatches: [['love']],
    sourceCueStreamTraceBatches: [[{
      title: 'love',
      currentWord: 'love',
      prev: [],
      next: ['animal follows love'],
    }]],
    scenePlanSystemPrompt: 'Static planner rules.',
    scenePlan: [{
      title: 'Gesture',
      beat: 'The visitor turns toward the animal.',
      stillPrompt: 'Generated image prompt.',
      imageDescription: 'A blue-shirted visitor reaches toward the canvas.',
      videoPrompt: 'The visitor reaches slowly toward the canvas as the phone shifts left.',
    }],
    renderedSceneAssets: [{
      sceneIndex: 1,
      originalImagePath: '/tmp/original-selfie.jpg',
      generatedImagePath: '/tmp/generated-scene.jpg',
    }],
  });
  expect(html).toContain('class="log-line raw"');
  expect(html).toContain('class="log-line static"');
  expect(html).toContain('class="log-line generated"');
  expect(html).toContain('RAW semantic');
  expect(html).toContain('Semantic integration — where AFTER/NEXT is used');
  expect(html).toContain('## Iteration structure');
  expect(html).toContain('semanticStream.getNext() — prev / title / next');
  expect(html).toContain('provider\'s source-text snippets');
  expect(html).toContain('The visitor turns toward the animal.');
  expect(html).toContain('<details');
  expect(html).toContain('Images and image descriptions');
  expect(html).toContain('A blue-shirted visitor reaches toward the canvas.');
  expect(html).toContain('Video scene 1: WAN motion prompt');
  expect(html).toContain('Dry run: this prompt was planned, not sent to WAN.');
  expect(html).toContain('The visitor reaches slowly toward the canvas as the phone shifts left.');
  expect(html).toContain('file:///tmp/original-selfie.jpg');
  expect(html).toContain('file:///tmp/generated-scene.jpg');

  const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), 'selfomat-colored-log-'));
  try {
    const target = await saveSelfomatRunLog({ outputDir, iteration: 1, semanticCues: ['love'] });
    await expect(fs.pathExists(target)).resolves.toBe(true);
    await expect(fs.pathExists(target.replace(/\.html$/, '.txt'))).resolves.toBe(false);
  } finally {
    await fs.remove(outputDir);
  }
});
