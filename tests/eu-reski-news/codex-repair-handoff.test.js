import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@jest/globals';
import {
  buildCodexRepairPrompt,
  classifyRepairFailure,
  codexRepairIsEnabled,
  fingerprintRepairFailure,
  isAllowedCodexRepairChange,
  runCodexRepairInIsolatedWorktree,
  updateRepairFailureHistory,
} from '../../eu-reski-news/news-scene/codex-repair-handoff.mjs';

test('only deterministic runtime failures qualify for Codex repair escalation', () => {
  expect(classifyRepairFailure({ error: 'globalArticleProgressPath is not defined', stage: 'article_selection' }))
    .toBe('code_defect_candidate');
  expect(classifyRepairFailure({ error: 'GPT did not return complete video direction', stage: 'video_direction' }))
    .toBe('provider_or_media');
  expect(classifyRepairFailure({ error: 'HTTP 402 from provider', stage: 'video_generation' }))
    .toBe('provider_or_media');
  expect(classifyRepairFailure({ error: 'A saved task is still pending_media', stage: 'video_generation' }))
    .toBe('provider_or_media');
  expect(classifyRepairFailure({ error: 'Unexpected application failure', stage: 'unknown' }))
    .toBe('unclassified');
});

test('failure history counts only repeated identical stage and error pairs', () => {
  const original = updateRepairFailureHistory({}, { stage: 'article_selection', error: 'x is not defined' });
  const repeated = updateRepairFailureHistory(original, { stage: 'article_selection', error: 'x is not defined' });
  const changed = updateRepairFailureHistory(repeated, { stage: 'video_direction', error: 'x is not defined' });

  expect(repeated.count).toBe(2);
  expect(repeated.fingerprint).toBe(original.fingerprint);
  expect(changed.count).toBe(1);
  expect(fingerprintRepairFailure({ stage: 'a', error: 'x' })).not.toBe(fingerprintRepairFailure({ stage: 'b', error: 'x' }));
});

test('repair prompt preserves the same run as read-only evidence and forbids paid or artistic changes', () => {
  const prompt = buildCodexRepairPrompt({
    runDirectory: '/runs/run-001', workerName: 'run-001.scene.json', iteration: 'iteration-003',
    stage: 'article_selection', error: 'path is not defined', sourceCommit: 'abc123',
  });
  expect(prompt).toContain('do not edit anything in it');
  expect(prompt).toContain('Do not make provider/API calls');
  expect(prompt).toContain('Scene JSON, defaults, prompts, or artistic planning');
  expect(prompt).toContain('iteration-003');
});

test('repair changes are limited to EU-RESKI source and focused tests', () => {
  expect(isAllowedCodexRepairChange([
    'eu-reski-news/scripts/run-news-scene-image-iteration.mjs',
    'tests/eu-reski-news/codex-repair-handoff.test.js',
  ])).toBe(true);
  expect(isAllowedCodexRepairChange(['eu-reski-news/scenes/run-001.scene.json'])).toBe(false);
  expect(isAllowedCodexRepairChange(['eu-reski-news/GENERATIONS/run-001/record.json'])).toBe(false);
  expect(isAllowedCodexRepairChange(['eu-reski-news/news-scene/planner.mjs', '.env'])).toBe(false);
});

test('automatic invocation stays opt-in', () => {
  expect(codexRepairIsEnabled({})).toBe(false);
  expect(codexRepairIsEnabled({ EXHIBITION_CODEX_REPAIR: '0' })).toBe(false);
  expect(codexRepairIsEnabled({ EXHIBITION_CODEX_REPAIR: '1' })).toBe(true);
});

test('isolated Codex repair refuses a dirty production checkout before creating a worktree', async () => {
  const repositoryRoot = await mkdtemp(join(tmpdir(), 'codex-repair-dirty-repo-'));
  try {
    execFileSync('git', ['init', '-b', 'main'], { cwd: repositoryRoot, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.email', 'repair-test@example.invalid'], { cwd: repositoryRoot });
    execFileSync('git', ['config', 'user.name', 'Repair Test'], { cwd: repositoryRoot });
    await writeFile(join(repositoryRoot, 'tracked.txt'), 'baseline\n');
    execFileSync('git', ['add', 'tracked.txt'], { cwd: repositoryRoot });
    execFileSync('git', ['commit', '-m', 'test baseline'], { cwd: repositoryRoot, stdio: 'ignore' });
    await writeFile(join(repositoryRoot, 'tracked.txt'), 'uncommitted user work\n');

    const result = await runCodexRepairInIsolatedWorktree({
      repositoryRoot,
      prompt: 'repair test',
      failureFingerprint: '0123456789abcdef',
    });

    expect(result.status).toBe('blocked_dirty_worktree');
    expect(execFileSync('git', ['worktree', 'list', '--porcelain'], { cwd: repositoryRoot, encoding: 'utf8' }))
      .not.toContain('eu-reski-codex-repair-');
  } finally {
    await rm(repositoryRoot, { recursive: true, force: true });
  }
});

test('isolated Codex repair tests, commits, and cherry-picks a source-only fix without touching run data', async () => {
  const repositoryRoot = await mkdtemp(join(tmpdir(), 'codex-repair-clean-repo-'));
  const fakeCodexRoot = await mkdtemp(join(tmpdir(), 'codex-repair-fake-cli-'));
  try {
    execFileSync('git', ['init', '-b', 'main'], { cwd: repositoryRoot, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.email', 'repair-test@example.invalid'], { cwd: repositoryRoot });
    execFileSync('git', ['config', 'user.name', 'Repair Test'], { cwd: repositoryRoot });
    await mkdir(join(repositoryRoot, 'eu-reski-news/scripts'), { recursive: true });
    await mkdir(join(repositoryRoot, 'tests/eu-reski-news'), { recursive: true });
    await writeFile(join(repositoryRoot, 'package.json'), JSON.stringify({
      type: 'module',
      scripts: { test: 'node tests/eu-reski-news/fix.test.js' },
    }));
    await writeFile(join(repositoryRoot, 'eu-reski-news/scripts/baseline.mjs'), 'export const baseline = true;\n');
    execFileSync('git', ['add', '.'], { cwd: repositoryRoot });
    execFileSync('git', ['commit', '-m', 'test baseline'], { cwd: repositoryRoot, stdio: 'ignore' });

    const fakeCodex = join(fakeCodexRoot, 'fake-codex.mjs');
    await writeFile(fakeCodex, [
      '#!/usr/bin/env node',
      'import { mkdir, writeFile } from "node:fs/promises";',
      'import { join } from "node:path";',
      'await mkdir(join(process.cwd(), "eu-reski-news/scripts"), { recursive: true });',
      'await mkdir(join(process.cwd(), "tests/eu-reski-news"), { recursive: true });',
      'await writeFile(join(process.cwd(), "eu-reski-news/scripts/fix.mjs"), "export const fixed = true;\\n");',
      'await writeFile(join(process.cwd(), "tests/eu-reski-news/fix.test.js"), "process.exit(0);\\n");',
    ].join('\n'));
    await chmod(fakeCodex, 0o755);

    const result = await runCodexRepairInIsolatedWorktree({
      repositoryRoot,
      prompt: 'repair test',
      failureFingerprint: 'abcdef0123456789',
      environment: { ...process.env, EXHIBITION_CODEX_COMMAND: fakeCodex },
    });

    expect(result.status).toBe('repaired_and_committed');
    expect(result.changedPaths).toEqual([
      'eu-reski-news/scripts/fix.mjs',
      'tests/eu-reski-news/fix.test.js',
    ]);
    expect(await readFile(join(repositoryRoot, 'eu-reski-news/scripts/fix.mjs'), 'utf8'))
      .toContain('fixed = true');
    expect(execFileSync('git', ['status', '--porcelain'], { cwd: repositoryRoot, encoding: 'utf8' })).toBe('');
  } finally {
    await rm(repositoryRoot, { recursive: true, force: true });
    await rm(fakeCodexRoot, { recursive: true, force: true });
  }
});
