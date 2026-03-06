import fs from 'fs-extra';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);
const DEFAULT_COMMAND_TIMEOUT_MS = 10_000;

export const isCameraStartImageEnabled = (value = process.env.CAMERA_START_IMAGE) => (
  typeof value === 'string' && ['1', 'true', 'yes', 'on'].includes(value.toLowerCase())
);

const normalizeNodeWebcamModule = (mod) => {
  if (!mod) return null;
  if (typeof mod.create === 'function') return mod;
  if (mod.default && typeof mod.default.create === 'function') return mod.default;
  return null;
};

const loadNodeWebcam = async () => {
  try {
    return normalizeNodeWebcamModule(await import('node-webcam'));
  } catch (_) {
    return null;
  }
};

const runCommand = async (command, args, options = {}) => execFileAsync(
  command,
  args,
  {
    timeout: options.timeoutMs ?? DEFAULT_COMMAND_TIMEOUT_MS,
    killSignal: 'SIGKILL',
  }
);

const hasCommand = async (command, args = ['-h']) => {
  try {
    await runCommand(command, args, { timeoutMs: 2_000 });
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return false;
    }
    return true;
  }
};

const captureWithNodeWebcam = async (savePath, options) => {
  const NodeWebcam = await loadNodeWebcam();
  if (!NodeWebcam) {
    throw new Error('node-webcam is not installed');
  }

  const parsedPath = path.parse(savePath);
  const targetWithoutExt = path.join(parsedPath.dir, parsedPath.name);
  const webcam = NodeWebcam.create({
    width: options.width ?? 1280,
    height: options.height ?? 720,
    quality: options.quality ?? 100,
    delay: options.delay ?? 0,
    saveShots: true,
    output: options.output ?? 'jpeg',
    device: options.device ?? false,
    callbackReturn: 'location',
    verbose: false,
  });

  return new Promise((resolve, reject) => {
    webcam.capture(targetWithoutExt, (err, location) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(location || savePath);
    });
  });
};

const captureWithImageSnap = async (savePath, options) => {
  const args = [];

  if (options.warmupSeconds != null) {
    args.push('-w', String(options.warmupSeconds));
  }
  if (options.device) {
    args.push('-d', String(options.device));
  }
  args.push(savePath);

  await runCommand('imagesnap', args, options);
  return savePath;
};

const captureWithFfmpeg = async (savePath, options) => {
  const hasFfmpeg = await hasCommand('ffmpeg', ['-version']);
  if (!hasFfmpeg) {
    throw new Error('ffmpeg is not installed');
  }

  const inputDevice = options.device && options.device !== false
    ? String(options.device)
    : '0';
  const args = [
    '-y',
    '-f',
    'avfoundation',
    '-framerate',
    String(options.frameRate ?? 30),
    '-i',
    `${inputDevice}:none`,
    '-frames:v',
    '1',
    savePath,
  ];

  await runCommand('ffmpeg', args, options);
  return savePath;
};

export const getIamge = async (options = {}) => {
  const outputDir = path.resolve(options.outputDir ?? path.join(process.cwd(), 'lib/generator/test.datas/camera'));
  const ext = options.extension ?? 'jpg';
  const fileName = options.fileName ?? `${Date.now()}-camera.${ext}`;
  const savePath = path.join(outputDir, fileName);
  const fallbackImagePath = options.fallbackImagePath ? path.resolve(options.fallbackImagePath) : null;
  const errors = [];
  options.timeoutMs = options.timeoutMs ?? DEFAULT_COMMAND_TIMEOUT_MS;

  await fs.ensureDir(outputDir);

  try {
    const location = await captureWithNodeWebcam(savePath, options);
    return path.resolve(location);
  } catch (error) {
    errors.push(`node-webcam: ${error.message}`);
  }

  try {
    return await captureWithFfmpeg(savePath, options);
  } catch (error) {
    errors.push(`ffmpeg: ${error.message}`);
  }

  try {
    return await captureWithImageSnap(savePath, options);
  } catch (error) {
    errors.push(`imagesnap: ${error.message}`);
  }

  if (fallbackImagePath) {
    if (await fs.pathExists(fallbackImagePath)) {
      console.warn(`[camera] Falling back to static image: ${fallbackImagePath}`);
      console.warn(`[camera] Capture errors: ${errors.join(' | ')}`);
      return fallbackImagePath;
    }
    errors.push(`fallback image missing: ${fallbackImagePath}`);
  }

  throw new Error(`Unable to capture camera image. ${errors.join(' | ')}`);
};

export default getIamge;
