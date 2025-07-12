

// Test for lib/generator/post-to-ACE.js (ACE‑Step Space)

const path = require('path');
const fs   = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

console.log(`HF token set? ${!!process.env.HF_TOKEN || !!process.env.HF_API_TOKEN}`);

(async () => {
  // Dynamically import the ES module
  const { default: PostToACE } = await import(
    path.resolve(__dirname, '../lib/generator/post-to-ACE.js')
  );

  // Minimal config – will fall back on DEFAULTS inside the generator
  const config = {
    imageDir: path.resolve(__dirname, '../audio/ace-test'),
    folderName: 'ACE-Step-test',
    audio_duration: 4               // slider default in UI is −1 (random)
  };

  // Initialise ACE client
  const ace = await PostToACE.init(config);

  // Streams: mimic FLUX test pattern (promptCreator turns these to a tag cloud)
  const streams = ['lofi', 'hip‑hop', 'beats', 'relax'];

  // Fast-ish options for a CI run
  const fastOptions = {
    audio_duration: 2,              // 2‑second clip
    infer_step: 30,                 // half the default 60 (faster)
    format: 'mp3'                   // request mp3 directly
  };

  let result;
  try {
    result = await ace.prompt(streams, fastOptions);
    console.log('Generation result:', result);

    // Assert: audioPath returned and file exists
    if (!result || !result.audioPath) {
      console.error('Test failed: No audioPath returned by ACE generator.');
      process.exit(1);
    }
    if (!fs.existsSync(result.audioPath)) {
      console.error('Test failed: Audio file does not exist at', result.audioPath);
      process.exit(1);
    }
    console.log('Test passed: Audio generated and file exists at', result.audioPath);
  } catch (err) {
    console.error('Test failed:', err);
    process.exit(1);
  }
})();