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
    const response = await openai.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: buildUser(...args) },
      ],
      temperature,
      top_p,
    });

    return response.choices[0].message.content.trim();
  };
};
