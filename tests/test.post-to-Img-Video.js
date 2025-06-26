// Test for lib/generator/post-to-ltx-distilled.js using the "dev" endpoint



const path = require('path');
const fs = require('fs');


require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

console.log(`Token: ${process.env.HF_API_TOKEN}`);


const scriptName = 'post-to-Img-Video.js'

import('../semantic-stream.js').then(module => {
 
  module.default(
    [{

      words: [['wildlife', 'en']],
      model: {
        scriptName
      },
      video: {
        width_ui: 256,
        height_ui: 256,
        randomize_seed: false,                 // we control the seed manually
        seed_ui: Math.floor(Math.random() * 1e9) // different seed on every run
      },
      image: {
        fluxVariant: 'schnell'
      },
      promptFunktion: async (streams) => {
        return streams;
      }
    }]
  )
}).catch(err => {
  console.error('Error in start.js:', err);
  process.exit(1);
});


return;



const scriptNameX = 'post-to-Img-Video.js'

import('./semantic-stream.js').then(module =>
  module.default(
    [{

      words: [['wildlife', 'en']],
      model: {
        scriptName
      },
      video: {
        width_ui: 256,
        height_ui: 256,
        randomize_seed: false,                 // we control the seed manually
        seed_ui: Math.floor(Math.random() * 1e9) // different seed on every run
      },
      image: {
        fluxVariant: 'schnell'
      },
      promptFunktion: async (streams, options) => {
        return streams;
      }
    }]
  )).catch(err => {
    console.error('Error in start.js:', err);
    process.exit(1);
  });



(async () => {

  // Dynamically import the ES module
  const { default: PostToLTX } = await import(
    path.resolve(__dirname, '../lib/generator/post-to-Img-Video.js')
  );

  // Prepare config for Lightricks/ltx-video-distilled
  const configXX = {
    folderName: 'ltxVideos-test',
    cfg: 3.0,
    steps: 6,
    motionBucketId: 127,
    fps: 6,
    seed: Math.round(1204 * Math.random()),
    imageDir: path.resolve(__dirname, '../images/ltx-test'),
    height_ui: 512,
    width_ui: 704,
    duration_ui: 8,
    ui_guidance_scale: 1,
    improve_texture_flag: true,
    negative_prompt: 'worst quality, inconsistent motion, blurry, jittery, distorted',
    mode: 'image-to-video'
  };

  try {

    //LTXVideo
    scriptName = 'post-to-Img-Video.cjs'

    await import('../start.js').then(async module => {

      await module.default({
        words: ['wildlife', 'en'],
        model: {
          scriptName
        },
        video: {
          width_ui: 256,
          height_ui: 256,
          randomize_seed: false,                 // we control the seed manually
          seed_ui: Math.floor(Math.random() * 1e9) // different seed on every run
        },
        image: {
          fluxVariant: 'schnell'
        },
        promptFunktion: async (streams, options) => {
          return streams;
        }

      })
    }).catch(err => {
      console.error('Error in start.js:', err);
      process.exit(1);
    });


  } catch (err) {
    console.error('Test failed:', err);
    process.exit(1);
  }
})();