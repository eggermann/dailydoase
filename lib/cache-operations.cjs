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

        return cachedData
            .filter(metaObj => path.extname(metaObj.file) !== '.json')
            .map(async metaObj => {
                let json = { name: metaObj.file };

                if (metaObj.jsonPath && fs.existsSync(metaObj.jsonPath)) {
                    try {
                        json = JSON.parse(fs.readFileSync(metaObj.jsonPath, "utf-8"));
                    } catch (err) {
                        console.warn(`Error reading JSON metadata for ${metaObj.jsonPath}:`, err);
                    }
                }

                // Read the image file
                const imageBuffer = await fs.promises.readFile(metaObj.fullPath);
                const imageBase64 = 'data:image/png;base64,' + imageBuffer.toString('base64');

                return {
                    imageBase64,
                    json,
                    metadata: {
                        file: metaObj.file,
                        ext: metaObj.ext,
                        fullPath: metaObj.fullPath,
                        folderName: dir,
                        url: metaObj.url,
                        mtime: metaObj.mtime,
                        jsonPath: metaObj.jsonPath,
                        fileName: path.basename(metaObj.fullPath)
                    }
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