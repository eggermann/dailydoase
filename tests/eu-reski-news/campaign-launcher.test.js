import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from '@jest/globals';
const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
const launcher = join(repoRoot, 'deploy/start-exhibition-campaign.sh');
const verifier = join(repoRoot, 'deploy/verify-exhibition-campaign-complete.py');
describe('Mac mini exhibition campaign launcher', () => {
  test('enables guarded Codex recovery and cooperative restarts for future runs', async () => {
    const source = await readFile(launcher, 'utf8');
    expect(source).toContain('EXHIBITION_CODEX_REPAIR="${EXHIBITION_CODEX_REPAIR:-1}"');
    expect(source).toContain('EXHIBITION_COOPERATIVE_RESTART="${EXHIBITION_COOPERATIVE_RESTART:-1}"');
  });
  test('does not cap workers at the retracted three-iteration limit', async () => {
    const source = await readFile(launcher, 'utf8');
    expect(source).not.toContain('--stop-after-iterations=3');
    expect(source).toContain('Saved workers finished below their configured iteration counts');
  });
  test('rejects a three-iteration run when its Scene requires five', async () => {
    const temp = await mkdtemp(join(tmpdir(), 'eu-reski-campaign-complete-'));
    try {
      const scenes = join(temp, 'eu-reski-news/scenes/campaign-10h');
      const output = join(temp, 'output');
      const run = join(output, 'run-001');
      await mkdir(scenes, { recursive: true });
      await mkdir(run, { recursive: true });
      await writeFile(join(temp, 'eu-reski-news/default-exhibition-settings.json'), JSON.stringify({ generation: { iterations: 4 } }));
      await writeFile(join(scenes, 'scene.json'), JSON.stringify({ generationIntervalInMinutes: '600' }));
      await writeFile(join(scenes, 'five.scene.json'), JSON.stringify({ name: 'five', generationOverrides: { iterations: 5 } }));
      await writeFile(join(output, 'exhibition-state.json'), JSON.stringify({ sceneWorkers: { worker1: { name: 'five', status: 'completed', runDirectory: run } } }));
      const runPath = join(run, 'run.json');
      await writeFile(runPath, JSON.stringify({ status: 'completed', iterationLimit: 3, iterations: [{}, {}, {}] }));
      const check = () => spawnSync('python3', [verifier, temp, output], { encoding: 'utf8' });
      expect(check().status).toBe(1);
      await writeFile(runPath, JSON.stringify({ status: 'completed', iterationLimit: 5, iterations: [{}, {}, {}, {}, {}] }));
      expect(check().status).toBe(0);
    } finally { await rm(temp, { recursive: true, force: true }); }
  });
});
