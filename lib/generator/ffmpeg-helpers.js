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
  let stdout = '';
  const p = spawn('ffprobe', [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1',
    inputVideoPath,
  ], { stdio: ['ignore', 'pipe', 'pipe'] });

  await new Promise((resolve, reject) => {
    let stderr = '';
    p.stdout.on('data', (chunk) => {
      stdout += String(chunk);
    });
    p.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });
    p.on('error', reject);
    p.on('exit', (code) => {
      if (code === 0) return resolve();
      reject(new Error(`ffprobe exited ${code}${stderr ? `: ${stderr.trim()}` : ''}`));
    });
  });

  const duration = Number.parseFloat(stdout.trim());
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error(`Invalid ffprobe duration for ${inputVideoPath}: ${stdout.trim()}`);
  }

  return duration;
}
