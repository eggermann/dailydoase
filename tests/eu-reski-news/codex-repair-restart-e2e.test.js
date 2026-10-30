import { chmod, copyFile, cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { execFileSync, spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@jest/globals';
import { articleKey } from '../../eu-reski-news/scripts/news-eu-relevance.mjs';

const sourceRoot = fileURLToPath(new URL('../..', import.meta.url));

async function waitFor(predicate, output, label, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Timed out waiting for ${label}:\n${output()}`);
}

test('repair restarts the supervisor only after another worker finishes and verifies the same iteration', async () => {
  const root = await mkdtemp(join(tmpdir(), 'reski-repair-restart-'));
  const work = join(root, 'work');
  const output = join(work, 'output');
  const news = join(work, 'news');
  const scenes = join(work, 'scenes');
  let runner;
  let runnerOutput = '';
  try {
    await mkdir(join(root, 'eu-reski-news/scripts'), { recursive: true });
    await mkdir(join(root, 'tests/eu-reski-news'), { recursive: true });
    await mkdir(news, { recursive: true });
    await mkdir(scenes, { recursive: true });
    await cp(join(sourceRoot, 'eu-reski-news/news-scene'), join(root, 'eu-reski-news/news-scene'), { recursive: true });
    for (const file of ['exhibition-runner.mjs', 'news-eu-relevance.mjs']) {
      await copyFile(join(sourceRoot, 'eu-reski-news/scripts', file), join(root, 'eu-reski-news/scripts', file));
    }
    await copyFile(join(sourceRoot, 'eu-reski-news/default-exhibition-settings.json'), join(root, 'eu-reski-news/default-exhibition-settings.json'));
    await writeFile(join(root, '.gitignore'), '/work/\nnode_modules\n');
    await writeFile(join(root, 'package.json'), JSON.stringify({ type: 'module', scripts: { test: 'node offline-test.cjs' } }));
    await writeFile(join(root, 'offline-test.cjs'), 'process.exit(0);\n');
    await writeFile(join(scenes, 'scene.json'), JSON.stringify({ generationIntervalInMinutes: '-1', biasMode: 'off' }));
    await writeFile(join(scenes, 'a.scene.json'), JSON.stringify({ name: 'faulty', generationOverrides: { iterations: 1 } }));
    await writeFile(join(scenes, 'b.scene.json'), JSON.stringify({ name: 'busy', generationOverrides: { iterations: 1 } }));
    const article = { title: 'Offline test', text: 'A European article for an offline test.', image: 'https://example.invalid/image', source_country: 'EU', publish_date: '2026-10-30' };
    await writeFile(join(news, 'all-test.json'), JSON.stringify({ date: article.publish_date, fetchedAt: new Date().toISOString(), news: [article] }));
    await writeFile(join(news, 'eu-relevance-test.json'), JSON.stringify({ sourceFile: 'all-test.json', articleCount: 1, completedCount: 1, failedCount: 0, unresolvedCount: 0, entries: { [articleKey(article)]: { euRelevance: 1 } } }));

    const fakeRunner = `import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { join } from 'node:path';
const arg = process.argv.find((value) => value.startsWith('--iterator-plan='));
const plan = JSON.parse(await readFile(arg.slice('--iterator-plan='.length), 'utf8'));
const directory = join(process.env.NEWS_OUTPUT_DIR, plan.workerKey);
const iteration = join(directory, 'iteration-001');
const fingerprint = createHash('sha256').update(JSON.stringify(plan)).digest('hex');
await mkdir(iteration, { recursive: true });
console.log('Run folder: ' + directory);
const manifest = { status: 'interrupted', iteratorPlanFingerprint: fingerprint, iterations: [] };
await writeFile(join(directory, 'run.json'), JSON.stringify(manifest));
if (plan.workerKey.includes('busy')) {
  process.once('SIGUSR2', () => { writeFile(join(process.env.TEST_WORK, 'busy-signal'), 'requested'); });
  process.send?.({ type: 'cooperative-restart-ready' });
  await writeFile(join(process.env.TEST_WORK, 'busy-active'), 'active');
  while (!await access(join(process.env.TEST_WORK, 'release')).then(() => true, () => false)) await new Promise((resolve) => setTimeout(resolve, 20));
} else {
  const supervisor = await readFile(join(process.cwd(), 'eu-reski-news/scripts/exhibition-runner.mjs'), 'utf8');
  if (!supervisor.includes('// REPAIR_TEST_PATCH')) {
    await writeFile(join(iteration, 'live.json'), JSON.stringify({ status: 'interrupted', stage: 'planning', error: 'testVariable is not defined' }));
    console.error('ReferenceError: testVariable is not defined token=' + process.env.TEST_API_KEY);
    process.exit(1);
  }
}
await writeFile(join(iteration, 'record.json'), JSON.stringify({ status: 'Prompts erstellt' }));
await writeFile(join(directory, 'run.json'), JSON.stringify({ ...manifest, status: 'completed', iterations: [{ index: 1, directory: 'iteration-001' }] }));
`;
    await writeFile(join(root, 'eu-reski-news/scripts/run-news-scene-image-iteration.mjs'), fakeRunner);
    const fakeCodex = join(work, 'fake-codex.mjs');
    await writeFile(fakeCodex, `#!/usr/bin/env node
import { appendFile, mkdir, writeFile } from 'node:fs/promises';
await appendFile('eu-reski-news/scripts/exhibition-runner.mjs', '\\n// REPAIR_TEST_PATCH\\nconsole.log("REPAIRED_SUPERVISOR_LOADED");\\n');
await mkdir('tests/eu-reski-news', { recursive: true });
await writeFile('tests/eu-reski-news/codex-auto-fix.test.js', 'process.exit(0);\\n');
`);
    await chmod(fakeCodex, 0o755);
    execFileSync('git', ['init', '-b', 'main'], { cwd: root, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.name', 'Repair Test'], { cwd: root });
    execFileSync('git', ['config', 'user.email', 'repair-test@example.invalid'], { cwd: root });
    execFileSync('git', ['add', '.'], { cwd: root });
    execFileSync('git', ['commit', '-m', 'fixture'], { cwd: root, stdio: 'ignore' });

    runner = spawn(process.execPath, [join(root, 'eu-reski-news/scripts/exhibition-runner.mjs'), '--new-run', `--scene=${scenes}`, '--generation-interval=-1', '--stop-after-iterations=1', '--prompt-only', '--no-first-last-glue'], {
      cwd: root,
      env: { ...process.env, NEWS_NEWS_DIR: news, NEWS_OUTPUT_DIR: output, NEWS_REFRESH_CHECK_MS: '100000', EXHIBITION_CODEX_REPAIR: '1', EXHIBITION_CODEX_COMMAND: fakeCodex, EXHIBITION_WORKER_RETRY_BASE_MS: '10', TEST_WORK: work, TEST_API_KEY: 'sk-test-sensitive-value-1234' },
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    runner.stdout.on('data', (data) => { runnerOutput += data; });
    runner.stderr.on('data', (data) => { runnerOutput += data; });
    await waitFor(async () => {
      const repairCase = await readFile(join(output, '01-faulty', 'codex-repair-case.json'), 'utf8').then(JSON.parse, () => null);
      if (repairCase?.repairResult) throw new Error(`Repair did not start: ${JSON.stringify(repairCase.repairResult)}\n${runnerOutput}`);
      return readFile(join(output, 'exhibition-state.json'), 'utf8').then((data) => JSON.parse(data).repairRestart?.status === 'pending', () => false);
    }, () => runnerOutput, 'pending restart');
    expect(await readFile(join(work, 'busy-active'), 'utf8')).toBe('active');
    await waitFor(() => readFile(join(work, 'busy-signal'), 'utf8').then(() => true, () => false), () => runnerOutput, 'cooperative stop request');
    expect(runnerOutput).not.toContain('REPAIRED_SUPERVISOR_LOADED');
    const runPath = join(output, '01-faulty');
    const repairCase = JSON.parse(await readFile(join(runPath, 'codex-repair-case.json'), 'utf8'));
    expect(repairCase.diagnosticLog).toContain('ReferenceError');
    expect(repairCase.diagnosticLog).not.toContain('sk-test-sensitive-value-1234');
    await writeFile(join(work, 'release'), 'done');
    await waitFor(() => readFile(join(runPath, 'codex-repair-state.json'), 'utf8').then((data) => JSON.parse(data).verification?.status === 'completed', () => false), () => runnerOutput, 'iteration completion');
    expect(runnerOutput).toContain('REPAIRED_SUPERVISOR_LOADED');
    const state = JSON.parse(await readFile(join(output, 'exhibition-state.json'), 'utf8'));
    expect(state.repairRestart.status).toBe('restarted');
    expect(state.sceneWorkers['01-faulty'].runDirectory).toBe(runPath);
  } finally {
    if (runner && runner.exitCode === null) {
      try { process.kill(-runner.pid, 'SIGTERM'); } catch (error) { if (error.code !== 'ESRCH') throw error; }
      await new Promise((resolve) => runner.once('close', resolve));
    }
    try {
      const worktrees = execFileSync('git', ['worktree', 'list', '--porcelain'], { cwd: root, encoding: 'utf8' });
      for (const line of worktrees.split('\n')) {
        if (line.startsWith('worktree ') && line.includes('/eu-reski-codex-repair-')) {
          execFileSync('git', ['worktree', 'remove', '--force', line.slice('worktree '.length)], { cwd: root, stdio: 'ignore' });
        }
      }
    } catch { /* The fixture may have failed before Git was initialized. */ }
    await rm(root, { recursive: true, force: true });
  }
}, 30000);
