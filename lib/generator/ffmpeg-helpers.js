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
  await sh('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', outMp4]);
  return outMp4;
}
