import { describe, expect, test } from '@jest/globals';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createSemanticSource } from '../../eu-reski-news/news-scene/semantic-source.mjs';

describe('shared semantic sequences across variants', () => {
  test('every variant receives the same three different inputs in order', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'eu-semantic-sequence-'));
    try {
      const snapshots = ['First', 'Second', 'Third'].map((title) => ({
        provider: 'semantic-stream', capturedAt: '2026-10-21T00:00:00Z',
        entries: [{ id: 'stream-1', seed: ['EU', 'en'], item: { title, text: title } }],
      }));
      const path = join(directory, 'sequence.json');
      writeFileSync(path, JSON.stringify({ snapshots }));
      for (let variant = 0; variant < 6; variant += 1) {
        const source = await createSemanticSource({ 'stream-sequence-file': path });
        for (const expected of snapshots) {
          const result = await source.next();
          expect(result).toEqual(expected);
          result.entries[0].item.title = 'Changed by caller';
        }
        await expect(source.next()).rejects.toThrow('exhausted');
      }
      const resumed = await createSemanticSource({ 'stream-sequence-file': path });
      await resumed.next();
      expect(await resumed.next()).toEqual(snapshots[1]);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
