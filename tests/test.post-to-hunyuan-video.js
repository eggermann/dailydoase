const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

console.log(`Token: ${process.env.HF_API_TOKEN  }` );

(async () => {
  // Dynamically import the ES module
  const { default: PostToHunyuan } = await import(
    path.resolve(__dirname, '../lib/generator/post-to-hunyuan-video.js')
  );

  // Prepare config for "dev" endpoint
  const config = {
 
  };

  
  
  // Fastest FLUX options for testing
  const fastOptions = {

  };
  
  // Initialize FLUX client
  const postToHunyuan = await PostToHunyuan.init(config);

  
  // Generate image with minimal options
  let result;
  try {
const imgs = [
      '/Users/eggermann/Projekte/dailydoase/GENERATIONS/v_2-254-FLUX/1749243340776-flux.jpeg',
      '/Users/eggermann/Projekte/dailydoase/GENERATIONS/v_2-254-FLUX/1749243340949-flux.jpeg'
    ];

    result = await postToHunyuan.prompt(imgs, fastOptions);
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