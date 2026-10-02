const TEXT_ARTIFACT_NEGATIVE_PROMPT = [
  'readable text',
  'generated text',
  'letters',
  'words',
  'numbers',
  'captions',
  'subtitles',
  'title cards',
  'labels',
  'signage',
  'logos',
  'watermarks',
  'timestamps',
  'UI',
  'interface',
  'typography',
  'handwriting',
  'glyphs',
  'poster text',
  'screen text',
  'text artifacts',
].join(', ');

export const appendWanTextArtifactNegativePrompt = (negativePrompt = '') => [
  String(negativePrompt || '').trim(),
  TEXT_ARTIFACT_NEGATIVE_PROMPT,
].filter(Boolean).join(', ');

export { TEXT_ARTIFACT_NEGATIVE_PROMPT };
