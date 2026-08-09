import fs from 'fs-extra';
import path from 'path';
import { createHash } from 'node:crypto';

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

const AUDIO_EXTENSIONS = new Set(['.aac', '.flac', '.m4a', '.mp3', '.ogg', '.opus', '.wav']);

const isAudioAsset = (filePath) => AUDIO_EXTENSIONS.has(path.extname(String(filePath || '')).toLowerCase());

const SOUND_MOTIFS = [
  ['department store', 'fluorescent buzz, checkout conveyor ticks, distant carts and retail-room reverb'],
  ['landscape', 'wide air movement, distant wind and spacious changing reverberation'],
  ['art exhibition', 'hushed gallery footsteps, plinth creaks, distant room tone and small object handling'],
  ['animals', 'brief organic movement, claws or paws on hard surfaces, breath and alert rustling'],
  ['vernissage', 'soft crowd murmur, glasses clinking, rope-stanchion movement and exhibition-room resonance'],
  ['fast food', 'fryer hiss, paper-wrapper rustle, tray rattle, soda fizz and kitchen ventilation'],
  ['horror', 'uneasy electrical drones, strained metal, breathy air movement and sudden restrained impacts'],
];

const normalizeAudioTerm = (value) => String(value || '').trim().toLowerCase();

export const buildSemanticMireloPrompt = ({
  semanticWords = [],
  scenePlan = [],
  fallbackPrompt = '',
} = {}) => {
  const words = [...new Set(semanticWords
    .map((entry) => Array.isArray(entry) ? entry[0] : entry)
    .map((entry) => String(entry || '').trim())
    .filter(Boolean))];
  const normalizedWords = words.map(normalizeAudioTerm);
  const motifs = SOUND_MOTIFS
    .filter(([term]) => normalizedWords.includes(term))
    .map(([, motif]) => motif);
  const sceneTitles = scenePlan
    .map((scene) => String(scene?.title || '').trim())
    .filter(Boolean)
    .slice(0, 8);

  if (words.length === 0) {
    return String(fallbackPrompt || '').trim();
  }

  return [
    'Create high-fidelity synchronized sound effects for this exact trailer. No stock music loop, no narration, no foreground dialogue.',
    `Semantic stream: ${words.join(', ')}.`,
    motifs.length > 0
      ? `Use this changing sound palette: ${motifs.join('; ')}.`
      : 'Let the semantic stream determine concrete, changing environmental Foley and spatial ambience.',
    sceneTitles.length > 0
      ? `Follow the scene progression: ${sceneTitles.join(' → ')}.`
      : '',
    'Let each scene introduce or transform an audible element, preserve spatial continuity across cuts, and end with a sparse exhibition-room release.',
  ].filter(Boolean).join(' ');
};

export const deriveMireloSeed = ({ baseSeed = 0, fileName = '', prompt = '' } = {}) => {
  const digest = createHash('sha256')
    .update(`${Number(baseSeed) || 0}:${fileName}:${prompt}`)
    .digest();
  return Math.max(1, digest.readUInt32BE(0) % 2_147_483_647);
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
    const audioSeed = deriveMireloSeed({
      baseSeed: fallbackConfig.seed,
      fileName,
      prompt,
    });
    const fallbackResult = await runwareFallbackGenerator({
      videoInput: videoSource,
      prompt,
      outputDir: imageDir,
      fileName,
      model: fallbackConfig.model,
      seed: audioSeed,
      steps: fallbackConfig.steps,
    });
    logger.info(
      `Runware Mirelo fallback succeeded${fallbackResult?.cost ? `; cost $${fallbackResult.cost}` : ''}.`
    );
    const fallbackFile = fallbackResult?.file;
    if (!isAudioAsset(fallbackFile)) {
      return fallbackFile || videoSource;
    }

    const mergedOutDir = path.join(imageDir, 'merged');
    const outputName = `${fileName}-with-sound.mp4`;
    const mergedFilePath = await muxVideoAndAudio(videoSource, fallbackFile, mergedOutDir, { outputName });
    logger.info(`Runware Mirelo fallback muxed audio to ${mergedFilePath}.`);
    return mergedFilePath;
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
