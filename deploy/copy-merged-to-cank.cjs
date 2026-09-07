const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '..');
const sourceRoot = path.join(repoRoot, 'GENRATIONS-KAUFHAUF');
const targetRoot = path.join(repoRoot, 'lib', 'GENERATIONS', 'CANK');
const manifestPath = path.join(targetRoot, 'copied-files.json');
const listPath = path.join(targetRoot, 'copied-files.txt');
const finderTagAttr = 'com.apple.metadata:_kMDItemUserTags';

const allowedExtensions = new Set([
  '.mp4',
  '.webm',
  '.mov',
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.json',
]);
const MAX_COMMIT_SKEW_MS = 3 * 60 * 60 * 1000;

const buildCommitHash = process.argv[2] || execSync('git rev-parse --short HEAD', { cwd: repoRoot }).toString().trim();

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function readManifest() {
  if (!fs.existsSync(manifestPath)) {
    return [];
  }

  try {
    const data = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    return Array.isArray(data)
      ? data.filter((entry) => !String(entry.targetFile || '').toLowerCase().includes('end-card'))
      : [];
  } catch (error) {
    console.warn('Manifest unreadable, start fresh:', error.message);
    return [];
  }
}

function clearTargetRoot() {
  if (fs.existsSync(targetRoot)) {
    fs.rmSync(targetRoot, { recursive: true, force: true });
  }
  ensureDir(targetRoot);
}

function walkFiles(dirPath) {
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
}

function loadGitCommits() {
  const raw = execSync(
    "git log --all --no-merges --format='%H %ct %s'",
    { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
  ).trim();

  if (!raw) {
    return [];
  }

  return raw
    .split('\n')
    .map((line) => {
      const firstSpace = line.indexOf(' ');
      const secondSpace = line.indexOf(' ', firstSpace + 1);
      if (firstSpace === -1 || secondSpace === -1) {
        return null;
      }
      const hash = line.slice(0, firstSpace);
      const unixSeconds = Number(line.slice(firstSpace + 1, secondSpace));
      const subject = line.slice(secondSpace + 1);
      return {
        hash,
        shortHash: hash.slice(0, 12),
        dateMs: unixSeconds * 1000,
        subject,
      };
    })
    .filter(Boolean)
    .sort((left, right) => right.dateMs - left.dateMs);
}

function inferClosestCommit(creationMs, commits) {
  if (!commits.length || !Number.isFinite(creationMs)) {
    return null;
  }

  let best = null;
  for (const commit of commits) {
    const deltaMs = Math.abs(commit.dateMs - creationMs);
    if (!best || deltaMs < best.deltaMs) {
      best = { ...commit, deltaMs };
    }
  }

  if (!best || best.deltaMs > MAX_COMMIT_SKEW_MS) {
    return null;
  }

  return best;
}

function hashBuffer(hasher, value) {
  if (value === undefined || value === null) {
    hasher.update('');
    return;
  }

  if (Buffer.isBuffer(value)) {
    hasher.update(value);
    return;
  }

  hasher.update(String(value));
}

function getFinderVioletHex() {
  const script = [
    'import plistlib',
    "print(plistlib.dumps(['violet\\n6'], fmt=plistlib.FMT_BINARY).hex())",
  ].join('; ');

  return execSync(`python3 -c "${script}"`, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
    shell: '/bin/bash',
  }).trim();
}

const finderVioletHex = getFinderVioletHex();

function applyFinderVioletTag(filePath, enabled) {
  try {
    if (!enabled) {
      execSync(`xattr -d ${finderTagAttr} "${filePath}"`, {
        cwd: repoRoot,
        shell: '/bin/bash',
        stdio: ['ignore', 'ignore', 'ignore'],
      });
      return;
    }

    execSync(`xattr -wx ${finderTagAttr} ${finderVioletHex} "${filePath}"`, {
      cwd: repoRoot,
      shell: '/bin/bash',
      stdio: ['ignore', 'ignore', 'ignore'],
    });
  } catch (error) {
    // ignore tag failures; file copy stays source of truth
  }
}

function toFlatSlug(input) {
  return input
    .replace(/\\/g, '/')
    .replace(/\.\./g, '')
    .replace(/[^a-zA-Z0-9._/-]+/g, '-')
    .replace(/\//g, '__')
    .replace(/-+/g, '-')
    .replace(/^[-_]+|[-_]+$/g, '');
}

function collectMergedSources() {
  if (!fs.existsSync(sourceRoot)) {
    throw new Error(`Source root missing: ${sourceRoot}`);
  }

  return fs.readdirSync(sourceRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const mergedDir = path.join(sourceRoot, entry.name, 'merged');
      if (!fs.existsSync(mergedDir) || !fs.statSync(mergedDir).isDirectory()) {
        return null;
      }
      const files = walkFiles(mergedDir).filter((filePath) => {
        const ext = path.extname(filePath).toLowerCase();
        const base = path.basename(filePath).toLowerCase();
        if (!allowedExtensions.has(ext)) return false;
        if (base.includes('end-card')) return false;
        return true;
      });
      const fingerprint = crypto.createHash('sha1');
      const infoPath = path.join(sourceRoot, entry.name, 'info.json');
      hashBuffer(fingerprint, entry.name);
      if (fs.existsSync(infoPath)) {
        hashBuffer(fingerprint, fs.readFileSync(infoPath));
      }
      files
        .slice()
        .sort((left, right) => left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' }))
        .forEach((filePath) => {
          const stat = fs.statSync(filePath);
          hashBuffer(fingerprint, path.basename(filePath));
          hashBuffer(fingerprint, stat.size);
          hashBuffer(fingerprint, stat.mtimeMs);
          hashBuffer(fingerprint, fs.readFileSync(filePath));
        });
      const referenceFile = files.find((filePath) => /\.concat\.mp4$/i.test(filePath))
        || files.find((filePath) => /\.mp4$/i.test(filePath))
        || files[0]
        || null;
      const referenceStat = referenceFile ? fs.statSync(referenceFile) : null;
      const creationMs = referenceStat
        ? (Number.isFinite(referenceStat.birthtimeMs) && referenceStat.birthtimeMs > 0
          ? referenceStat.birthtimeMs
          : referenceStat.mtimeMs)
        : null;
      const nearestCommit = inferClosestCommit(creationMs, collectMergedSources.gitCommits || []);
      return {
        generationFolder: entry.name,
        mergedDir,
        files,
        sourceHash: fingerprint.digest('hex').slice(0, 12),
        referenceFile,
        creationMs,
        nearestCommit,
      };
    })
    .filter(Boolean)
    .flatMap((group) => group.files.map((filePath) => ({
      generationFolder: group.generationFolder,
      mergedDir: group.mergedDir,
      sourcePath: filePath,
      sourceMtimeMs: fs.statSync(filePath).mtimeMs,
      sourceCreationMs: fs.statSync(filePath).birthtimeMs || fs.statSync(filePath).mtimeMs,
      sourceHash: group.sourceHash,
      referenceFile: group.referenceFile,
      creationMs: group.creationMs,
      nearestCommit: group.nearestCommit,
    })));
}

function buildTargetName(sourcePath, generationFolder, index, provenance) {
  const ext = path.extname(sourcePath).toLowerCase();
  const rel = path.relative(path.join(sourceRoot, generationFolder, 'merged'), sourcePath);
  const base = path.basename(sourcePath, ext);
  const relStem = rel === base + ext ? base : path.join(path.dirname(rel), base);
  const flatStem = toFlatSlug(relStem);
  const tag = provenance?.tag || 'unknown';
  return `${index}-${tag}-${toFlatSlug(generationFolder)}-${flatStem}${ext}`;
}

function main() {
  clearTargetRoot();

  collectMergedSources.gitCommits = loadGitCommits();

  const manifest = [];
  const sources = collectMergedSources().sort((left, right) => {
    if (left.creationMs !== right.creationMs) {
      return right.creationMs - left.creationMs;
    }
    const leftKey = `${left.generationFolder}/${left.sourcePath}`;
    const rightKey = `${right.generationFolder}/${right.sourcePath}`;
    return rightKey.localeCompare(leftKey, undefined, { numeric: true, sensitivity: 'base' });
  });
  const copied = [];

  sources.forEach((source, index) => {
    const targetFile = buildTargetName(
      source.sourcePath,
      source.generationFolder,
      index + 1,
      source.nearestCommit
        ? {
            tag: source.nearestCommit.shortHash,
            violet: true,
          }
        : {
            tag: source.sourceHash,
            violet: false,
          }
    );
    const targetPath = path.join(targetRoot, targetFile);

    fs.copyFileSync(source.sourcePath, targetPath);
    const sourceStat = fs.statSync(source.sourcePath);
    fs.utimesSync(targetPath, sourceStat.atime, sourceStat.mtime);
    const stat = fs.statSync(targetPath);
    applyFinderVioletTag(targetPath, Boolean(source.nearestCommit));

    const entry = {
      sortIndex: index + 1,
      buildCommitHash,
      creationMs: source.creationMs,
      sourceHash: source.sourceHash,
      provenance: source.nearestCommit
        ? {
            type: 'commit',
            violet: true,
            hash: source.nearestCommit.hash,
            shortHash: source.nearestCommit.shortHash,
            dateMs: source.nearestCommit.dateMs,
            deltaMs: source.nearestCommit.deltaMs,
            subject: source.nearestCommit.subject,
          }
        : {
            type: 'fingerprint',
            violet: false,
            hash: source.sourceHash,
          },
      generationFolder: source.generationFolder,
      sourcePath: path.relative(repoRoot, source.sourcePath).split(path.sep).join('/'),
      targetFile,
      targetPath: path.relative(repoRoot, targetPath).split(path.sep).join('/'),
      size: stat.size,
      sourceMtimeMs: source.sourceMtimeMs,
      sourceCreationMs: source.sourceCreationMs,
      copiedAt: new Date().toISOString(),
    };

    manifest.push(entry);
    copied.push(entry);
  });

  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  fs.writeFileSync(
    listPath,
    manifest
      .slice()
      .sort((a, b) => a.sortIndex - b.sortIndex)
      .map((entry) => `${entry.provenance.violet ? '[violet] ' : ''}${entry.targetFile}\t<=\t${entry.sourcePath}`)
      .join('\n') + '\n'
  );

  console.log(`buildCommitHash: ${buildCommitHash}`);
  console.log(`sourceRoot: ${sourceRoot}`);
  console.log(`targetRoot: ${targetRoot}`);
  console.log(`copied: ${copied.length}`);
  copied.forEach((entry) => {
    console.log(`${entry.targetFile} <= ${entry.sourcePath}`);
  });
}

main();
