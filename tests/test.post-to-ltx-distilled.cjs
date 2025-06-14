// Test for lib/generator/post-to-ltx-distilled-2.js

const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

console.log(`Token: ${process.env.HF_API_TOKEN ?? process.env.HF_TOKEN}`);

(async () => {
  // Dynamically import the ES module
  const { default: PostToLTX } = await import(
    path.resolve(__dirname, '../lib/generator/post-to-ltx-distilled-2.js')
  );

  // Config for “distilled” endpoint
  const config = {
    imageDir: path.resolve(__dirname, '../images/ltx-distilled-test'),
    folderName: 'LTX-DISTILLED-2-test'
  };

  // Simple prompt
  const prompt = 'Retro robot staring at neon skyline, cinematic, 4 k';

  // Fast, very small options for CI speed
  const fastOptions = {
    width_ui: 128,
    height_ui: 96,
    num_inference_steps: 4,
    sampler_type: 'ddim',
    randomize_seed: false,
    seed_ui: 123
  };

  // Init client
  const ltx = await PostToLTX.init(config);

  // Generate
  let resultPath;
  try {
    resultPath = await ltx.prompt('/Volumes/deg-late-24/dailydoase-images/3-HF-/1-6083.png', fastOptions);
    console.log('Generated video path:', resultPath);

    // Assert: file exists
    if (!resultPath || !fs.existsSync(resultPath)) {
      console.error('Test failed: video file not found at', resultPath);
      process.exit(1);
    }
    console.log('Test passed: video generated at', resultPath);
  } catch (err) {
    console.error('Test failed:', err);
    process.exit(1);
  }
})();