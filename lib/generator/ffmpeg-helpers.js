import { spawn } from 'node:child_process';
import { existsSync, promises as fs } from 'node:fs';
import path from 'node:path';
import { createLogger } from './logger.js';

const logger = createLogger('ffmpeg', { envKeys: ['FFMPEG_DEBUG', 'GENERATOR_DEBUG'] });
const MEDIA_BINARY_CANDIDATES = {
  ffmpeg: ['/usr/local/bin/ffmpeg', '/opt/homebrew/bin/ffmpeg', 'ffmpeg'],
  ffprobe: ['/usr/local/bin/ffprobe', '/opt/homebrew/bin/ffprobe', 'ffprobe'],
};

const parseBooleanEnv = (value, fallback = false) => {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
};

const resolveMediaBinary = (cmd) => {
  const candidates = Array.isArray(MEDIA_BINARY_CANDIDATES[cmd]) ? MEDIA_BINARY_CANDIDATES[cmd] : [cmd];
  for (const candidate of candidates) {
    if (!candidate.includes('/')) {
      return candidate;
    }
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return cmd;
};

// small promise wrapper
function sh(cmd, args, opts={}) {
  return new Promise((resolve, reject) => {
    const resolvedCmd = resolveMediaBinary(cmd);
    const debug = logger.isDebugEnabled();
    const stdio = opts.stdio ?? (debug ? 'inherit' : ['ignore', 'pipe', 'pipe']);
    const p = spawn(resolvedCmd, args, { ...opts, stdio });

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
      reject(new Error(`${resolvedCmd} exited ${code}${hint ? `: ${hint}` : ''}`));
    });
  });
}

async function shCapture(cmd, args, opts = {}) {
  const resolvedCmd = resolveMediaBinary(cmd);
  let stdout = '';
  let stderr = '';
  const p = spawn(resolvedCmd, args, { ...opts, stdio: ['ignore', 'pipe', 'pipe'] });

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
      reject(new Error(`${resolvedCmd} exited ${code}${stderr ? `: ${stderr.trim()}` : ''}`));
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

const buildScalePadFilters = (width, height) => (
  Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0
    ? [
        `scale=w=${Math.round(width)}:h=${Math.round(height)}:force_original_aspect_ratio=decrease`,
        `pad=${Math.round(width)}:${Math.round(height)}:(ow-iw)/2:(oh-ih)/2:color=black`,
      ]
    : []
);

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
  const targetWidth = Math.max(...streamKeys.map((value) => Number(String(value).split('|')[1]) || 0));
  const targetHeight = Math.max(...streamKeys.map((value) => Number(String(value).split('|')[2]) || 0));
  const ffmpegArgs = ['-y'];
  for (const inputPath of mp4Paths) {
    ffmpegArgs.push('-i', inputPath);
  }

  const filterParts = mp4Paths.map((_, index) => {
    const filters = [
      ...buildScalePadFilters(targetWidth, targetHeight),
      'fps=24',
      'setpts=PTS-STARTPTS',
      'format=yuv420p',
    ];
    return `[${index}:v]${filters.join(',')}[v${index}]`;
  });
  const concatInputs = mp4Paths.map((_, index) => `[v${index}]`).join('');
  filterParts.push(`${concatInputs}concat=n=${mp4Paths.length}:v=1:a=0[outv]`);

  ffmpegArgs.push(
    '-filter_complex', filterParts.join(';'),
    '-map', '[outv]',
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-pix_fmt', 'yuv420p',
    '-an',
    outMp4,
  );

  await sh('ffmpeg', ffmpegArgs);
  return outMp4;
}

// Trailer scenes often begin on the exact final frame of the previous WAN clip.
// That is useful for generation continuity, but a straight concat exposes it as
// a tiny freeze. This edit removes the held boundary frames and uses a brief
// fade-to-black as a deliberate semantic collision between incompatible scenes.
export async function concatTrailerWithCollisionCuts(mp4Paths, outMp4, {
  boundaryTrimSeconds = 0.12,
  transitionSeconds = 0.08,
} = {}) {
  if (mp4Paths.length < 2) {
    return mp4Paths[0];
  }

  const streams = await Promise.all(mp4Paths.map((inputPath) => probeVideoStream(inputPath)));
  const targetWidth = Math.max(...streams.map(({ width }) => width));
  const targetHeight = Math.max(...streams.map(({ height }) => height));
  const targetFps = Math.max(1, Math.round(Math.max(...streams.map(({ fps }) => fps || 24))));
  const safeTransitionSeconds = Math.max(0.04, Number(transitionSeconds) || 0.08);
  const safeBoundaryTrimSeconds = Math.max(0, Number(boundaryTrimSeconds) || 0.12);

  const visibleDurations = streams.map(({ duration }, index) => {
    const trimAtStart = index > 0 ? safeBoundaryTrimSeconds : 0;
    const trimAtEnd = index < streams.length - 1 ? safeBoundaryTrimSeconds : 0;
    return Math.max(safeTransitionSeconds * 2, duration - trimAtStart - trimAtEnd);
  });

  const filterParts = mp4Paths.map((_, index) => {
    const trimAtStart = index > 0 ? safeBoundaryTrimSeconds : 0;
    const trimAtEnd = index < mp4Paths.length - 1 ? safeBoundaryTrimSeconds : 0;
    const trimEnd = trimAtStart + visibleDurations[index];
    return `[${index}:v]${[
      `trim=start=${trimAtStart}:end=${trimEnd}`,
      'setpts=PTS-STARTPTS',
      ...buildScalePadFilters(targetWidth, targetHeight),
      `fps=${targetFps}`,
      'format=yuv420p',
    ].join(',')}[v${index}]`;
  });

  let previousLabel = '[v0]';
  let accumulatedDuration = visibleDurations[0];
  for (let index = 1; index < mp4Paths.length; index += 1) {
    const outputLabel = index === mp4Paths.length - 1 ? '[outv]' : `[cut${index}]`;
    const transitionOffset = Math.max(0, accumulatedDuration - safeTransitionSeconds);
    filterParts.push(
      `${previousLabel}[v${index}]xfade=transition=fadeblack:duration=${safeTransitionSeconds}:offset=${transitionOffset}${outputLabel}`
    );
    previousLabel = outputLabel;
    accumulatedDuration += visibleDurations[index] - safeTransitionSeconds;
  }

  await fs.mkdir(path.dirname(outMp4), { recursive: true });
  const args = ['-y'];
  for (const inputPath of mp4Paths) {
    args.push('-i', inputPath);
  }
  args.push(
    '-filter_complex', filterParts.join(';'),
    '-map', '[outv]',
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-pix_fmt', 'yuv420p',
    '-an',
    outMp4,
  );
  await sh('ffmpeg', args);
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

export async function createStillVideoClip(imagePath, outputPath, {
  durationSeconds = 4,
  width = 1184,
  height = 880,
  fps = 24,
} = {}) {
  const resolvedImagePath = path.resolve(imagePath);
  const resolvedOutputPath = path.resolve(outputPath);
  await fs.stat(resolvedImagePath);
  await fs.mkdir(path.dirname(resolvedOutputPath), { recursive: true });

  await sh('ffmpeg', [
    '-y',
    '-loop', '1',
    '-i', resolvedImagePath,
    '-vf', [
      ...buildScalePadFilters(width, height),
      `fps=${fps}`,
      `trim=duration=${durationSeconds}`,
      'setpts=PTS-STARTPTS',
    ].join(','),
    '-t', String(durationSeconds),
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-pix_fmt', 'yuv420p',
    '-an',
    resolvedOutputPath,
  ]);

  return resolvedOutputPath;
}

export async function normalizeVideoOutput(inputVideoPath, {
  targetDurationSeconds = null,
  targetFps = null,
  targetWidth = null,
  targetHeight = null,
} = {}) {
  const disableTailPad = parseBooleanEnv(process.env.FRESHWEB_DISABLE_TAIL_PAD, false);
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

  const stopDuration = !disableTailPad && hasTargetDuration && Number.isFinite(stream.duration) && stream.duration > 0
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

export async function forceVideoEndImage(inputVideoPath, endImagePath, {
  targetDurationSeconds = null,
  targetFps = null,
  targetWidth = null,
  targetHeight = null,
  holdDurationSeconds = 0.3,
} = {}) {
  if (!inputVideoPath || !endImagePath) {
    return inputVideoPath;
  }

  const resolvedEndImagePath = path.resolve(String(endImagePath));
  await fs.stat(resolvedEndImagePath);

  const stream = await probeVideoStream(inputVideoPath);
  const resolvedTargetDuration = Number(targetDurationSeconds) > 0
    ? Number(targetDurationSeconds)
    : stream.duration;
  const resolvedTargetFps = Number(targetFps) > 0
    ? Number(targetFps)
    : (stream.fps > 0 ? stream.fps : 24);
  const resolvedTargetWidth = Number(targetWidth) > 0
    ? Number(targetWidth)
    : (stream.width > 0 ? stream.width : 0);
  const resolvedTargetHeight = Number(targetHeight) > 0
    ? Number(targetHeight)
    : (stream.height > 0 ? stream.height : 0);

  if (!Number.isFinite(resolvedTargetDuration) || resolvedTargetDuration <= 0) {
    return inputVideoPath;
  }

  const minHold = 1 / resolvedTargetFps;
  const maxHold = Math.max(minHold, resolvedTargetDuration * 0.25);
  const requestedHold = Number(holdDurationSeconds);
  const resolvedHoldDuration = Math.max(
    minHold,
    Math.min(
      Number.isFinite(requestedHold) && requestedHold > 0 ? requestedHold : minHold,
      maxHold,
      resolvedTargetDuration
    )
  );
  const preservedMotionDuration = Math.max(0, resolvedTargetDuration - resolvedHoldDuration);
  const sharedFilters = [
    ...buildScalePadFilters(resolvedTargetWidth, resolvedTargetHeight),
    `fps=${resolvedTargetFps}`,
  ];
  const tempOutputPath = path.join(
    path.dirname(inputVideoPath),
    `${path.basename(inputVideoPath, path.extname(inputVideoPath))}-endframefix${path.extname(inputVideoPath) || '.mp4'}`
  );

  if (preservedMotionDuration <= 0.001) {
    await sh('ffmpeg', [
      '-y',
      '-loop', '1',
      '-i', resolvedEndImagePath,
      '-vf', [
        ...sharedFilters,
        `trim=duration=${resolvedTargetDuration.toFixed(3)}`,
        'setpts=PTS-STARTPTS',
      ].join(','),
      '-t', String(resolvedTargetDuration),
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-pix_fmt', 'yuv420p',
      '-an',
      tempOutputPath,
    ]);
    await fs.rename(tempOutputPath, inputVideoPath);
    return inputVideoPath;
  }

  const videoFilter = [
    ...sharedFilters,
    `trim=duration=${preservedMotionDuration.toFixed(3)}`,
    'setpts=PTS-STARTPTS',
  ].join(',');
  const imageFilter = [
    ...sharedFilters,
    `trim=duration=${resolvedHoldDuration.toFixed(3)}`,
    'setpts=PTS-STARTPTS',
  ].join(',');

  await sh('ffmpeg', [
    '-y',
    '-i', inputVideoPath,
    '-loop', '1',
    '-i', resolvedEndImagePath,
    '-filter_complex',
    `[0:v]${videoFilter}[v0];[1:v]${imageFilter}[v1];[v0][v1]concat=n=2:v=1:a=0[outv]`,
    '-map', '[outv]',
    '-t', String(resolvedTargetDuration),
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-pix_fmt', 'yuv420p',
    '-an',
    tempOutputPath,
  ]);

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
