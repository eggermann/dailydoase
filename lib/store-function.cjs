const fileOperations = require("./file-operations.cjs");
const cacheOperations = require("./cache-operations.cjs");
const fileFinder = require("./file-finder.cjs");

/**
 * Combined store utility functions
 * @module store-function
 */
module.exports = {
    // File operations
    checkFileLimit: fileOperations.checkFileLimit,
    getJSON: fileOperations.getJSON,
    getFile: fileOperations.getFile,

    // Cache operations
    getAllFilesFromFolderForImages: cacheOperations.getAllFilesFromFolderForImages,
    getRandomItem: cacheOperations.getRandomItem,
    addNewFileToCache: cacheOperations.addNewFileToCache,

    // File finding operations
    newestFile: fileFinder.newestFile,
    getNewestFileOrFolder: fileFinder.getNewestFileOrFolder,
    mostRecentFileOrFolder: fileFinder.mostRecentFileOrFolder
};