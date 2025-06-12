const path = require("path");
const { ensureDirectoryExists } = require("./server/helpers.cjs");
const cacheManager = require('./store/cacheManager.cjs');
const { getGeneration } = require('./store/fileUtils.cjs');
// const FlatDB = require('flat-db');
// Constants
const DEFAULT_LIMIT = 10;

const GENERATIONS_PATH = path.resolve('./', 'GENERATIONS');//process.cwd()
let _limit = DEFAULT_LIMIT;

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
function initCache() {
   ensureDirectoryExists(GENERATIONS_PATH);
    return cacheManager.initialize(GENERATIONS_PATH);
}

// Public API
module.exports = {
    initCache,
    GENERATIONS_PATH,
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