import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';

// small promise wrapper
function sh(cmd, args, opts={}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: 'inherit', ...opts });
    p.on('exit', code => code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`)));
  });
}

// 1) extract last frame of a video to PNG
export async function extractLastFrame(inputMp4, outPng) {
  // -sseof -3 seeks from end; -update 1 overwrites the same file -> only final frame survives
  await sh('ffmpeg', ['-y', '-sseof', '-3', '-i', inputMp4, '-vsync', '0', '-q:v', '2', '-update', '1', outPng]);
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