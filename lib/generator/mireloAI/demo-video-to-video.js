import 'dotenv/config';
import { PostToMirelo_VideoSound } from './video-sound.js';

async function main() {
  const url = process.env.MIRELO_DEMO_VIDEO_URL || 'https://di3otfzjg1gxa.cloudfront.net/input_example.mp4';

  const client = await new PostToMirelo_VideoSound({
    folderName: 'mirelo-demo',
    duration: Number(process.env.MIRELO_DEMO_DURATION ?? 2),
    num_samples: 1,
    steps: Number(process.env.MIRELO_DEMO_STEPS ?? 25),
    seed: Number(process.env.MIRELO_DEMO_SEED ?? 2105),
    creativity_coef: Number(process.env.MIRELO_DEMO_CREATIVITY ?? 4.5),
    auto_upload_if_local: true,
    maxRetries5xx: 1,
    retryDelayMs: 800,
    auth_mode: process.env.MIRELO_AUTH_MODE || undefined
  }).init();

  const savePath = await client.runVideoToVideo(url, {
    text_prompt: process.env.MIRELO_DEMO_TEXT || 'cinematic music, orchestral, epic, dramatic',
    return_input_on_error: true
  });

  console.log('Saved movie:', savePath);
}

main().catch((err) => {
  console.error('Demo failed:', err?.message || err);
  process.exit(1);
});