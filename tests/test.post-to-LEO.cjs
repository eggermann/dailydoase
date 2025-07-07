// Quick test for post‑to‑Leo.js (Tencent SongGeneration)
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const config = {
    // Add any required config options here
};

(async () => {
    // Initialise LEO client
    const { default: PostToLeo } = await import(
      path.resolve(__dirname, '../lib/generator/post-to-Leo.js')
    );
    const leo = await PostToLeo.init(config);

    // Optional reference audio (prompt_audio) – leave undefined to skip
    const promptAudioPath = path.resolve(
        __dirname,
        '/Users/eggermann/Projekte/dailydoase/GENERATIONS/v_2-541-ACE-compo-test/1750110385136-ace-music.wav'
    );

    try {
      const lyrics = 'Hello world, let me sing for you';
      const options = {
        description: 'Simple pop test generated via CLI',
        prompt_audio: promptAudioPath,       // comment out if no reference audio
        genre: 'Pop',
        cfg_coef: 1.0,
        temperature: 0.7,
        top_k: 20
      };

      const result = await leo.prompt(lyrics, options);
      console.log('LEO generation result:', result);
    } catch (err) {
      console.error('Error during LEO prompt:', err);
    }
})();