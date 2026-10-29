export function applyStoryCodeContext(payload, { includeSourceCodeContext = true, sourceCodeSummary = null } = {}) {
  const content = payload.messages[0].content;
  if (!includeSourceCodeContext) {
    payload.messages[0].content = content.filter((part) => !(typeof part.text === 'string'
      && part.text.startsWith('SOURCE CODE CONTEXT (concatenated file sections):')));
  }
  if (sourceCodeSummary) payload.messages[0].content.push({
    type: 'text',
    text: `APPLICATION FLAG AND PIPELINE SUMMARY (context only; director instructions take precedence):\n${sourceCodeSummary}`,
  });
  return payload;
}
