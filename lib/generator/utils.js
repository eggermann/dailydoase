import fs from 'fs-extra';
import path from 'path';
import sharp from 'sharp';
import { fileURLToPath } from 'url';

// Anchor outputs inside this module directory (lib/generator/wan22)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const joinOutPath = (subPath) => path.join(__dirname, subPath);

export const toSharp = (src) => {
  if (typeof src === 'string') return sharp(src);
  if (src instanceof sharp) return src;
  if (Buffer.isBuffer(src)) return sharp(src);
  throw new Error('Unsupported image stream type');
};

export const downloadToFile = async (url, destPath) => {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to download ${url}: ${res.status} ${res.statusText}`);
  }
  const arrayBuffer = await res.arrayBuffer();
  fs.ensureDirSync(path.dirname(destPath));
  await fs.writeFile(destPath, Buffer.from(arrayBuffer));
  return destPath;
};

export const saveJsonSidecar = async (targetPath, data) => {
  const jsonPath = `${targetPath}.json`;
  await fs.writeFile(jsonPath, JSON.stringify(data, null, 2));
  return jsonPath;
};

/**
 * Merge (mux) a video file with an audio file into an MP4 suitable for YouTube.
 * - Keeps original video stream (re-encodes to H.264 if necessary for compatibility).
 * - Encodes audio to AAC.
 * - Applies -shortest so mismatched durations don't cause long black frames.
 * - Adds faststart flag for progressive streaming.
 *
 * @param {string} videoPath
 * @param {string} audioPath
 * @param {string} outDir directory to place merged file
 * @param {object} [options]
 * @param {string} [options.outputName] desired output filename (defaults timestamp)
 * @returns {Promise<string>} merged mp4 path
 */
export const muxVideoAndAudio = async (videoPath, audioPath, outDir, options = {}) => {
  const ffmpeg = (await import('fluent-ffmpeg')).default;
  await fs.ensureDir(outDir);
  if (!(await fs.pathExists(videoPath))) throw new Error(`muxVideoAndAudio: video not found: ${videoPath}`);
  if (!(await fs.pathExists(audioPath))) throw new Error(`muxVideoAndAudio: audio not found: ${audioPath}`);
  const baseName = options.outputName || `${Date.now()}-merged.mp4`;
  const outPath = path.join(outDir, baseName);

  return await new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .addInput(audioPath)
      .videoCodec('libx264')
      .audioCodec('aac')
      .outputOptions([
        '-shortest',
        '-movflags', '+faststart',
        '-preset', options.preset || 'veryfast',
        '-crf', String(options.crf ?? 23),
        '-pix_fmt', 'yuv420p'
      ])
      .on('error', (err) => reject(err))
      .on('end', async () => {
        try {
          await saveJsonSidecar(outPath, {
            endpoint: '/video-audio-mux',
            source_video: path.basename(videoPath),
            source_audio: path.basename(audioPath),
            options: {
              crf: options.crf ?? 23,
              preset: options.preset || 'veryfast'
            }
          });
        } catch (_) {
          // ignore sidecar failure
        }
        resolve(outPath);
      })
      .save(outPath);
  });
};

// Infer output dimensions using the Space helper, with fallback defaults
export const inferDimsWithSpace = async (
  cli,
  tmpImagePath,
  h,
  w,
  defaultHeight,
  defaultWidth
) => {
  let height = h;
  let width = w;
  if (!height || !width) {
    try {
      const dimRes = await cli.predict('/handle_image_upload_for_dims_wan', {
        uploaded_pil_image: await fs.readFile(tmpImagePath),
        current_h_val: height ?? defaultHeight,
        current_w_val: width ?? defaultWidth,
      });
      if (Array.isArray(dimRes?.data) && dimRes.data.length >= 2) {
        height = Number(dimRes.data[0]) || (height ?? defaultHeight);
        width = Number(dimRes.data[1]) || (width ?? defaultWidth);
      } else {
        height = height ?? defaultHeight;
        width = width ?? defaultWidth;
      }
    } catch (_) {
      height = height ?? defaultHeight;
      width = width ?? defaultWidth;
    }
  }
  return { h: height, w: width };
};

// High-level helper: given a (possibly JSON sidecar path) output from
// the Mirelo audio generation, resolve to the actual audio file if
// we returned an "input fallback" or asset .wav path, otherwise null.
export const resolveAudioCandidate = async (mireloResultPath) => {
  if (!mireloResultPath) return null;
  const ext = path.extname(mireloResultPath).toLowerCase();
  if (ext === '.wav' || ext === '.mp3' || ext === '.aac') return mireloResultPath;
  // If it's a JSON sidecar, we may have an adjacent input/video fallback
  if (ext === '.json' && mireloResultPath.endsWith('.error.json.json')) {
    // conservative: no audio
    return null;
  }
  return null;
};
