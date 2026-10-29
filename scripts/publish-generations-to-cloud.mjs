import { spawn } from 'node:child_process';
import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = path.resolve(process.env.GENERATIONS_PATH || path.join(repoRoot, 'GENERATIONS'));
const bucket = process.env.GENERATION_BUCKET;
const prefix = (process.env.GENERATION_PREFIX || '').replace(/^\/+|\/+$/g, '');
const endpoint = process.env.GENERATION_S3_ENDPOINT;
const maxStorageBytes = 100_000_000_000;

if (!bucket) {
  console.error('Set GENERATION_BUCKET to your S3 or R2 bucket name.');
  process.exit(1);
}

const endpointArgs = endpoint ? ['--endpoint-url', endpoint] : [];

const runAws = (args, captureOutput = false) => new Promise((resolve, reject) => {
  const child = spawn('aws', args, {
    stdio: captureOutput ? ['ignore', 'pipe', 'inherit'] : 'inherit',
  });
  let output = '';

  if (captureOutput) {
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      output += chunk;
    });
  }

  child.on('error', (error) => {
    if (error.code === 'ENOENT') {
      reject(new Error('AWS CLI not found. Install AWS CLI v2, then retry.'));
      return;
    }

    reject(new Error(`Could not start cloud sync: ${error.message}`));
  });

  child.on('exit', (code, signal) => {
    if (signal) {
      reject(new Error(`Cloud sync stopped by signal ${signal}.`));
      return;
    }

    if (code !== 0) {
      reject(new Error(`AWS CLI exited with code ${code ?? 1}.`));
      return;
    }

    resolve(output);
  });
});

const getLocalFiles = async (directory, relativePath = '') => {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryRelativePath = path.join(relativePath, entry.name);
    const entryPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...await getLocalFiles(entryPath, entryRelativePath));
    } else if (entry.isFile()) {
      const stats = await stat(entryPath);
      files.push({
        key: [prefix, entryRelativePath.split(path.sep).join('/')].filter(Boolean).join('/'),
        size: stats.size,
      });
    }
  }

  return files;
};

const getRemoteObjects = async () => {
  const response = await runAws([
    's3api',
    'list-objects-v2',
    '--bucket',
    bucket,
    '--output',
    'json',
    ...endpointArgs,
  ], true);
  const result = JSON.parse(response);

  return new Map((result.Contents || []).map((object) => [object.Key, object.Size]));
};

const publishGenerations = async () => {
  const localFiles = await getLocalFiles(sourcePath);
  const remoteFiles = await getRemoteObjects();
  let projectedStorageBytes = [...remoteFiles.values()].reduce((total, size) => total + size, 0);

  for (const file of localFiles) {
    projectedStorageBytes += file.size - (remoteFiles.get(file.key) || 0);
  }

  if (projectedStorageBytes > maxStorageBytes) {
    const projectedStorageGB = (projectedStorageBytes / 1_000_000_000).toFixed(2);
    console.error(`Refusing cloud sync: projected bucket size ${projectedStorageGB} GB exceeds 100 GB cap.`);
    process.exitCode = 1;
    return;
  }

  const destination = `s3://${bucket}${prefix ? `/${prefix}` : ''}`;
  await runAws([
    's3',
    'sync',
    sourcePath,
    destination,
    '--only-show-errors',
    '--no-follow-symlinks',
    ...endpointArgs,
  ]);
  console.log(`Cloud sync finished. Projected bucket storage: ${(projectedStorageBytes / 1_000_000_000).toFixed(2)} GB / 100 GB.`);
};

publishGenerations().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
