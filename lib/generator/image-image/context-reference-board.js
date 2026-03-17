import fs from 'fs-extra';
import path from 'path';
import sharp from 'sharp';

const DEFAULT_LAYOUT = {
  maxImages: 8,
  columns: 4,
  rows: 2,
  minTileWidth: 96,
  minTileHeight: 72,
  fallbackWidth: 1024,
  fallbackHeight: 768,
};

const resolvePositiveInt = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
};

const normalizeImagePath = (value) => {
  const rawPath = typeof value === 'string'
    ? value
    : value?.path;
  if (typeof rawPath !== 'string' || rawPath.trim().length === 0) {
    return '';
  }
  return path.resolve(rawPath);
};

const getUniquePaths = (entries = []) => {
  const seen = new Set();
  const paths = [];

  for (const entry of entries) {
    const resolvedPath = normalizeImagePath(entry);
    if (!resolvedPath || seen.has(resolvedPath)) {
      continue;
    }
    seen.add(resolvedPath);
    paths.push(resolvedPath);
  }

  return paths;
};

const filterExistingPaths = async (entries = []) => {
  const paths = getUniquePaths(entries);
  const existing = await Promise.all(paths.map(async (entryPath) => (
    await fs.pathExists(entryPath) ? entryPath : null
  )));
  return existing.filter(Boolean);
};

const resolveImageSize = async (imagePath, layout = {}) => {
  if (!imagePath) {
    return {
      width: resolvePositiveInt(layout.fallbackWidth, DEFAULT_LAYOUT.fallbackWidth),
      height: resolvePositiveInt(layout.fallbackHeight, DEFAULT_LAYOUT.fallbackHeight),
    };
  }

  try {
    const metadata = await sharp(imagePath).metadata();
    const width = resolvePositiveInt(metadata?.width, DEFAULT_LAYOUT.fallbackWidth);
    const height = resolvePositiveInt(metadata?.height, DEFAULT_LAYOUT.fallbackHeight);
    return { width, height };
  } catch {
    return {
      width: resolvePositiveInt(layout.fallbackWidth, DEFAULT_LAYOUT.fallbackWidth),
      height: resolvePositiveInt(layout.fallbackHeight, DEFAULT_LAYOUT.fallbackHeight),
    };
  }
};

const createTileBuffer = async ({ imagePath, width, height }) => sharp(imagePath)
  .resize({
    width,
    height,
    fit: 'contain',
    background: { r: 0, g: 0, b: 0, alpha: 1 },
  })
  .png()
  .toBuffer();

export const buildContextReferenceBoard = async ({
  imageDir,
  primaryImagePath,
  referenceImages = [],
  layout = {},
  name = 'context-reference-board',
} = {}) => {
  const mergedLayout = {
    ...DEFAULT_LAYOUT,
    ...(layout || {}),
  };
  const maxImages = resolvePositiveInt(mergedLayout.maxImages, DEFAULT_LAYOUT.maxImages);
  const columns = resolvePositiveInt(mergedLayout.columns, DEFAULT_LAYOUT.columns);
  const defaultRows = Math.max(1, Math.ceil(maxImages / columns));
  const rows = resolvePositiveInt(mergedLayout.rows, defaultRows);
  const resolvedPrimaryPath = normalizeImagePath(primaryImagePath);
  const referencePaths = (await filterExistingPaths(referenceImages))
    .filter((entryPath) => entryPath !== resolvedPrimaryPath)
    .slice(-maxImages);

  if (!resolvedPrimaryPath && referencePaths.length === 0) {
    return null;
  }

  const anchorPath = resolvedPrimaryPath || referencePaths[0] || '';
  const anchorSize = await resolveImageSize(anchorPath, mergedLayout);
  const boardWidth = anchorSize.width;
  const primaryHeight = resolvedPrimaryPath ? anchorSize.height : 0;
  const gridRows = Math.max(1, rows);
  const tileWidth = Math.max(
    resolvePositiveInt(mergedLayout.minTileWidth, DEFAULT_LAYOUT.minTileWidth),
    Math.floor(boardWidth / columns)
  );
  const tileHeight = resolvedPrimaryPath
    ? Math.max(
        resolvePositiveInt(mergedLayout.minTileHeight, DEFAULT_LAYOUT.minTileHeight),
        Math.floor(anchorSize.height / Math.max(2, gridRows * 2))
      )
    : Math.max(
        resolvePositiveInt(mergedLayout.minTileHeight, DEFAULT_LAYOUT.minTileHeight),
        Math.floor(anchorSize.height / Math.max(1, gridRows))
      );
  const gridHeight = tileHeight * gridRows;
  const boardHeight = resolvedPrimaryPath ? primaryHeight + gridHeight : gridHeight;
  const boardDir = path.join(path.resolve(String(imageDir || '.')), 'context-reference');
  await fs.ensureDir(boardDir);

  const composites = [];

  if (resolvedPrimaryPath) {
    composites.push({
      input: await sharp(resolvedPrimaryPath)
        .resize({
          width: boardWidth,
          height: primaryHeight,
          fit: 'contain',
          background: { r: 0, g: 0, b: 0, alpha: 1 },
        })
        .png()
        .toBuffer(),
      left: 0,
      top: 0,
    });
  }

  for (let index = 0; index < referencePaths.length; index += 1) {
    const tileBuffer = await createTileBuffer({
      imagePath: referencePaths[index],
      width: tileWidth,
      height: tileHeight,
    });
    composites.push({
      input: tileBuffer,
      left: (index % columns) * tileWidth,
      top: primaryHeight + Math.floor(index / columns) * tileHeight,
    });
  }

  const boardPath = path.join(boardDir, `${Date.now()}-${name}.png`);
  await sharp({
    create: {
      width: boardWidth,
      height: boardHeight,
      channels: 3,
      background: { r: 0, g: 0, b: 0 },
    },
  })
    .composite(composites)
    .png()
    .toFile(boardPath);

  return {
    imagePath: boardPath,
    primaryImagePath: resolvedPrimaryPath || '',
    referenceImagePaths: referencePaths,
    width: boardWidth,
    height: boardHeight,
    columns,
    rows: gridRows,
  };
};
