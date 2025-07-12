// Test for lib/generator/post-to-FLUX.js using the "dev" endpoint

const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

console.log(`Token: ${process.env.HF_API  }` );

(async () => {
  // Dynamically import the ES module
  const { default: PostToFLUX } = await import(
    path.resolve(__dirname, '../lib/generator/post-to-genSeq.js')
  );

  // Prepare config for "dev" endpoint
  const config = {
    fluxVariant: 'schnell', // or 'dev' for the dev endpoint
    imageDir: path.resolve(__dirname, '../images/flux-test'),
    folderName: 'FLUX-1-dev-test'
  };

  // Example prompt for generation
  const prompt = 'Cyberneticist, Operation (game), Horror fiction, Naturism, 4k';
  
  // Fastest FLUX options for testing
  const fastOptions = {
    width: 64,
    height: 64,
    num_inference_steps: 1
  };
  
  // Initialize FLUX client
  const flux = await PostToFLUX.init(config);

  
  // Generate image with minimal options
  let result;
  try {
    result = await flux.prompt(prompt, fastOptions);
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