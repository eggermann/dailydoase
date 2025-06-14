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
  const prompt = 'realistic  boobs , cinematic, 4k';

  // Fast, very small options for CI speed
  // Baseline “golden” parameter set
  const fastOptions = {
    steps: 25,          // 25 steps
    width_ui: 704,          // 11:8 aspect, divisible by 32
    height_ui: 512,
    duration_ui: 2,
    ui_frames_to_use: 17,   // N·8 + 1 rule for 2 s
    ui_guidance_scale: 3.0,
    randomize_seed: true    // varied latent each run
};
  // Init client
  const ltx = await PostToLTX.init(config);

  // Generate
  let resultPath;
  try {
    resultPath = await ltx.prompt({
      //  imagePath: '/Volumes/deg-late-24/dailydoase-images/3-HF-/1-6083.png',
      prompt
    }, fastOptions);
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

  // --- Second run: with an input image (if sample exists) ---
  const sampleImage = path.resolve(__dirname, '../test-assets/bus.png'); // adjust if your sample asset lives elsewhere
  if (fs.existsSync(sampleImage)) {
    try {
      const resultPath2 = await ltx.prompt({
        imagePath: sampleImage,
        prompt: 'A medieval castle engulfed in mystical blue flames, 4k with dramatic lighting'
      }, fastOptions);
      console.log('Generated video path (with image):', resultPath2);

      if (!resultPath2 || !fs.existsSync(resultPath2)) {
        console.error('Test failed: video (with image) file not found at', resultPath2);
        process.exit(1);
      }
      console.log('Test passed: video (with image) generated at', resultPath2);
    } catch (err) {
      console.error('Test (with image) failed:', err);
      process.exit(1);
    }
  } else {
    console.warn('Sample image not found, skipping image-to-video test.');
  }
})();