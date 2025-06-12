/**
 * Minimal‑config smoke test: generate the shortest possible video
 * to make sure the new VACE‑WAN integration works end‑to‑end.
 *
 * ‑ numFrames: 9
 * ‑ steps: 10
 * ‑ tiny resolution 360×640
 * ‑ low FPS 8
 */
const path = require('path');
const fs   = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

(async () => {
  // Dynamically import the ES‑module wrapper
  const { default: PostToWan } = await import(
    path.resolve(__dirname, '../lib/generator/post-to-wan-2img-video.js')
  );

  const config = {
    space:       'fffiloni/Wan2.1-VACE-1.3B', // keep explicit for clarity
    folderName:  'shortestVideos',
    guidance:    5,
    numFrames:   9,            // ← shortest clip we want to allow
    steps:       10,           // quick draft quality
    resolution:  '360x640',    // tiny portrait
    frameRate:   '8',          // slow-ish FPS
    // leave the rest to library defaults
  };

  const postToWan = await PostToWan.init(config);

  // Re‑use two sample key‑frames from the repo for consistency
  const imgs = [
    '/Users/eggermann/Projekte/dailydoase/GENERATIONS/v_2-254-FLUX/1749243340776-flux.jpeg',
    '/Users/eggermann/Projekte/dailydoase/GENERATIONS/v_2-254-FLUX/1749243340949-flux.jpeg'
  ];

  try {
    const result = await postToWan.prompt(imgs, {
      numFrames: 9,
      steps:     10,
      frameRate: '8'
    });

    console.log('Shortest‑video generation result:', result);

    if (!result?.imagePath || !fs.existsSync(result.imagePath)) {
      throw new Error('Minimalist shortest video was not created');
    }

    console.log('✅  Test passed: shortest video generated and file exists.');
    process.exit(0);
  } catch (err) {
    console.error('❌  Shortest video test failed:', err);
    process.exit(1);
  }
})();