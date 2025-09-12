import 'dotenv/config';








//---> npm test -- lib/generator/post-to-wan-2.2-5B.test.js





import os from 'os';
import fs from 'fs-extra';
import path from 'path';
import PostToWan22_5B_ImageVideo from './post-to-wan-2.2-5B.js';



const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wan-test-'));
const api = await PostToWan22_5B_ImageVideo.init(
  {
    folderName: path.basename(tmpDir),
    height: 128,
    width: 128,
    duration_seconds: 1.0,
    sampling_steps: 2,
    guide_scale: 1.0,
    shift: 1.0,
    seed: 0,
  });
// api._cli = { predict: jest.fn()
//   .mockResolvedValueOnce({ data: [720, 1280] })
//   .mockResolvedValueOnce({ data: ['https://example.com/fake.mp4'] })
// };

// global.fetch = jest.fn().mockResolvedValue({
//   ok: true,
//   arrayBuffer: async () => Buffer.from('mp4bytes')
// });
const __testDir = path.dirname(new URL(import.meta.url).pathname);
const imgBuffer = await fs.readFile(path.join(__testDir, 'test.datas', '1755295723001-flux.jpeg'));
const resultPath = await api.prompt(imgBuffer, {
  prompt: 'dog'
  , 'loop': {
    prompts: ['cat'],
  }


});

