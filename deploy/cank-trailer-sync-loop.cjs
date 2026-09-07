const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '..');
const sourceRoot = path.join(repoRoot, 'GENRATIONS-KAUFHAUF');
const copyScript = path.join(repoRoot, 'deploy', 'copy-merged-to-cank.cjs');
const pollMs = Number(process.env.CANK_TRAILER_SYNC_POLL_MS || 60_000);

const allowedExtensions = new Set(['.mp4', '.webm', '.mov', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.json']);

const walkFiles = (dirPath) => {
  const entries = [];
  if (!fs.existsSync(dirPath)) {
    return entries;
  }

  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      entries.push(...walkFiles(fullPath));
    } else if (entry.isFile()) {
      entries.push(fullPath);
    }
  }

  return entries;
};

const getLatestSourceStamp = () => {
  let latest = 0;
  for (const folder of fs.existsSync(sourceRoot) ? fs.readdirSync(sourceRoot, { withFileTypes: true }) : []) {
    if (!folder.isDirectory()) {
      continue;
    }
    const mergedDir = path.join(sourceRoot, folder.name, 'merged');
    if (!fs.existsSync(mergedDir) || !fs.statSync(mergedDir).isDirectory()) {
      continue;
    }
    for (const filePath of walkFiles(mergedDir)) {
      if (!allowedExtensions.has(path.extname(filePath).toLowerCase())) {
        continue;
      }
      const stat = fs.statSync(filePath);
      latest = Math.max(latest, stat.mtimeMs, stat.birthtimeMs || 0);
    }
  }
  return latest;
};

const runCopy = () => {
  execFileSync('node', [copyScript], {
    cwd: repoRoot,
    stdio: 'inherit',
  });
};

let lastStamp = 0;
let running = false;

const tick = () => {
  if (running) {
    return;
  }
  const stamp = getLatestSourceStamp();
  if (stamp === 0 || stamp === lastStamp) {
    return;
  }

  running = true;
  try {
    console.log(`[cank-trailer-sync] source changed: ${new Date(stamp).toISOString()}`);
    runCopy();
    lastStamp = stamp;
    console.log('[cank-trailer-sync] live folder refreshed.');
  } catch (error) {
    console.error('[cank-trailer-sync] refresh failed:', error.message);
  } finally {
    running = false;
  }
};

console.log(`[cank-trailer-sync] polling ${sourceRoot} every ${pollMs}ms`);
tick();
const timer = setInterval(tick, pollMs);

const stop = () => {
  clearInterval(timer);
  process.exit(0);
};

process.on('SIGINT', stop);
process.on('SIGTERM', stop);
