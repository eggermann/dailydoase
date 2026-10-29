import { describe, expect, test } from '@jest/globals';
import { applyStoryCodeContext } from '../../eu-reski-news/news-scene/story-code-context.mjs';

describe('story planner code context', () => {
  test('removes source code and sends only the supplied summary when disabled', () => {
    const payload = { messages: [{ content: [
      { type: 'text', text: 'director rules' },
      { type: 'text', text: 'SOURCE CODE CONTEXT (concatenated file sections):\nsecret code' },
    ] }] };
    applyStoryCodeContext(payload, { includeSourceCodeContext: false, sourceCodeSummary: 'Concise setting map.' });
    expect(payload.messages[0].content).toEqual([
      { type: 'text', text: 'director rules' },
      { type: 'text', text: 'APPLICATION FLAG AND PIPELINE SUMMARY (context only; director instructions take precedence):\nConcise setting map.' },
    ]);
  });

  test('keeps the existing manual prompt payload unchanged by default', () => {
    const payload = { messages: [{ content: [
      { type: 'text', text: 'director rules' },
      { type: 'text', text: 'SOURCE CODE CONTEXT (concatenated file sections):\nexisting code' },
    ] }] };
    const before = structuredClone(payload);
    applyStoryCodeContext(payload);
    expect(payload).toEqual(before);
  });

  test('handles Auto Director requests whose user content is serialized JSON', () => {
    const payload = { messages: [
      { role: 'system', content: 'director rules' },
      { role: 'user', content: JSON.stringify({ article: { title: 'News' } }) },
    ] };
    applyStoryCodeContext(payload, { includeSourceCodeContext: false, sourceCodeSummary: 'Pipeline summary.' });
    expect(payload.messages[0].content).toBe('director rules');
    expect(payload.messages[1].content).toContain('"title":"News"');
    expect(payload.messages[1].content).toContain('Pipeline summary.');
  });
});
