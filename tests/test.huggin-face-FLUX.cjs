// Test for lib/generator/post-to-FLUX.js using the "dev" endpoint

const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

console.log(`Token: ${process.env.HF_API  }` );

(async () => {
  // Dynamically import the ES module
  const { default: PostToFLUX } = await import(
    path.resolve(__dirname, '../lib/generator/post-to-FLUX.js')
  );

  // Prepare config for "dev" endpoint
  const config = {
    fluxVariant: 'dev',
    folderName: 'FLUX-1-dev-test'
  };

  // Example prompt for generation
  const prompt = 'Cyberneticist, Operation (game), Horror fiction, Naturism, 4k';


  // Initialize FLUX client
  const flux = await PostToFLUX.init(config);
  console.log(flux);

  // Generate image (assuming generate method exists)
  let result;
  try {
    result = await flux.prompt(prompt);
    console.log('Generation result:', result);

    // Assert or log output
    if (result && result.imagePath && fs.existsSync(result.imagePath)) {
      console.log('Test passed: Image generated at', result.imagePath);
    } else {
      console.error('Test failed: No image generated.');
      process.exit(1);
    }
  } catch (err) {
    console.error('Test failed:', err);
    process.exit(1);
  }
})();