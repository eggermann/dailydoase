
import path from 'path';
import { fileURLToPath } from 'url';
import { uploadToYouTubeWithGeneratedMetadata } from './gate-and-upload.js';


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const imageDir = path.resolve(path.join(__dirname, '../../generator/adapter/tests/GENERATIONS/185-start-end-frame-mirelo/merged'));
const outPath = path.join(imageDir, 'joined-test-1758286561698.mp4');

  const res = await uploadToYouTubeWithGeneratedMetadata({
    outPath,
    imageDir,
    options: { uploadToYT: { privacyStatus: 'public' } },


  });