import fs from 'fs-extra';
import path from 'path';

import { muxVideoAndAudio } from '../../utils.js';
import { saveJSON } from '../../save-utils.js';
import { gateConcatAndUpload } from '../../../helper/yt-upload/gate-and-upload.js';

export const addMireloAudioAndUpload = async ({
  mireloAI,
  imageDir,
  fileName,
  startFrame,
  videoData,
  options,
}) => {
  const videoUrl = videoData.json.metadata.url;
  options.mireloAI = options.mireloAI || {};
  options.mireloAI.prompt = startFrame.json.metadata.prompt;

  if (typeof options.mireloAI.duration === 'function') {
    options.mireloAI.duration = options.mireloAI.duration();
  }

  const dataFromMirelo = (await mireloAI.prompt(videoUrl, options.mireloAI));
  if (!dataFromMirelo) {
    throw new Error('Mirelo did not return an audio file (soundPath is empty).');
  }
  console.log('dataFromMirelo: ', dataFromMirelo);
  const savePath = path.join(imageDir, `${fileName}-mirelo-video-sound`);
  const audioPath = dataFromMirelo.file;
  const videoPath = videoData.file;

  // Determine if we actually received an audio asset (.wav/.mp3/etc.)
  console.log('audioPath:', audioPath);
  let finalVideoPath;

  if (audioPath) {
    try {
      const mergedOutDir = path.join(imageDir, '/merged');
      fs.ensureDirSync(mergedOutDir);

      const op = {
        outputName: `${fileName}-with-sound.mp4`,
      };

      const mergedFilePath = await muxVideoAndAudio(videoPath, audioPath, mergedOutDir, op);
      finalVideoPath = mergedFilePath;

      //  await fs.copy(mergedPath, finalVideoPath);
      console.log('GenImgVideo: muxed video and audio to', mergedFilePath);

      const allDats = {
        file: mergedFilePath,
        //  file: await downloadToFile(url, savePath),
        json: await saveJSON(savePath, {
          mergedFilePath,
          mireloResponse: dataFromMirelo,
          videoResponse: videoData,
          imageResponse: startFrame,
        }),
      };

      await gateConcatAndUpload({ imageDir, options: options.uploadToYT, allDats })
        .then((res) => {
          console.log('gateConcatAndUpload result:', res);
        });
    } catch (e) {
      console.warn('GenImgVideo: mux failed, returning original video. Reason:', e?.message || e);
      finalVideoPath = videoUrl;
    }
  } else {
    // No usable audio (likely an error JSON or fallback video file)
    console.warn('GenImgVideo: no audio candidate resolved (possibly Mirelo error JSON). Returning original video only.');
    finalVideoPath = videoUrl;
  }

  return finalVideoPath;
};
