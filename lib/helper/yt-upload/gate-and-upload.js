import path from 'path';
import { checkAndLogDuration, concatVideos, uploadToYouTube } from './concat-and-upload.js';
import { generateYouTubeMetadataFromDir } from './generate-youtube-metadata.js';

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


  const exceeds = await checkAndLogDuration({ imageDir, options });

  if (!exceeds) {
    // light-colored (dim gray) console message
    console.log('\x1b[2m\x1b[37m%s\x1b[0m', 'No action needed: total duration within maxDuration threshold.');
    return { exceeded: false, concatenated: false };
  }

  const outPath = await concatVideos({
    videoDir: imageDir,
    output: path.join(imageDir, `joined-${Date.now()}.mp4`)
  });

  console.log('outPath:', outPath);

  let upload = null;
  let uploadError = null;

  if (true || options.uploadToYT) {
    const res = await uploadToYouTubeWithGeneratedMetadata({
      outPath,
      imageDir,
      options,
    });
    upload = res.upload;
    uploadError = res.uploadError;
  }

  if (!upload) {
    console.warn('Generator: total duration exceeds maxDuration; concatenated output prepared.');
  }

  return { exceeded: true, concatenated: true, outPath, upload, uploadError };
}

/**
 * Extracted upload block for testing.
 * Attempts to generate YouTube metadata from a directory and uploads a file.
 * Dependencies are injectable for testing.
 */
export async function uploadToYouTubeWithGeneratedMetadata({
  outPath,
  imageDir,
  options = {}
} = {}) {
  if (!outPath) throw new Error('uploadToYouTubeWithGeneratedMetadata: outPath is required');
  if (!imageDir) throw new Error('uploadToYouTubeWithGeneratedMetadata: imageDir is required');

  let title;
  let description;
  try {
    ({ title, description } = await generateYouTubeMetadataFromDir({
      dirPath: imageDir,
      projectName: 'DailyDoase',
    }));
  } catch (err) {
console.log('Metadata generation failed, falling back to defaults:', err?.message || err);
  }

  const cfg = options.uploadToYT || {};
  let upload = null;
  let uploadError = null;
  try {
    upload = await uploadToYouTube({
      filePath: outPath,
      title: title || `Video upload ${Date.now()}`,
      description: description || 'Uploaded with DailyDoase',
      // Map privacyStatus -> privacy expected by uploadToYouTube
      privacy: cfg.privacyStatus || cfg.privacy || 'unlisted',
      // Optional: allow callers to control subscriber notifications
      notify: cfg.notify,
    });
  } catch (e) {
    uploadError = e;
  }

  return { upload, uploadError, title, description };
}

export default gateConcatAndUpload;
