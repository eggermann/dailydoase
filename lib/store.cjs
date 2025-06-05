const path = require("path");
const { ensureDirectoryExists } = require("./server/helpers.cjs");
const cacheManager = require('./store/cacheManager.cjs');
const { getGeneration } = require('./store/fileUtils.cjs');
// const FlatDB = require('flat-db');
// Constants
const DEFAULT_LIMIT = 10;
const GENERATIONS_PATH = 'GENERATIONS';
const ABSOLUTE_GENERATIONS_PATH = path.resolve(process.cwd(), GENERATIONS_PATH);
let _limit = DEFAULT_LIMIT;

// Remove any duplicate GENERATIONS from the path
const cleanPath = (p) => p.replace(/GENERATIONS[\/\\]GENERATIONS/, 'GENERATIONS');

// Ensure GENERATIONS directory exists
ensureDirectoryExists(ABSOLUTE_GENERATIONS_PATH);
console.log('Base generations path:', cleanPath(ABSOLUTE_GENERATIONS_PATH));

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
function initCache(imageDir = ABSOLUTE_GENERATIONS_PATH) {
    if (!imageDir) {
        throw new Error("Image directory path is required");
    }

    // Clean and normalize the path
    const normalizedPath = cleanPath(path.resolve(process.cwd(), path.relative(process.cwd(), imageDir)));
    ensureDirectoryExists(normalizedPath);
    return cacheManager.initialize(normalizedPath);
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