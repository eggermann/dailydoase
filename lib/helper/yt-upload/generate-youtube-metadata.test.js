import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs-extra';
import { generateYouTubeMetadataFromDir } from './generate-youtube-metadata.js';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
describe('generateYouTubeMetadataFromDir', () => {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const folder = '/Users/eggermann/Projekte/dailydoase/lib/generator/adapter/tests/GENERATIONS/224-start-end-frame-mirelo/parts/225-FLUX';
  
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

    // Save as Markdown alongside the source folder for easy copy/paste
    try {
      const mdPath = path.join(folder, 'youtube-metadata.md');
      const md = `# ${res.title}\n\n${res.description}\n`;
      await fs.writeFile(mdPath, md, 'utf8');
      // Optional: assert file exists
      const stat = await fs.stat(mdPath);
      expect(stat.isFile()).toBe(true);
    } catch (e) {
      console.warn('Could not save youtube-metadata.md:', e?.message || e);
    }

    // restore
    if (prev) process.env.OPENAI_API_KEY = prev;
  }, 15_000);
});

//npm test -- lib/helper/yt-upload/generate-youtube-metadata.test.js
