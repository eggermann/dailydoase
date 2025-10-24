
import path from 'path';
import { fileURLToPath } from 'url';
import { uploadToYouTubeWithGeneratedMetadata } from './gate-and-upload.js';


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
///Users/eggermann/Projekte/dailydoase/lib/generator/adapter/tests/GENERATIONS/201-start-end-frame-mirelo/merged/joined-test-1758569348012.mp4
//Users/eggermann/Projekte/dailydoase/lib/generator/adapter/tests/GENERATIONS/201-start-end-frame-mirelo/merged/joined-test-1758569348012.mp4
//Users/eggermann/Projekte/dailydoase/lib/generator/adapter/tests/GENERATIONS/224-start-end-frame-mirelo/merged/joined-test-1758666749336.mp4
//Users/eggermann/Projekte/dailydoase/lib/generator/adapter/tests/GENERATIONS/232-start-end-frame-mirelo/merged/joined-test-1758749625615.mp4

/*
const imageDir = path.resolve(path.join(__dirname, '../../generator/adapter/tests/GENERATIONS/232-start-end-frame-mirelo/merged/'));
const outPath = path.join(imageDir, 'joined-test-1758749625615.mp4');
*/
///Users/eggermann/Projekte/dailydoase/tests/GENERATIONS/251-start-end-frame-mirelo/merged/joined-test-1760985860161.mp4
/*const imageDir ='/Users/eggermann/Projekte/dailydoase/tests/GENERATIONS/251-start-end-frame-mirelo/merged/';
const outPath = path.join(imageDir, 'joined-test-1760985860161.mp4');
const imageDir ='/Users/eggermann/Desktop/speedProjects/image-movie-maker/movs/';
const outPath = path.join(imageDir,'from-net-output.mp4')// 'output-48_00_00-54_00_00.mp4')

*/
const imageDir ='/Users/eggermann/Projekte/dailydoase/lib/generator/adapter/tests/GENERATIONS/287-start-end-frame-mirelo/merged';
const outPath = path.join(imageDir,'joined-test-1761333335022.mp4')// 'output-48_00_00-54_00_00.mp4')



  const res = await uploadToYouTubeWithGeneratedMetadata({
    outPath,
    imageDir,
    options: { uploadToYT: { privacyStatus: 'public' } },
  });