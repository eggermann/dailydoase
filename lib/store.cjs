const path = require("path");
const { ensureDirectoryExists } = require("./server/helpers.cjs");
const cacheManager = require('./store/cacheManager.cjs');
const { getGeneration } = require('./store/fileUtils.cjs');

// Constants
const DEFAULT_LIMIT = 10;
const GENERATIONS_PATH = path.resolve(__dirname, '../GENERATIONS/');
let _limit = DEFAULT_LIMIT;

// Ensure GENERATIONS directory exists
ensureDirectoryExists(GENERATIONS_PATH);

/**
 * Set the limit for file processing
 */
function setLimit(limit) {
    if (!Number.isInteger(limit) || limit <= 0) {
        throw new Error("Limit must be a positive integer");
    }
    _limit = limit;
}

/**
 * Initialize or refresh the cache
 */
function initCache(imageDir = GENERATIONS_PATH) {
    if (!imageDir) {
        throw new Error("Image directory path is required");
    }

    ensureDirectoryExists(imageDir);
    return cacheManager.initialize(imageDir);
}

// Public API
module.exports = {
    initCache,
    refreshCache: () => initCache(cacheManager.getImgPath()),
    getCache: () => cacheManager.getCache() ?? initCache(),
    getFolder: (folderName) => cacheManager.getFolder(folderName),
    getFolderGenerations: (folderName) => cacheManager.getFolderGenerations(folderName),
    getNewestGeneration: () => cacheManager.getNewestGeneration(),
    getRandomGeneration: () => cacheManager.getRandomGeneration(),
    getGeneration, // Add getGeneration to exports
    addFile: (folderName, fileName) => cacheManager.addFile(folderName, fileName),
    shiftFile: (folderName) => cacheManager.shiftFile(folderName),
    imgPath: () => cacheManager.getImgPath() ?? initCache(),
    totalFiles: () => cacheManager.getTotalFiles(),
    setLimit
};