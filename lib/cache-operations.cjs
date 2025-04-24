const path = require("path");
const fs = require("fs");
const store = require("./store.cjs");

/**
 * Cache operation utility functions
 * @module cache-operations
 */
const cacheOperations = {
    /**
     * Gets all files with their metadata from a folder
     * @param {string} dir - Folder name
     * @returns {Array<Object>} Array of file metadata objects
     */
    getAllFilesFromFolderForImages(dir = "v-1__bak") {
        const cachedData = store.getFolder(dir);

        return cachedData.map(metaObj => {
            const href = `/v/`;
            let json = { name: metaObj.file };

            if (metaObj.jsonPath && fs.existsSync(metaObj.jsonPath)) {
                try {
                    json = JSON.parse(fs.readFileSync(metaObj.jsonPath, "utf-8"));
                } catch (err) {
                    console.warn(`Error reading JSON metadata for ${metaObj.jsonPath}:`, err);
                }
            }

            return {
                href,
                json,
                mtime: metaObj.mtime.getTime()
            };
        });
    },

    /**
     * Gets a random item from the cache
     * @returns {string|null} Path to random item or null if cache is empty
     */
    getRandomItem() {
        const cache = store.getCache();
        const keys = Object.keys(cache);
        if (!keys.length) return null;

        const rndFolderKey = keys[Math.floor(Math.random() * keys.length)];
        const folderItems = cache[rndFolderKey];
        if (!folderItems?.length) return null;

        return folderItems[Math.floor(Math.random() * folderItems.length)].fullPath;
    },

    /**
     * Adds a new file to the cache
     * @param {string} folderName - Target folder name
     * @param {string} fileName - File name to add
     */
    addNewFileToCache(folderName, fileName) {
        store.addFile(folderName, fileName);
    }
};

module.exports = cacheOperations;