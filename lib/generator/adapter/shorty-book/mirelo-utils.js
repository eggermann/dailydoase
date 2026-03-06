import fs from 'fs-extra';
import path from 'path';

import { muxVideoAndAudio } from '../../utils.js';
import { saveJSON } from '../../save-utils.js';
import { gateConcatAndUpload } from '../../../helper/yt-upload/gate-and-upload.js';
import { createLogger } from '../../logger.js';

const logger = createLogger('shorty-book:mirelo', { envKeys: ['MIRELO_DEBUG'] });

export const addMireloAudioAndUpload = async ({
  mireloAI,
  imageDir,
  fileName,
  startFrame,
  videoData,
  videoInput,
  mireloPrompt,
  extraMetadata,
  options,
}) => {
  const videoSource = videoInput || videoData.file;
  const videoUrl = videoData?.json?.metadata?.url || videoSource;
  options.mireloAI = options.mireloAI || {};
  options.mireloAI.prompt = mireloPrompt || startFrame.json.metadata.prompt;

  if (typeof options.mireloAI.duration === 'function') {
    options.mireloAI.duration = await options.mireloAI.duration(videoSource, options);
  }

  const dataFromMirelo = (await mireloAI.prompt(videoUrl, options.mireloAI));
  if (!dataFromMirelo) {
    throw new Error('Mirelo did not return an audio file (soundPath is empty).');
  }
  logger.payload('mirelo response', dataFromMirelo);
  const savePath = path.join(imageDir, `${fileName}-mirelo-video-sound`);
  const audioPath = dataFromMirelo.file;
  const videoPath = videoSource;

  // Determine if we actually received an audio asset (.wav/.mp3/etc.)
  logger.debug('resolved audioPath:', audioPath);
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
      logger.debug('muxed video and audio to', mergedFilePath);

      const allDats = {
        file: mergedFilePath,
        //  file: await downloadToFile(url, savePath),
        json: await saveJSON(savePath, {
          mergedFilePath,
          mireloResponse: dataFromMirelo,
          videoResponse: videoData,
          imageResponse: startFrame,
          extraMetadata,
        }),
      };

      await gateConcatAndUpload({ imageDir, options: options.uploadToYT, allDats })
        .then((res) => {
          logger.debug('gateConcatAndUpload result:', res);
        });
    } catch (e) {
      logger.warn('GenImgVideo: mux failed, returning original video. Reason:', e?.message || e);
      finalVideoPath = videoUrl;
    }
  } else {
    // No usable audio (likely an error JSON or fallback video file)
    logger.warn('GenImgVideo: no audio candidate resolved (possibly Mirelo error JSON). Returning original video only.');
    finalVideoPath = videoUrl;
  }

  return finalVideoPath;
};
