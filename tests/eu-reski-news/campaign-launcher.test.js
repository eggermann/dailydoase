import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from '@jest/globals';

const launcher = fileURLToPath(new URL('../../deploy/start-exhibition-campaign.sh', import.meta.url));

describe('Mac mini exhibition campaign launcher', () => {
  test('enables guarded Codex recovery and cooperative restarts for future runs', async () => {
    const source = await readFile(launcher, 'utf8');
    expect(source).toContain('EXHIBITION_CODEX_REPAIR="${EXHIBITION_CODEX_REPAIR:-1}"');
    expect(source).toContain('EXHIBITION_COOPERATIVE_RESTART="${EXHIBITION_COOPERATIVE_RESTART:-1}"');
  });

  test('does not cap workers at the retracted three-iteration limit', async () => {
    const source = await readFile(launcher, 'utf8');
    expect(source).not.toContain('--stop-after-iterations=3');
  });
});
