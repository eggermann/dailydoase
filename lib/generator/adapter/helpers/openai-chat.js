export const makePromptCreator = ({
  openai,
  model,
  system,
  temperature = 0.4,
  top_p = 0.95,
  buildUser,
}) => {
  if (typeof buildUser !== 'function') {
    throw new Error('makePromptCreator requires buildUser(promptArgs...)');
  }

  return async (...args) => {
    const messages = [];
    if (typeof system === 'string' && system.trim().length > 0) {
      messages.push({ role: 'system', content: system });
    }
    messages.push({ role: 'user', content: buildUser(...args) });

    const response = await openai.chat.completions.create({
      model,
      messages,
      temperature,
      top_p,
    });

    return response.choices[0].message.content.trim();
  };
};
