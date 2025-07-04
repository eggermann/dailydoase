const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

(async () => {
  const { default: PostToACE } = await import(
    path.resolve(__dirname, '../lib/generator/post-to-ACE_org.js')
  );

  // Prepare config for ACE-Step
  const config = {
    folderName: 'aceMusic-test',
    audio_duration: 10,
    prompt: 'A calm piano melody',
    lyrics: '',
    infer_step: 50,
    imageDir: path.resolve(__dirname, '../audio/ace-test')
  };

  // Initialize ACE client
  const ace = await PostToACE.init(config);

  // Generate audio with all relevant options
  let result;
  try {
    result = await ace.prompt({
      prompt: config.prompt,
      lyrics: config.lyrics,
      audio_duration: config.audio_duration,
      infer_step: config.infer_step
    });
    console.log('Generation result:', result);
  } catch (err) {
    console.error('Test failed:', err);
    process.exit(1);
  }
})();