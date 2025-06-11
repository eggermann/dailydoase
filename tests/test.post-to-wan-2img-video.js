const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

(async () => {
  // Dynamically import the ES module
  const { default: PostToWan } = await import(
    path.resolve(__dirname, '../lib/generator/post-to-wan-2img-video.js')
  );

  // Prepare config for "dev" endpoint
  const config = {
    space: 'fffiloni/Wan2.1-VACE-1.3B',
    folderName: 'hunYuanVideos',
    guidance: 7.5,
    numFrames: 49,
    steps: 50,
    resolution: '720x1280',
    negativePrompt: 'Bright and saturated tones, overexposed, static, unclear details, subtitles, style, work, painting, frame, still, overall grayish, worst quality, low quality, JPEG compression artifacts, ugly, deformed, extra fingers, poorly drawn hands, poorly drawn face, deformed, disfigured, misshapen limbs, fused fingers, motionless frame, cluttered background, three legs, crowded background, walking backwards.',
    shiftScale: 16,
    sampleSteps: 25,
    contextScale: 1,
    guideScale: 5,
    inferSeed: -1,
    outputHeight: '480',
    outputWidth: '832',
    frameRate: '16'
  };

  // Fastest FLUX options for testing
  const fastOptions = {};

  // Initialize client using singleton wrapper
  const postToWan = await PostToWan.init(config);

  // Generate image with minimal options
  let result;
  try {
    const imgs = [
      '/Users/eggermann/Projekte/dailydoase/GENERATIONS/v_2-254-FLUX/1749243340776-flux.jpeg',
      '/Users/eggermann/Projekte/dailydoase/GENERATIONS/v_2-254-FLUX/1749243340949-flux.jpeg'
    ];

    result = await postToWan.prompt(imgs, fastOptions);
    console.log('Generation result:', result);

    // Assert: imagePath is returned and file exists
    if (!result || !result.imagePath || typeof result.imagePath !== 'string' || !result.imagePath.length) {
      throw new Error('No valid imagePath returned');
    }
    if (!fs.existsSync(result.imagePath)) {
      throw new Error('Generated imagePath does not exist: ' + result.imagePath);
    }
    console.log('Test passed: Valid imagePath generated and file exists.');
    process.exit(0);
  } catch (err) {
    console.error('Test failed:', err);
    process.exit(1);
  }
})();