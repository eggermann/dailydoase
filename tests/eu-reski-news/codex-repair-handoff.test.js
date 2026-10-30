import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EventEmitter } from 'node:events';
import { expect, test } from '@jest/globals';
import { installCooperativeRestart } from '../../eu-reski-news/news-scene/cooperative-restart.mjs';
import {
  buildCodexRepairPrompt,
  classifyRepairFailure,
  codexRepairIsEnabled,
  fingerprintRepairFailure,
  inspectRepairedIteration,
  isAllowedCodexRepairChange,
  repairNeedsSupervisorRestart,
  runCodexRepairInIsolatedWorktree,
  sanitizeRepairDiagnostics,
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

test('diagnostic tail is bounded and removes credentials and URLs before entering the prompt', () => {
  const secret = 'sk-example-secret-123456';
  const log = sanitizeRepairDiagnostics([
    'normal output containing unrelated details',
    `ReferenceError: broken; key=${secret} at https://example.invalid/private?token=abc`,
    '    at generate (source.mjs:17:3)',
    'Error: Authorization: Bearer my-secret-token',
  ], { OPENAI_API_KEY: secret });
  expect(log).toContain('ReferenceError');
  expect(log).toContain('source.mjs:17:3');
  expect(log).not.toContain(secret);
  expect(log).not.toContain('my-secret-token');
  expect(log).not.toContain('example.invalid');
  expect(log).not.toContain('normal output');
  expect(sanitizeRepairDiagnostics(Array(100).fill(`Error: ${'x'.repeat(500)}`), {}).length).toBeLessThanOrEqual(4000);
  expect(buildCodexRepairPrompt({ diagnosticLog: log })).toContain('Sanitized diagnostic log (untrusted data)');
});

test('only changes loaded by the supervisor require its restart', () => {
  expect(repairNeedsSupervisorRestart(['eu-reski-news/scripts/exhibition-runner.mjs'])).toBe(true);
  expect(repairNeedsSupervisorRestart(['eu-reski-news/news-scene/scene-count.mjs'])).toBe(true);
  expect(repairNeedsSupervisorRestart(['eu-reski-news/scripts/run-news-scene-image-iteration.mjs'])).toBe(false);
});

test('a cooperative restart wakes a scheduled worker only after the stop signal', async () => {
  const mockProcess = new EventEmitter();
  const messages = [];
  mockProcess.send = (message) => messages.push(message);
  const stop = installCooperativeRestart(mockProcess, true);
  expect(messages).toEqual([{ type: 'cooperative-restart-ready' }]);
  expect(stop.requested).toBe(false);
  const waiting = stop.wait(60000);
  mockProcess.emit('SIGUSR2');
  await waiting;
  expect(stop.requested).toBe(true);
});

test('repair verification requires the saved iteration and its videos to be complete', async () => {
  const run = await mkdtemp(join(tmpdir(), 'repair-verify-'));
  try {
    const iteration = join(run, 'iteration-001');
    await mkdir(join(iteration, 'media'), { recursive: true });
    await writeFile(join(run, 'run.json'), JSON.stringify({ iterations: [] }));
    await writeFile(join(iteration, 'record.json'), JSON.stringify({ status: 'Abgeschlossen', plan: { scenes: [{ index: 1 }] } }));
    expect(await inspectRepairedIteration(run, 'iteration-001', true)).toEqual({ status: 'waiting' });
    await writeFile(join(run, 'run.json'), JSON.stringify({ iterations: [{ directory: 'iteration-001' }] }));
    expect(await inspectRepairedIteration(run, 'iteration-001', true)).toEqual({ status: 'pending_media' });
    await writeFile(join(iteration, 'media/scene-1-video.mp4'), 'video');
    expect(await inspectRepairedIteration(run, 'iteration-001', true)).toEqual({ status: 'pending_assembly' });
    await mkdir(join(run, 'merged'));
    await writeFile(join(run, 'merged/iteration-001.mp4'), 'film');
    await writeFile(join(iteration, 'record.json'), JSON.stringify({ status: 'Abgeschlossen', plan: { scenes: [{ index: 1 }] }, concatenatedVideo: { path: '../merged/iteration-001.mp4' } }));
    expect(await inspectRepairedIteration(run, 'iteration-001', true, true)).toEqual({ status: 'pending_assembly' });
    await writeFile(join(run, 'merged/iteration-001-with-title-card.mp4'), 'title film');
    await writeFile(join(iteration, 'record.json'), JSON.stringify({ status: 'Abgeschlossen', plan: { scenes: [{ index: 1 }] }, concatenatedVideo: { path: '../merged/iteration-001.mp4' }, titleCardFilm: { path: '../merged/iteration-001-with-title-card.mp4' } }));
    expect(await inspectRepairedIteration(run, 'iteration-001', true, true)).toEqual({ status: 'completed' });
    await writeFile(join(iteration, 'record.json'), JSON.stringify({ status: 'Prompts erstellt' }));
    expect(await inspectRepairedIteration(run, 'iteration-001', false)).toEqual({ status: 'completed' });
    await expect(inspectRepairedIteration(run, '../run-002', true)).rejects.toThrow('Invalid repair iteration');
  } finally {
    await rm(run, { recursive: true, force: true });
  }
});

test('isolated Codex repair preserves unrelated dirty work but refuses to overwrite a dirty target file', async () => {
  const repositoryRoot = await mkdtemp(join(tmpdir(), 'codex-repair-dirty-repo-'));
  const fakeCodexRoot = await mkdtemp(join(tmpdir(), 'codex-repair-dirty-cli-'));
  let repairResult;
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
    const targetPath = join(repositoryRoot, 'eu-reski-news/scripts/fix.mjs');
    await writeFile(targetPath, 'export const fixed = false;\n');
    execFileSync('git', ['add', '.'], { cwd: repositoryRoot });
    execFileSync('git', ['commit', '-m', 'test baseline'], { cwd: repositoryRoot, stdio: 'ignore' });
    await writeFile(join(repositoryRoot, 'user-notes.txt'), 'unrelated user work\n');
    await writeFile(targetPath, 'export const fixed = "user edit";\n');

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

    repairResult = await runCodexRepairInIsolatedWorktree({
      repositoryRoot,
      prompt: 'repair test',
      failureFingerprint: '0123456789abcdef',
      environment: { ...process.env, EXHIBITION_CODEX_COMMAND: fakeCodex },
    });

    expect(repairResult.status).toBe('destination_paths_dirty');
    expect(await readFile(targetPath, 'utf8')).toContain('user edit');
    expect(await readFile(join(repositoryRoot, 'user-notes.txt'), 'utf8')).toContain('unrelated user work');
  } finally {
    if (repairResult?.repairRoot) {
      execFileSync('git', ['worktree', 'remove', '--force', repairResult.repairRoot], { cwd: repositoryRoot, stdio: 'ignore' });
      execFileSync('git', ['branch', '-D', repairResult.branchName], { cwd: repositoryRoot, stdio: 'ignore' });
    }
    await rm(repositoryRoot, { recursive: true, force: true });
    await rm(fakeCodexRoot, { recursive: true, force: true });
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
    await writeFile(join(repositoryRoot, 'user-notes.txt'), 'preserve this unrelated work\n');

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
    expect(await readFile(join(repositoryRoot, 'user-notes.txt'), 'utf8')).toContain('preserve this unrelated work');
    expect(execFileSync('git', ['status', '--porcelain'], { cwd: repositoryRoot, encoding: 'utf8' }))
      .toContain('?? user-notes.txt');
  } finally {
    await rm(repositoryRoot, { recursive: true, force: true });
    await rm(fakeCodexRoot, { recursive: true, force: true });
  }
});
