const path = require("path");
const fs = require("fs");
const store = require("./store.cjs");

// Constants for image handling
const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB limit
const CACHE_TIMEOUT = 60 * 1000; // 1 minute cache
const imageCache = new Map();

/**
 * Clean expired entries from cache
 * @private
 */
function cleanCache() {
    const now = Date.now();
    for (const [key, { timestamp }] of imageCache) {
        if (now - timestamp > CACHE_TIMEOUT) {
            imageCache.delete(key);
        }
    }
}

/**
 * File finding and newest file operations
 * @module file-finder
 */
const fileFinder = {
    /**
     * Gets the newest file from the cache
     * @returns {Promise<Object>} Object containing the newest file's generation data
     */
    async newestFile() {
        try {
            cleanCache();

            // Get newest generation directly from store
            const result = await store.getNewestGeneration();
            console.log(`Found newest file: ${result.metadata.file} in folder ${result.metadata.folderName}`);
            return result;
        } catch (err) {
            console.error("newestFile error:", err);
            return { error: err.message };
        }
    },

    /**
     * Gets the most recent file or folder with its metadata
     * @param {number} [indexImage=0] - Index of the image to return
     * @returns {Promise<Object>} Object containing generation data
     */
    async mostRecentFileOrFolder(indexImage = 0) {
        try {
            cleanCache();

            const imgPath = await store.imgPath();
            const folder = await this.getNewestFileOrFolder(imgPath, false);

            if (!folder) {
                throw new Error("No folders found in image path");
            }

            const files = await store.getFolderGenerations(folder.file);
            if (!files.length) {
                throw new Error(`No image files found in folder: ${folder.file}`);
            }

            // Ensure index wraps around
            return files[indexImage % files.length];
        } catch (err) {
            console.error("mostRecentFileOrFolder error:", err);
            return { error: err.message };
        }
    },

    /**
     * Finds newest file or folder in a directory
     * @param {string} dir - Directory to search
     * @param {boolean} returnFiles - If true, return files; if false, return folders
     * @returns {Object|null} Object containing file info and mtime, or null if none found
     */
    getNewestFileOrFolder(dir, returnFiles) {
        try {
            const items = fs.readdirSync(dir)
                .filter(file => {
                    if (file.startsWith('info') || file.startsWith('.')) return false;
                    try {
                        const lstat = fs.lstatSync(path.join(dir, file));
                        return returnFiles ? lstat.isFile() : lstat.isDirectory();
                    } catch (err) {
                        console.warn(`Error accessing ${file}:`, err);
                        return false;
                    }
                })
                .map(file => {
                    const fullPath = path.join(dir, file);
                    return {
                        file,
                        mtime: fs.lstatSync(fullPath).mtime.getTime()
                    };
                });

            if (!items.length) return null;

            return items.reduce((latest, current) =>
                current.mtime > latest.mtime ? current : latest
            );
        } catch (err) {
            console.error(`Error in getNewestFileOrFolder for ${dir}:`, err);
            return null;
        }
    }
};

module.exports = fileFinder;