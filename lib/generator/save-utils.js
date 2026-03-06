// Helper to save image and config JSON metadata
import fs from 'fs-extra';
import path from 'path';
import { createLogger } from './logger.js';

const logger = createLogger('save-utils', { envKeys: ['GENERATOR_DEBUG'] });

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

export const downloadToFile = async (url, destPath, opts = {}) => {
    const { timeoutMs = 15 * 60 * 1000 } = opts || {};
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok) {
            throw new Error(`Failed to download ${url}: ${res.status} ${res.statusText}`);
        }
        const arrayBuffer = await res.arrayBuffer();
        fs.ensureDirSync(path.dirname(destPath));
        await fs.writeFile(destPath, Buffer.from(arrayBuffer));
        return destPath;
    } catch (err) {
        if (err.name === 'AbortError') {
            throw new Error(`Download timed out after ${timeoutMs}ms: ${url}`);
        }
        throw err;
    } finally {
        clearTimeout(id);
    }
};
