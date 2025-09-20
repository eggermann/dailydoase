import path from 'path';
import { fileURLToPath } from 'url';
import { generateYouTubeMetadataFromDir } from './generate-youtube-metadata.js';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
describe('generateYouTubeMetadataFromDir', () => {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const folder = path.resolve(path.join(__dirname, '../../generator/test.datas/179-start-end-frame-video/parts/180-FLUX'));

  test('returns title and description with Art Project subheading', async () => {
    // Ensure fallback path by clearing API key in this test context
    const prev = process.env.OPENAI_API_KEY;
    //delete process.env.OPENAI_API_KEY;

    const res = await generateYouTubeMetadataFromDir({ dirPath: folder, projectName: 'DailyDoase' });
    expect(res).toBeTruthy();
    expect(typeof res.title).toBe('string');
    expect(res.title.length).toBeGreaterThan(0);
    expect(typeof res.description).toBe('string');
    expect(res.description.toLowerCase()).toContain('art project');

    // restore
    if (prev) process.env.OPENAI_API_KEY = prev;
  }, 15_000);
});

