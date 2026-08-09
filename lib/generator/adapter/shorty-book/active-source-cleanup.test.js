import { expect, test } from '@jest/globals';
import fs from 'fs-extra';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const activeDir = path.dirname(fileURLToPath(import.meta.url));
const adapterDir = path.resolve(activeDir, '..');

test('active trailer source contains no dead monster-first prompt wording', async () => {
  const files = [
    path.join(activeDir, 'generator.js'),
    path.join(adapterDir, 'MIX-again-freshweb.glas-kaufhaus-trailer.sh'),
    path.join(adapterDir, 'MIX-again-freshweb.glas-kaufhaus-image-only-test.sh'),
    path.join(adapterDir, 'MIX-again-freshweb.glas-kaufhaus-two-video-preview.sh'),
    path.join(adapterDir, 'MIX-again-freshweb.middle-cost-4-3.sh'),
    path.join(activeDir, 'resume-two-video-preview-from-snapshot.sh'),
  ];
  const source = (await Promise.all(files.map((file) => fs.readFile(file, 'utf8')))).join('\n');
  for (const phrase of [
    'Legacy monster-first assembly remains below',
    'Legacy reconstruction wording remains unreachable',
    'Construct one fresh scene-specific incarnation',
    'identity reference is a vocabulary',
    'at least eighty percent',
    'rebuild at least one third',
    'untouched Kaufhaus photograph remains',
  ]) {
    expect(source).not.toContain(phrase);
  }
});

test('two-video resume preview never forces global forward dolly', async () => {
  const source = await fs.readFile(
    path.join(activeDir, 'resume-two-video-preview-from-snapshot.mjs'),
    'utf8'
  );
  expect(source).toContain('globalForwardDolly: false');
  expect(source).not.toContain('globalForwardDolly: true');
});

test('two-video preview launches node through shell wrapper', async () => {
  const previewShell = await fs.readFile(
    path.join(adapterDir, 'MIX-again-freshweb.glas-kaufhaus-two-video-preview.sh'),
    'utf8'
  );
  const wrapperShell = await fs.readFile(
    path.join(activeDir, 'resume-two-video-preview-from-snapshot.sh'),
    'utf8'
  );

  expect(previewShell).toContain('resume-two-video-preview-from-snapshot.sh');
  expect(previewShell).not.toContain('resume-two-video-preview-from-snapshot.mjs');
  expect(wrapperShell).toContain('exec node');
  expect(wrapperShell).toContain('resume-two-video-preview-from-snapshot.mjs');
});
