import fs from 'fs-extra';
import path from 'path';

import { muxVideoAndAudio } from '../../utils.js';
import { saveJSON } from '../../save-utils.js';
import { gateConcatAndUpload } from '../../../helper/yt-upload/gate-and-upload.js';
import { createLogger } from '../../logger.js';
import { generateRunwareMireloFallback } from '../../audio/runware/mirelo-video-sound.js';

const logger = createLogger('shorty-book:mirelo', { envKeys: ['MIRELO_DEBUG'] });
const TERMINAL_RED_BOLD = '\u001b[1;31m';
const TERMINAL_COLOR_RESET = '\u001b[0m';

export const formatMireloFailureWarning = (reason) => {
  const resolvedReason = String(reason || 'unknown Mirelo failure').trim();
  return `${TERMINAL_RED_BOLD}MIRELO MUSIC / SOUND FX FAILED: ${resolvedReason}${TERMINAL_COLOR_RESET}`;
};

const reportMireloFailure = (reason) => {
  logger.error(formatMireloFailureWarning(reason));
};

const returnRunwareFallbackOrSilentVideo = async ({
  failureReason,
  fallbackConfig = {},
  runwareFallbackGenerator,
  videoSource,
  prompt,
  imageDir,
  fileName,
}) => {
  reportMireloFailure(failureReason);

  if (fallbackConfig.enabled !== true) {
    logger.warn('Runware Mirelo fallback is disabled; returning the original silent video.');
    return videoSource;
  }

  logger.warn('Trying Mirelo SFX through Runware fallback.');
  try {
    const fallbackResult = await runwareFallbackGenerator({
      videoInput: videoSource,
      prompt,
      outputDir: imageDir,
      fileName,
      model: fallbackConfig.model,
      seed: fallbackConfig.seed,
      steps: fallbackConfig.steps,
    });
    logger.info(
      `Runware Mirelo fallback succeeded${fallbackResult?.cost ? `; cost $${fallbackResult.cost}` : ''}.`
    );
    return fallbackResult.file;
  } catch (fallbackError) {
    reportMireloFailure(`Runware fallback also failed: ${fallbackError?.message || fallbackError}`);
    logger.warn('Returning the original silent video.');
    return videoSource;
  }
};

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
  skipGateUpload = false,
  runwareFallbackGenerator = generateRunwareMireloFallback,
}) => {
  const videoSource = videoInput || videoData.file;
  const mireloInput = videoInput || videoData?.json?.metadata?.url || videoSource;
  options.mireloAI = options.mireloAI || {};
  options.mireloAI.prompt = mireloPrompt || startFrame.json.metadata.prompt;

  if (typeof options.mireloAI.duration === 'function') {
    options.mireloAI.duration = await options.mireloAI.duration(videoSource, options);
  }

  let dataFromMirelo;
  try {
    dataFromMirelo = await mireloAI.prompt(mireloInput, {
      ...options.mireloAI,
      audioOnly: true,
    });
  } catch (error) {
    const errorPath = path.join(imageDir, `${fileName}-mirelo-video-sound.error.json`);
    await saveJSON(errorPath, {
      error: String(error?.message || error),
      stage: 'mirelo-prompt',
      videoSource,
      mireloInput,
      mireloPrompt: options.mireloAI.prompt || '',
      extraMetadata,
    });
    return returnRunwareFallbackOrSilentVideo({
      failureReason: error?.message || error,
      fallbackConfig: options.mireloAI.runwareFallback,
      runwareFallbackGenerator,
      videoSource,
      prompt: options.mireloAI.prompt,
      imageDir,
      fileName,
    });
  }
  if (!dataFromMirelo) {
    return returnRunwareFallbackOrSilentVideo({
      failureReason: 'Mirelo returned no music or sound-effects result.',
      fallbackConfig: options.mireloAI.runwareFallback,
      runwareFallbackGenerator,
      videoSource,
      prompt: options.mireloAI.prompt,
      imageDir,
      fileName,
    });
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

      if (!skipGateUpload) {
        await gateConcatAndUpload({ imageDir, options: options.uploadToYT, allDats })
          .then((res) => {
            logger.debug('gateConcatAndUpload result:', res);
          });
      }
    } catch (e) {
      finalVideoPath = await returnRunwareFallbackOrSilentVideo({
        failureReason: `Generated audio could not be joined with the trailer: ${e?.message || e}`,
        fallbackConfig: options.mireloAI.runwareFallback,
        runwareFallbackGenerator,
        videoSource,
        prompt: options.mireloAI.prompt,
        imageDir,
        fileName,
      });
    }
  } else {
    // No usable audio (likely an error JSON or fallback video file)
    finalVideoPath = await returnRunwareFallbackOrSilentVideo({
      failureReason: 'Mirelo response contained no usable music or sound-effects file.',
      fallbackConfig: options.mireloAI.runwareFallback,
      runwareFallbackGenerator,
      videoSource,
      prompt: options.mireloAI.prompt,
      imageDir,
      fileName,
    });
  }

  return finalVideoPath;
};
