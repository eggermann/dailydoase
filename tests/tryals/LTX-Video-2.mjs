import { HfInference } from '@huggingface/inference';
import fs from 'fs';
import 'dotenv/config';

const hf = new HfInference(process.env.HF_API_TOKEN);

const prompt = "1006, Sleuth (Australian TV channel), Translation (biology), as vegetable toys";

const videoBytes = await hf.request(
  'text-to-video',
  {
    model: 'Lightricks/LTX-Video',
    provider: 'fal-ai',
    inputs: prompt,
    parameters: {
      height: 512,
      width: 768,
      num_frames: 257,
      seed: 42
    }
  }
);

fs.writeFileSync('ltx-video.mp4', Buffer.from(videoBytes));
console.log('Video saved to ltx-video.mp4');