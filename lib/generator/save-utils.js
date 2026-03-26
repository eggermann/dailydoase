// Helper to save image and config JSON metadata
import fs from 'fs-extra';
import path from 'path';
import { createLogger } from './logger.js';

const logger = createLogger('save-utils', { envKeys: ['GENERATOR_DEBUG'] });
let fetchImplPromise = null;

const resolveFetchImpl = async (fetchImpl = null) => {
    if (typeof fetchImpl === 'function') {
        return fetchImpl;
    }
    if (typeof globalThis.fetch === 'function') {
        return globalThis.fetch.bind(globalThis);
    }
    if (!fetchImplPromise) {
        fetchImplPromise = import('node-fetch').then((mod) => mod.default || mod);
    }
    const resolved = await fetchImplPromise;
    if (typeof resolved !== 'function') {
        throw new Error('Fetch is not available');
    }
    return resolved;
};

export function getItemName() {
    return `${Date.now()}`;
}

/**
 * Save image and config JSON metadata.
 * @param {string} imageDir - Directory to save files.
 * @param {Buffer} imageBuffer - Image data.
 * @param {string} name - Base name for files.
 * @param {string} prompt - Prompt string.
 * @param {string} endpoint - Endpoint info.
 */
export async function saveJPG(filePath, name, { buffer: imageBuffer }) {
    const itemName = name ?? getItemName(name)
    const imageName = `${itemName}.jpeg`;
    const imgPath = path.join(filePath, imageName);
    await fs.writeFile(imgPath, imageBuffer);

    logger.debug('saveJPG imageDir:', filePath);
    logger.debug('saveJPG image path:', imgPath);



    return { name: imageName, path: imgPath };
}


export async function saveJSON(filePath, data = {}) {
    const baseName = path.basename(filePath, path.extname(filePath));
    const dirName = path.dirname(filePath);
    const jsonPath = path.join(dirName, `${baseName}.json`);

    // Keep all provided fields and add a timestamp
    const metadata = {
        ...data,
        timestamp: new Date().toISOString()
    };

    await fs.writeJson(jsonPath, metadata, { spaces: 2 });

    // Return shape supports both old and new access patterns:
    // - Old: obj.metadata.prompt, obj.path
    // - New: obj.prompt, obj.path (metadata flattened)
    return { path: jsonPath, ...metadata, metadata };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const isRetryableDownloadError = (error) => {
    const status = Number(error?.status);
    if ([404, 408, 409, 423, 425, 429, 500, 502, 503, 504].includes(status)) {
        return true;
    }

    const message = String(error?.message || error || '').toLowerCase();
    return /fetch failed|network|econnreset|enotfound|socket hang up|timed out|timeout/.test(message);
};

export const downloadToFile = async (url, destPath, opts = {}) => {
    const {
        timeoutMs = 15 * 60 * 1000,
        fetchImpl = null,
        headers,
        maxRetries = 0,
        retryDelayMs = 1000,
        shouldRetry = isRetryableDownloadError,
    } = opts || {};
    const activeFetch = await resolveFetchImpl(fetchImpl);

    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const res = await activeFetch(url, {
                signal: controller.signal,
                ...(headers ? { headers } : {}),
            });
            if (!res.ok) {
                const error = new Error(`Failed to download ${url}: ${res.status} ${res.statusText}`);
                error.status = res.status;
                error.statusText = res.statusText;
                throw error;
            }
            const arrayBuffer = await res.arrayBuffer();
            fs.ensureDirSync(path.dirname(destPath));
            await fs.writeFile(destPath, Buffer.from(arrayBuffer));
            return destPath;
        } catch (err) {
            let error = err;
            if (error?.name === 'AbortError') {
                error = new Error(`Download timed out after ${timeoutMs}ms: ${url}`);
            }

            if (attempt >= maxRetries || !shouldRetry(error)) {
                throw error;
            }

            await sleep(retryDelayMs);
        } finally {
            clearTimeout(id);
        }
    }

    throw new Error(`Failed to download ${url}`);
};
