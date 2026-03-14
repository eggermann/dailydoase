import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createLogger } from './logger.js';

const logger = createLogger('ffmpeg', { envKeys: ['FFMPEG_DEBUG', 'GENERATOR_DEBUG'] });

// small promise wrapper
function sh(cmd, args, opts={}) {
  return new Promise((resolve, reject) => {
    const debug = logger.isDebugEnabled();
    const stdio = opts.stdio ?? (debug ? 'inherit' : ['ignore', 'pipe', 'pipe']);
    const p = spawn(cmd, args, { ...opts, stdio });

    let stderr = '';
    let stdout = '';
    if (!debug && p.stderr) {
      p.stderr.on('data', (chunk) => {
        stderr += String(chunk);
        if (stderr.length > 4000) stderr = stderr.slice(-4000);
      });
    }
    if (!debug && p.stdout) {
      p.stdout.on('data', (chunk) => {
        stdout += String(chunk);
        if (stdout.length > 2000) stdout = stdout.slice(-2000);
      });
    }

    p.on('error', reject);
    p.on('exit', (code) => {
      if (code === 0) return resolve();

      const hint = [stderr.trim(), stdout.trim()].filter(Boolean).join('\n').slice(-2000);
      reject(new Error(`${cmd} exited ${code}${hint ? `: ${hint}` : ''}`));
    });
  });
}

async function shCapture(cmd, args, opts = {}) {
  let stdout = '';
  let stderr = '';
  const p = spawn(cmd, args, { ...opts, stdio: ['ignore', 'pipe', 'pipe'] });

  await new Promise((resolve, reject) => {
    p.stdout.on('data', (chunk) => {
      stdout += String(chunk);
    });
    p.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });
    p.on('error', reject);
    p.on('exit', (code) => {
      if (code === 0) return resolve();
      reject(new Error(`${cmd} exited ${code}${stderr ? `: ${stderr.trim()}` : ''}`));
    });
  });

  return { stdout, stderr };
}

const parseFrameRate = (value) => {
  const text = String(value || '').trim();
  if (!text) return 0;
  if (text.includes('/')) {
    const [num, den] = text.split('/').map((part) => Number(part));
    if (Number.isFinite(num) && Number.isFinite(den) && den !== 0) {
      return num / den;
    }
  }
  const numeric = Number(text);
  return Number.isFinite(numeric) ? numeric : 0;
};

// 1) extract last frame of a video to PNG
export async function extractLastFrame(inputMp4, outPng) {
  // Seek close to the end and export one frame.
  await sh('ffmpeg', [
    '-hide_banner',
    '-loglevel', 'error',
    '-y',
    '-sseof', '-0.25',
    '-i', inputMp4,
    '-frames:v', '1',
    outPng,
  ]);
  return outPng;
}

// 2) concatenate mp4 clips losslessly (same codec/params) using concat demuxer
export async function concatMp4Lossless(mp4Paths, outMp4, workDir) {
  const listFile = path.join(workDir, 'concat.txt');
  const body = mp4Paths.map(p => `file '${p.replace(/'/g, "'\\''")}'`).join('\n');
  await fs.writeFile(listFile, body, 'utf8');
  const streamKeys = await Promise.all(mp4Paths.map(async (inputPath) => {
    const { stdout } = await shCapture('ffprobe', [
      '-v', 'error',
      '-select_streams', 'v:0',
      '-show_entries', 'stream=codec_name,width,height,r_frame_rate,pix_fmt',
      '-of', 'json',
      inputPath,
    ]);
    const json = JSON.parse(stdout || '{}');
    const stream = json?.streams?.[0] || {};
    return [
      stream.codec_name || '',
      stream.width || '',
      stream.height || '',
      stream.r_frame_rate || '',
      stream.pix_fmt || '',
    ].join('|');
  }));

  const allStreamsMatch = streamKeys.every((value) => value === streamKeys[0]);
  if (allStreamsMatch) {
    await sh('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', outMp4]);
    return outMp4;
  }

  logger.warn('concatMp4Lossless detected mismatched stream parameters; falling back to re-encode concat.');
  await sh('ffmpeg', [
    '-y',
    '-f', 'concat',
    '-safe', '0',
    '-i', listFile,
    '-vf', 'fps=24',
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-pix_fmt', 'yuv420p',
    '-an',
    outMp4,
  ]);
  return outMp4;
}

export async function probeVideoDurationSeconds(inputVideoPath) {
  const { duration } = await probeVideoStream(inputVideoPath);
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error(`Invalid ffprobe duration for ${inputVideoPath}`);
  }

  return duration;
}

export async function probeVideoStream(inputVideoPath) {
  const { stdout } = await shCapture('ffprobe', [
    '-v', 'error',
    '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height,avg_frame_rate,r_frame_rate,nb_frames:format=duration',
    '-of', 'json',
    inputVideoPath,
  ]);

  const json = JSON.parse(stdout || '{}');
  const stream = json?.streams?.[0] || {};
  const duration = Number.parseFloat(json?.format?.duration || stream?.duration || '');
  const width = Number(stream?.width) || 0;
  const height = Number(stream?.height) || 0;
  const fps = parseFrameRate(stream?.avg_frame_rate || stream?.r_frame_rate);
  const nbFrames = Number(stream?.nb_frames) || 0;

  return {
    width,
    height,
    duration: Number.isFinite(duration) ? duration : 0,
    fps,
    nbFrames,
  };
}

export async function normalizeVideoOutput(inputVideoPath, {
  targetDurationSeconds = null,
  targetFps = null,
  targetWidth = null,
  targetHeight = null,
} = {}) {
  const resolvedTargetDuration = Number(targetDurationSeconds);
  const resolvedTargetFps = Number(targetFps) > 0 ? Number(targetFps) : 0;
  const resolvedTargetWidth = Number(targetWidth);
  const resolvedTargetHeight = Number(targetHeight);
  const hasTargetDuration = Number.isFinite(resolvedTargetDuration) && resolvedTargetDuration > 0;
  const hasTargetGeometry = Number.isFinite(resolvedTargetWidth)
    && resolvedTargetWidth > 0
    && Number.isFinite(resolvedTargetHeight)
    && resolvedTargetHeight > 0;

  if (!hasTargetDuration && !hasTargetGeometry) {
    return inputVideoPath;
  }

  const stream = await probeVideoStream(inputVideoPath);
  const needsDurationFix = hasTargetDuration
    && (!Number.isFinite(stream.duration) || stream.duration <= 0 || Math.abs(stream.duration - resolvedTargetDuration) >= 0.03);
  const needsGeometryFix = hasTargetGeometry
    && (stream.width !== resolvedTargetWidth || stream.height !== resolvedTargetHeight);
  const needsFpsFix = resolvedTargetFps > 0
    && (!Number.isFinite(stream.fps) || Math.abs(stream.fps - resolvedTargetFps) >= 0.05);

  if (!needsDurationFix && !needsGeometryFix && !needsFpsFix) {
    return inputVideoPath;
  }

  const stopDuration = hasTargetDuration && Number.isFinite(stream.duration) && stream.duration > 0
    ? Math.max(0, resolvedTargetDuration - stream.duration)
    : 0;
  const tempOutputPath = path.join(
    path.dirname(inputVideoPath),
    `${path.basename(inputVideoPath, path.extname(inputVideoPath))}-durationfix${path.extname(inputVideoPath) || '.mp4'}`
  );
  const videoFilters = [];

  if (hasTargetGeometry) {
    videoFilters.push(
      `scale=w=${Math.round(resolvedTargetWidth)}:h=${Math.round(resolvedTargetHeight)}:force_original_aspect_ratio=decrease`,
      `pad=${Math.round(resolvedTargetWidth)}:${Math.round(resolvedTargetHeight)}:(ow-iw)/2:(oh-ih)/2:color=black`
    );
  }

  if (resolvedTargetFps > 0 && (needsFpsFix || needsDurationFix)) {
    videoFilters.push(`fps=${resolvedTargetFps}`);
  }

  if (stopDuration > 0) {
    videoFilters.push(`tpad=stop_mode=clone:stop_duration=${stopDuration.toFixed(3)}`);
  }

  const ffmpegArgs = [
    '-y',
    '-i', inputVideoPath,
  ];

  if (videoFilters.length > 0) {
    ffmpegArgs.push('-vf', videoFilters.join(','));
  }

  if (hasTargetDuration) {
    ffmpegArgs.push('-t', String(resolvedTargetDuration));
  }

  ffmpegArgs.push(
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-pix_fmt', 'yuv420p',
    '-an',
    tempOutputPath,
  );

  await sh('ffmpeg', ffmpegArgs);

  await fs.rename(tempOutputPath, inputVideoPath);
  return inputVideoPath;
}

export async function normalizeVideoDurationSeconds(inputVideoPath, targetDurationSeconds, {
  targetFps = 24,
} = {}) {
  return normalizeVideoOutput(inputVideoPath, {
    targetDurationSeconds,
    targetFps,
  });
}
