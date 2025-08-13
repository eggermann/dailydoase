#!/usr/bin/env node
/**
 * Recursively scans a directory tree for media files and ensures each
 * companion JSON file follows the scheme: <basename><mediaExt>.json.
 *
 * Example: 
 *   1-6064.png   + 1-6064.json  → 1-6064.png.json
 *
 * Usage:
 *   node reformater.js [rootDir]
 *   # if [rootDir] is omitted, the current working directory is used.
 */

const fs   = require('fs').promises;
const path = require('path');

// Extend this set if you need to cover more media types.
const MEDIA_EXTS = new Set([
  '.png', '.jpg', '.jpeg', '.gif',
  '.mp3', '.mp4', '.wav', '.flac'
]);

/**
 * Walk the directory tree depth‑first.
 * @param {string} dir - absolute path of directory to traverse
 */
async function walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      await walk(fullPath);
      continue;
    }

    if (!entry.isFile()) continue;

    const ext = path.extname(entry.name).toLowerCase();
    if (MEDIA_EXTS.has(ext)) {
      await ensureJsonMatches(fullPath, ext);
    }
  }
}

/**
 * Ensure the JSON metadata file is named <basename><mediaExt>.json.
 *
 * @param {string} mediaPath  Absolute path to the media file.
 * @param {string} mediaExt   Its extension, including the leading dot.
 */
async function ensureJsonMatches(mediaPath, mediaExt) {
  const dir  = path.dirname(mediaPath);
  const base = path.basename(mediaPath, mediaExt);

  const currentJson = path.join(dir, `${base}.json`);
  const desiredJson = path.join(dir, `${base}${mediaExt}.json`);

  // If a correctly‑named JSON already exists, we’re done.
  try {
    await fs.access(desiredJson);
    return;
  } catch { /* file does not exist – fall through */ }

  // Try to rename the simple JSON; ignore if it’s missing.
  try {
    await fs.rename(currentJson, desiredJson);
    console.log(`✔︎  ${path.relative(process.cwd(), currentJson)} → ${path.relative(process.cwd(), desiredJson)}`);
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.error(`✖︎  Failed for ${mediaPath}: ${err.message}`);
    }
  }
}

// Entry point ---------------------------------------------------------------
const root = process.argv[2] || process.cwd();
walk(root).catch(err => {
  console.error(err);
  process.exit(1);
});
