const store = require("./store.cjs");
const path = require('path');

/**
 * Combined store utility functions
 * @module store-function
 */
module.exports = {
    /**
     * Gets all files from a folder with their generation data
     * @param {string} dir - Folder name
     * @returns {Promise<Array>} Array of generation objects
     */
    getAllFilesFromFolderForImages: async (dir = "v-1__bak") => {
        return store.getFolderGenerations(dir);
    },

    /**
     * Gets a random item from the store
     * @returns {Promise<Object>} Generation data for random item
     */
    getRandomItem: async () => {
        return store.getRandomGeneration();
    },

    /**
     * Gets JSON data for a file
     * @param {string} dir - File path
     * @returns {Promise<Object>} JSON data
     */
    getJSON: async (dir) => {
        const generation = await store.getGeneration({
            file: path.basename(dir),
            fullPath: path.join(await store.imgPath(), dir),
            folderName: path.basename(path.dirname(dir)),
            ext: path.extname(dir)
        });
        return generation.json;
    },

    /**
     * Gets file content as base64
     * @param {string} folderName - Folder name
     * @param {string} fileName - File name
     * @returns {Promise<Object>} Generation data in standard format
     */
    getFile: async (folderName, fileName) => {
        // Get files for this folder from store
        const files = store.getFolder(folderName);
        
        // Find the specific file
        const fileMetadata = files.find(file => file.file === fileName);
        
        if (!fileMetadata) {
            throw new Error(`File ${fileName} not found in folder ${folderName}`);
        }

        // Get generation data for the file
        const generation = await store.getGeneration(fileMetadata, true);

        // Ensure consistent format with other endpoints
        return {
            src: `/${fileMetadata.url}`,
            json: generation.json,
            imageBase64: generation.imageBase64,
            metadata: {
                file: fileMetadata.file,
                ext: fileMetadata.ext,
                fullPath: fileMetadata.fullPath,
                folderName: fileMetadata.folderName,
                url: fileMetadata.url,
                mtime: fileMetadata.mtime,
                jsonPath: fileMetadata.jsonPath,
                fileName: path.basename(fileMetadata.fullPath)
            }
        };
    },

    /**
     * Gets the newest file with its generation data
     * @returns {Promise<Object>} Generation data for newest file
     */
    newestFile: async () => {
        try {
            return await store.getNewestGeneration();
        } catch (error) {
            if (error.message === "No files found in cache") {
                return null;
            }
            throw error;
        }
    },

    /**
     * Gets the newest file or folder
     * @returns {Promise<Object>} Generation data for newest item
     */
    getNewestFileOrFolder: async () => {
        try {
            return await store.getNewestGeneration();
        } catch (error) {
            if (error.message === "No files found in cache") {
                return null;
            }
            throw error;
        }
    },

    /**
     * Gets the most recent file or folder
     * @returns {Promise<Object>} Generation data for most recent item
     */
    mostRecentFileOrFolder: async () => {
        try {
            return await store.getNewestGeneration();
        } catch (error) {
            if (error.message === "No files found in cache") {
                return null;
            }
            throw error;
        }
    }
};