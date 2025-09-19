import path from 'path';
import { checkAndLogDuration, concatVideos, uploadToYouTube } from './concat-and-upload.js';

/**
 * Gate by total duration, then optionally concatenate and upload to YouTube.
 *
 * Params:
 * - imageDir: directory containing parts and where outputs are written
 * - options: may include { maxDuration, uploadToYT: { title, description, privacyStatus|privacy, tags } }
 * - allDats: optional passthrough context (not used here but accepted for future needs)
 *
 * Returns an object with details about the action taken.
 */
export async function gateConcatAndUpload({ imageDir, options = {}, allDats } = {}) {
  if (!imageDir) throw new Error('gateConcatAndUpload: imageDir is required');

  const localMax = Number(options?.maxDuration ?? 0);
  const exceeds = await checkAndLogDuration({ imageDir, options: { ...options, maxDuration: localMax || options?.uploadToYT?.maxDuration || options?.video?.maxDuration } });

  if (!exceeds) {
    return { exceeded: false, concatenated: false };
  }

  const outPath = await concatVideos({
    videoDir: imageDir,
    output: path.join(imageDir, `joined-${Date.now()}.mp4`)
  });
  console.log('outPath:', outPath);

  let upload = null;
  let uploadError = null;
  if (options.uploadToYT) {
    const cfg = options.uploadToYT;
    try {
      upload = await uploadToYouTube({
        filePath: outPath,
        title: cfg.title || `Video upload ${Date.now()}`,
        description: cfg.description || 'Uploaded with DailyDoase',
        // Map privacyStatus -> privacy expected by uploadToYouTube
        privacy: cfg.privacyStatus || cfg.privacy || 'unlisted'
        // tags are not currently supported by the helper; ignored if provided
      });
      console.log('YouTube upload result:', upload);
    } catch (e) {
      uploadError = e;
      console.warn('YouTube upload failed:', e?.message || e);
    }
  }

  if (!upload) {
    console.warn('Generator: total duration exceeds maxDuration; concatenated output prepared.');
  }

  return { exceeded: true, concatenated: true, outPath, upload, uploadError };
}

export default gateConcatAndUpload;

