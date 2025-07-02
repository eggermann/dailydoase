// Test for lib/generator/post-to-ltx-distilled.js using the "dev" endpoint

const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });


(async () => {
  // Dynamically import the ES module
  const { default: PostToLTX } = await import(
    path.resolve(__dirname, '../lib/generator/post-to-ltx-distilled.js')
  );

  // Prepare config for Lightricks/ltx-video-distilled
  const config = {
    folderName: 'ltxVideos-test',
    fps: 6,
    seed: Math.round(1204 * Math.random()),
    imageDir: path.resolve(__dirname, '../images/ltx-test'),
    height_ui: 512,
    width_ui: 704,
    duration_ui: 9,
    ui_guidance_scale: 7,//Controls how much the prompt influences the output. Higher values = stronger influence.
    improve_texture_flag: true,
    negative_prompt: 'worst quality, inconsistent motion, blurry, jittery, distorted',
    mode: 'image-to-video'
  };

  // Example prompt for generation
  const prompt = 'The creature from the image starts to move';

  // Download image from remote URL and save locally
  const imageUrl = 'https://dailydoase.de/v/249-HF-_1_2/1-386.png/img';
  const localImagePath = path.resolve(__dirname, '../tests/assets/remote_test_image.png');
  const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
  const response = await fetch(imageUrl);
  const buffer = await response.buffer();
  fs.writeFileSync(localImagePath, buffer);

  // Initialize LTX client
  const ltx = await PostToLTX.init(config);

  // Generate video with all relevant options
  let result;
  try {
    result = await ltx.prompt(localImagePath, {
      prompt,
      negative_prompt: config.negative_prompt,
      height_ui: config.height_ui,
      width_ui: config.width_ui,
      duration_ui: config.duration_ui,
      ui_guidance_scale: config.ui_guidance_scale,
      improve_texture_flag: config.improve_texture_flag,
      mode: config.mode
    });
    console.log('Generation result:', result);

    // Assert: imagePath is returned and file exists
    if (!result || !result.imagePath) {
      console.error('Test failed: No imagePath returned by FLUX generator.');
      process.exit(1);
    }
    if (!fs.existsSync(result.imagePath)) {
      console.error('Test failed: Image file does not exist at', result.imagePath);
      process.exit(1);
    }
    console.log('Test passed: Image generated and file exists at', result.imagePath);
  } catch (err) {
    console.error('Test failed:', err);
    process.exit(1);
  }
})();