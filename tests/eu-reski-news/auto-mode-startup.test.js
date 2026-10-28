import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from '@jest/globals';
import { articleKey } from '../../eu-reski-news/scripts/news-eu-relevance.mjs';

const runnerPath = fileURLToPath(new URL('../../eu-reski-news/scripts/run-news-scene-image-iteration.mjs', import.meta.url));

describe('new Auto Mode iteration startup', () => {
  test('sends Auto Director request and persists it when iteration has no saved Auto files', async () => {
    const root = await mkdtemp(join(tmpdir(), 'eu-reski-auto-startup-'));
    const newsDirectory = join(root, 'news');
    const outputDirectory = join(root, 'output');
    const iterationDirectory = join(outputDirectory, 'iteration-001');
    const semanticPath = join(root, 'semantic.json');
    const fetchMockPath = join(root, 'mock-fetch.cjs');
    const callsPath = join(root, 'api-calls.json');
    const imageUrl = 'https://mock.invalid/story-image.png';
    const article = {
      id: 'story-1',
      title: 'EU policy test story',
      text: 'A new policy decision changes how European institutions coordinate shared work.',
      summary: 'A new European policy decision.',
      image: imageUrl,
      url: 'https://mock.invalid/story',
      source_country: 'EU',
      publish_date: '2026-10-28',
    };
    try {
      await mkdir(newsDirectory, { recursive: true });
      await writeFile(join(newsDirectory, 'all-test.json'), JSON.stringify({ date: '2026-10-28', news: [article] }));
      await writeFile(join(newsDirectory, 'eu-relevance-test.json'), JSON.stringify({
        sourceFile: 'all-test.json',
        entries: { [articleKey(article)]: { euRelevance: 0.95 } },
      }));
      await writeFile(semanticPath, JSON.stringify({
        provider: 'offline-test',
        capturedAt: '2026-10-28T12:00:00.000Z',
        words: [['EU', 'en']],
        entries: [{ id: 'mock-entry', seed: ['EU', 'en'], item: { title: 'Europe', summary: 'European cooperation.' } }],
      }));
      await writeFile(fetchMockPath, [
        "const fs = require('node:fs');",
        'let openAiCalls = [];',
        'globalThis.fetch = async (input, init = {}) => {',
        "  const url = typeof input === 'string' ? input : input.url;",
        '  if (url === process.env.TEST_IMAGE_URL) {',
        "    return new Response(Buffer.from('offline image bytes'), { headers: { 'content-type': 'image/png' } });",
        '  }',
        "  if (url === 'https://api.openai.com/v1/chat/completions') {",
        '    const body = JSON.parse(init.body);',
        '    openAiCalls.push({ url, body });',
        '    fs.writeFileSync(process.env.TEST_API_CALLS_PATH, JSON.stringify(openAiCalls, null, 2));',
        '    if (openAiCalls.length === 1) {',
        '      return new Response(JSON.stringify({',
        '        choices: [{ finish_reason: "stop", message: { content: JSON.stringify({',
        '          dramaturgicalConcept: "Follow the decision through two clear turns.",',
        '          visualConcept: "Use a restrained, symbolic composition.",',
        '          motionConcept: "Keep movement slow and deliberate.",',
        '          audioConcept: "Use quiet ambient sound and pauses.",',
        '          sceneCount: 2,',
        '          sceneCountReason: "Two scenes express the decision and its immediate consequence.",',
        '          flags: {',
        '            storyClou: "off", legacyGuernicaStyleReferencePrompt: false,',
        '            preserveCubistVideoStyle: false, sceneVisualControls: "scene-specific",',
        '            articleImageReference: false, landscapePrompt: false,',
        '            videoDirection: "off", videoVision: "off", videoAudioDirection: "off", videoMaxZoom: 0.08,',
        '          },',
        '          reason: "A compact form fits this test article.",',
        '        }) } }],',
        '        usage: { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 },',
        '      }), { headers: { "content-type": "application/json" } });',
        '    }',
        '    return new Response(JSON.stringify({ error: { message: "Stop after verifying Auto Director startup." } }), {',
        '      status: 400, headers: { "content-type": "application/json" },',
        '    });',
        '  }',
        '  throw new Error(`Unexpected network request in offline test: ${url}`);',
        '};',
      ].join('\n'));
      let iterationExistedBeforeStart = true;
      try {
        await access(iterationDirectory);
      } catch {
        iterationExistedBeforeStart = false;
      }
      expect(iterationExistedBeforeStart).toBe(false);
      const result = spawnSync(process.execPath, [
        '--require', fetchMockPath,
        runnerPath,
        '--auto-mode', '--prompt-only', '--iterations=1', '--article-id=story-1',
        `--news-dir=${newsDirectory}`, `--output-dir=${outputDirectory}`, `--stream-file=${semanticPath}`,
        '--no-style-reference', '--no-guernica-figure-reference',
      ], {
        encoding: 'utf8',
        timeout: 20000,
        env: {
          ...process.env,
          OPENAI_API_KEY: 'offline-test-key',
          TEST_IMAGE_URL: imageUrl,
          TEST_API_CALLS_PATH: callsPath,
        },
      });

      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain('gpt: HTTP 400');
      const calls = JSON.parse(await readFile(callsPath, 'utf8'));
      expect(calls).toHaveLength(2);
      const savedRequest = JSON.parse(await readFile(join(iterationDirectory, 'auto-director-request.json'), 'utf8'));
      expect(calls[0].body).toEqual(savedRequest);
      expect(JSON.parse(await readFile(join(iterationDirectory, 'auto-director-response.json'), 'utf8')).choices[0].message.content)
        .toContain('sceneCountReason');
      expect(JSON.parse(await readFile(join(iterationDirectory, 'auto-decisions.json'), 'utf8')).sceneCount).toBe(2);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
