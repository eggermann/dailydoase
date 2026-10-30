export function applyStoryCodeContext(payload, { includeSourceCodeContext = true, sourceCodeSummary = null } = {}) {
  const userMessage = payload.messages.find((message) => message.role === 'user') || payload.messages[0];
  const content = userMessage.content;
  if (!includeSourceCodeContext) {
    if (Array.isArray(content)) {
      userMessage.content = content.filter((part) => !(typeof part.text === 'string'
        && part.text.startsWith('SOURCE CODE CONTEXT (concatenated file sections):')));
    } else if (typeof content === 'string') {
      userMessage.content = content.replace(/\n?SOURCE CODE CONTEXT \(concatenated file sections\):[\s\S]*$/u, '');
    }
  }
  if (sourceCodeSummary) {
    const summaryText = `APPLICATION FLAG AND PIPELINE SUMMARY (context only; director instructions take precedence):\n${sourceCodeSummary}`;
    if (Array.isArray(userMessage.content)) {
      if (!userMessage.content.some((part) => part.type === 'text' && part.text === summaryText)) {
        userMessage.content.push({ type: 'text', text: summaryText });
      }
    }
    else userMessage.content = `${userMessage.content}\n\n${summaryText}`;
  }
  return payload;
}
