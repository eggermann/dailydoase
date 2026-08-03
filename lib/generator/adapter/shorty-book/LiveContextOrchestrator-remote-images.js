import fs from 'fs-extra';
import crypto from 'node:crypto';
import path from 'node:path';

import { downloadToFile } from '../../save-utils.js';

const buildRemoteImagePath = (imageUrl, imageIndex, { prefix = 'remote', cacheDir } = {}) => {
  const resolvedUrl = String(imageUrl || '').trim();
  const hash = crypto.createHash('sha1').update(`${prefix}:${imageIndex}:${resolvedUrl}`).digest('hex').slice(0, 12);
  let extension = '.jpg';
  try {
    const urlPath = new URL(resolvedUrl).pathname;
    extension = path.extname(urlPath) || extension;
  } catch {
    extension = '.jpg';
  }
  const safeExtension = extension.startsWith('.') ? extension : `.${extension}`;
  return path.join(
    cacheDir,
    `${prefix}-${String(imageIndex + 1).padStart(3, '0')}-${hash}${safeExtension}`
  );
};

const normalizeFolderImageUrl = (entry) => {
  const resolved = String(entry || '').trim();
  if (!resolved) {
    return '';
  }
  if (/^https?:\/\//i.test(resolved)) {
    return resolved.replace(/^http:\/\//i, 'https://');
  }
  if (resolved.startsWith('/')) {
    return `https://dailydoase.de/v${resolved}`;
  }
  try {
    return new URL(resolved, 'https://dailydoase.de/v/').toString();
  } catch {
    return '';
  }
};

export const resolveLocalImageEntries = async ({ imagePaths = [], baseDir = process.cwd() } = {}) => {
  const entries = [];
  for (const configuredPath of imagePaths) {
    const imagePath = path.isAbsolute(configuredPath)
      ? path.normalize(configuredPath)
      : path.resolve(baseDir, configuredPath);
    if (await fs.pathExists(imagePath)) {
      entries.push({
        path: imagePath,
        url: '',
        source: `scene-context-local-${entries.length + 1}`,
      });
    }
  }
  return entries;
};

export const createRemoteImageLoader = ({ cacheDir }) => ({
  buildPath(imageUrl, imageIndex, prefix = 'remote') {
    return buildRemoteImagePath(imageUrl, imageIndex, { prefix, cacheDir });
  },

  async ensureCached(imageUrl, imagePath) {
    if (!(await fs.pathExists(imagePath))) {
      await downloadToFile(imageUrl, imagePath, {
        maxRetries: 2,
        retryDelayMs: 1000,
      });
    }
    return imagePath;
  },

  async loadFolderImages({ apiUrl, explicitUrls = [], startAfterImageFile = '' } = {}) {
    const resolvedApiUrl = String(apiUrl || '').trim();
    let apiUrls = [];
    if (resolvedApiUrl) {
      try {
        const response = await fetch(resolvedApiUrl);
        if (response.ok) {
          const payload = await response.json();
          apiUrls = Array.isArray(payload?.items)
            ? payload.items
              .map((item) => item?.absoluteUrl || item?.url || item?.src || '')
              .map(normalizeFolderImageUrl)
              .filter(Boolean)
            : [];
        }
      } catch {
        apiUrls = [];
      }
    }

    const combined = [...explicitUrls, ...apiUrls];
    if (!startAfterImageFile) {
      return combined;
    }
    const startIndex = combined.findIndex((entry) => {
      try {
        return path.basename(new URL(entry).pathname) === startAfterImageFile;
      } catch {
        return false;
      }
    });
    return startIndex >= 0 && startIndex < combined.length - 1
      ? combined.slice(startIndex + 1)
      : combined;
  },
});
