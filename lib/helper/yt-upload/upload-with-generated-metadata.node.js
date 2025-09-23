
import path from 'path';
import { fileURLToPath } from 'url';
import { uploadToYouTubeWithGeneratedMetadata } from './gate-and-upload.js';


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
///Users/eggermann/Projekte/dailydoase/lib/generator/adapter/tests/GENERATIONS/201-start-end-frame-mirelo/merged/joined-test-1758569348012.mp4
//Users/eggermann/Projekte/dailydoase/lib/generator/adapter/tests/GENERATIONS/201-start-end-frame-mirelo/merged/joined-test-1758569348012.mp4
//Users/eggermann/Projekte/dailydoase/lib/generator/adapter/tests/GENERATIONS/224-start-end-frame-mirelo/merged/joined-test-1758666749336.mp4
const imageDir = path.resolve(path.join(__dirname, '../../generator/adapter/tests/GENERATIONS/224-start-end-frame-mirelo/merged/'));
const outPath = path.join(imageDir, 'joined-test-1758666749336.mp4');

  const res = await uploadToYouTubeWithGeneratedMetadata({
    outPath,
    imageDir,
    options: { uploadToYT: { privacyStatus: 'public' } },
  });