// Test for lib/generator/post-to-ginigen-Veo3-free.js

const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });


(async () => {
  // Dynamically import the ES module
  const { default: PostToVEO3 } = await import(
    path.resolve(__dirname, '../lib/generator/post-to-ginigen-Veo3-free.js')
  );

  // Prepare config for VEO3
  // This test uses fast: 'test' to exercise the fast generation option
  const config = {
    folderName: 'veo3Videos-test',
    seed: Math.round(1204 * Math.random()),
    imageDir: path.resolve(__dirname, '../videos/veo3-test')
  };

  // Example prompt for generation
  const prompt = 'The creature from the image starts to move';

  // Initialize VEO3 client
  const veo3 = await PostToVEO3.init(config);

  // Generate video-with-audio with prompt
  let result;
  try {
    // Low‑resolution, very short clip (1.5 s) for quick tests
    result = await veo3.prompt({}, {
      prompt,
      height: 128,           // low resolution (must be multiple of 32)
      width: 128,
      enable_audio:true, // enable audio generation
      duration_seconds: 4.5, // 1.5‑second clip
      nag_scale: 5,          // low‑condition: weaker negative‑prompt influence
      audio_cfg_strength: 0.5 // lower CFG for simpler audio
    });
    console.log('Generation result:', result);

    // Assert: video & audio paths are returned and files exist
    if (!result || !result.video) {
      console.error('Test failed: No video path returned by VEO3 generator.');
      process.exit(1);
    }
    if (!fs.existsSync(result.video)) {
      console.error('Test failed: Video file does not exist at', result.video);
      process.exit(1);
    }
    if (!result.audio) {
      console.error('Test failed: No audio path returned by VEO3 generator.');
      process.exit(1);
    }
    if (!fs.existsSync(result.audio)) {
      console.error('Test failed: Audio file does not exist at', result.audio);
      process.exit(1);
    }
    console.log('Test passed: Video & audio generated and files exist at', result.video, 'and', result.audio);
  } catch (err) {
    console.error('Test failed:', err);
    process.exit(1);
  }
})();