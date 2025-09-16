import { PostToMirelo_VideoSound } from './video-sound.js';

const mirelo = await new PostToMirelo_VideoSound({
  // you can also pass auth_mode: 'bearer' | 'x-api-key' | 'both' (default: bearer)
}).init();

const outVideoPath = await mirelo.prompt('/Users/eggermann/Projekte/dailydoase/lib/generator/test.datas/1758015756815-wan22-first-last.mp4', {
  text_prompt: '',
  duration: 8,
  num_samples: 1,
  seed: 2105,
  // Ensure a concrete artifact is saved even if the API returns 4xx/5xx or no asset
  return_input_on_error: true
});
console.log('Saved to:', outVideoPath);