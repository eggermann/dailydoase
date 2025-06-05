const store = require("./store.cjs");

/**
 * Cache operation utility functions
 * @module cache-operations
 */
const cacheOperations = {
    /**
     * Gets all files with their metadata from a folder
     * @param {string} dir - Folder name
     * @returns {Promise<Array>} Array of generation objects with image and metadata
     */
    async getAllFilesFromFolderForImages(dir = "v-1__bak") {
        return store.getFolderGenerations(dir);
    },

    /**
     * Gets a random item from the cache
     * @returns {Promise<Object|null>} Generation object or null if cache is empty
     */
    async getRandomItem() {
        try {
            return await store.getRandomGeneration();
        } catch (error) {
            console.error('Error getting random item:', error);
            return null;
        }
    },

    /**
     * Adds a new file to the cache
     * @param {string} folderName - Target folder name
     * @param {string} fileName - File name to add
     * @returns {Promise<Object>} Added file's generation data
     */
    async addNewFileToCache(folderName, fileName) {
        store.addFile(folderName, fileName);
        const files = await store.getFolderGenerations(folderName);
        return files.find(f => f.metadata.file === fileName);
    }
};

module.exports = cacheOperations;