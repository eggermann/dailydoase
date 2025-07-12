// Test for post-to-ACE copy.js using a specific .wav file
const path = require('path');
const fs = require('fs-extra');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const config = {
    // Add any required config options here
};

(async () => {
    // Initialise ACE client
    const { default: PostToACE } = await import(
        path.resolve(__dirname, '../lib/generator/post-to-ACE.js')
    );

    const ace = await PostToACE.init(config);

    // Path to the test .wav file
    const wavPath = path.resolve(
        __dirname,
        '/Users/eggermann/Projekte/dailydoase/GENERATIONS/v_2-541-ACE-compo-test/1750110385136-ace-music.wav'
    );

    // Read the .wav file (if needed for options)
  //  const wavBuffer = await fs.readFile(wavPath);

    // Example: call prompt with the file path as prompt and 1 second duration
    try {
      const result = await ace.prompt(wavPath, { audio_duration: 1 });
      console.log('Generation result:', result);
    } catch (err) {
      console.error('Error during ACE prompt:', err);
    }
})();