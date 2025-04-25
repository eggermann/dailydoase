const fs = require("fs");
const path = require("path");
const flatfile = require("flat-file-db");
const { ensureDirectoryExists } = require("./server/helpers.cjs");

// Constants
const DEFAULT_LIMIT = 10;
const PNG_EXTENSION = ".png";
const JSON_EXTENSION = ".json";
const GENERATIONS_PATH = path.resolve(__dirname, '../GENERATIONS');
const DB_PATH = path.resolve(__dirname, '../data/store.db');

// Ensure data directory exists
ensureDirectoryExists(path.dirname(DB_PATH));

// Initialize database
const db = flatfile.sync(DB_PATH);

// Cache for faster reads
let _cache = Object.create(null);
let _totalFiles = 0;
let _imgPath = null;
let _limit = DEFAULT_LIMIT;

/**
 * Get generation data from a file
 * @param {Object} fileMetadata - File metadata from database
 * @returns {Promise<Object>} Generation data with image and metadata
 */
async function getGeneration(fileMetadata, includeImageData = false) {
    try {
        let result = {
            src: `/${fileMetadata.url}`,  // Direct URL for image loading
            json: { name: fileMetadata.file },
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

        // Read JSON metadata if it exists
        if (fileMetadata.jsonPath && fs.existsSync(fileMetadata.jsonPath)) {
            try {
                result.json = JSON.parse(await fs.promises.readFile(fileMetadata.jsonPath, "utf-8"));
            } catch (err) {
                console.warn(`Error reading JSON metadata for ${fileMetadata.jsonPath}:`, err);
            }
        }

        // Only include base64 image data if specifically requested
        if (includeImageData) {
            const imageBuffer = await fs.promises.readFile(fileMetadata.fullPath);
            result.imageBase64 = 'data:image/png;base64,' + imageBuffer.toString('base64');
        }

        return result;
    } catch (err) {
        console.error(`Error getting generation data for ${fileMetadata.file}:`, err);
        throw err;
    }
}

/**
 * Create file metadata object
 */
function createFileMetadata(fileName, basePath, stats, resolvedPath) {
    const folderName = path.basename(path.dirname(resolvedPath));
    return {
        file: fileName,
        ext: path.extname(fileName),
        fullPath: resolvedPath,
        folderName,
        url: path.join(folderName, fileName),
        mtime: stats.mtime,
        jsonPath: resolvedPath.replace(PNG_EXTENSION, JSON_EXTENSION),
    };
}

/**
 * Get folder contents
 */
function getFolder(folderName) {
    return _cache[folderName] || [];
}

/**
 * Refresh the cache
 */
function refreshCache() {
    if (!_imgPath) {
        throw new Error("Cannot refresh cache: not initialized");
    }
    return initCache(_imgPath);
}

/**
 * Initialize the cache and database
 */
function initCache(imageDir = GENERATIONS_PATH) {
    console.log('Initializing cache with directory:', imageDir);

    if (!imageDir) {
        throw new Error("Image directory path is required");
    }

    try {
        _cache = {};
        _imgPath = imageDir;
        _totalFiles = 0;

        ensureDirectoryExists(_imgPath);

        // Clear existing database
        db.keys().forEach(key => db.del(key));

        // Initialize metadata
        db.put('__metadata__', {
            imgPath: _imgPath,
            totalFiles: 0,
            limit: _limit
        });

        function processFile(file, dir) {
            const fullPath = path.join(dir, file);
            if (!file.toLowerCase().endsWith(PNG_EXTENSION)) return;
            
            try {
                const { stats, resolvedPath } = getFileStats(fullPath);
                const metadata = createFileMetadata(file, _imgPath, stats, resolvedPath);
                const folderName = path.basename(dir);

                if (!_cache[folderName]) {
                    _cache[folderName] = [];
                }

                _cache[folderName].push(metadata);
                _cache[folderName].sort((a, b) => a.mtime - b.mtime);
                _totalFiles++;

                // Store in db
                const key = `${folderName}:${file}`;
                db.put(key, metadata);
            } catch (error) {
                console.warn(`Skipping file ${file}:`, error);
            }
        }

        function scanDir(dir) {
            try {
                const items = fs.readdirSync(dir);
                console.log(`Scanning directory: ${dir}, found ${items.length} items`);

                for (const item of items) {
                    if (item.startsWith('.')) continue;

                    const fullPath = path.join(dir, item);
                    const stats = fs.statSync(fullPath);

                    if (stats.isDirectory()) {
                        scanDir(fullPath);
                    } else if (stats.isFile()) {
                        processFile(item, dir);
                    }
                }
            } catch (error) {
                console.error(`Error scanning directory ${dir}:`, error);
            }
        }

        // Start the scan from the root directory
        scanDir(_imgPath);

        // Update metadata
        db.put('__metadata__', {
            imgPath: _imgPath,
            totalFiles: _totalFiles,
            limit: _limit
        });

        console.log(`Initialized cache with ${_totalFiles} files in ${Object.keys(_cache).length} folders`);
        return _imgPath;

    } catch (error) {
        console.error('Failed to initialize cache:', error);
        throw new Error(`Cache initialization failed: ${error.message}`);
    }
}

/**
 * Get file stats with symbolic link resolution
 */
function getFileStats(fullPath) {
    try {
        const lstat = fs.lstatSync(fullPath);
        if (lstat.isSymbolicLink()) {
            try {
                const linkTarget = fs.readlinkSync(fullPath);
                const realPath = path.resolve(path.dirname(fullPath), linkTarget);
                const targetStats = fs.statSync(realPath);
                return {
                    stats: targetStats,
                    resolvedPath: realPath,
                    isSymlink: true,
                    linkTarget
                };
            } catch (linkError) {
                console.warn(`Broken symlink at ${fullPath}:`, linkError);
                throw linkError;
            }
        }
        return {
            stats: lstat,
            resolvedPath: fullPath,
            isSymlink: false
        };
    } catch (error) {
        console.error(`Error getting file stats for ${fullPath}:`, error);
        throw error;
    }
}

/**
 * Set the limit for file processing
 */
function setLimit(limit) {
    if (!Number.isInteger(limit) || limit <= 0) {
        throw new Error("Limit must be a positive integer");
    }
    _limit = limit;
    const meta = db.get('__metadata__') || {};
    meta.limit = limit;
    db.put('__metadata__', meta);
}

/**
 * Get files from a specific folder with their generation data
 */
async function getFolderGenerations(folderName) {
    const files = getFolder(folderName)
        .filter(file => path.extname(file.file) !== '.json');
    
    return Promise.all(files.map(file => getGeneration(file, false)));
}

/**
 * Get the newest file's generation data
 */
async function getNewestGeneration() {
    let newestFile = null;

    db.keys().forEach(key => {
        if (key === '__metadata__') return;
        
        const file = db.get(key);
        if (!file.file.startsWith('info') && file.ext.toLowerCase() === '.png') {
            if (!newestFile || new Date(file.mtime) > new Date(newestFile.mtime)) {
                newestFile = file;
            }
        }
    });

    if (!newestFile) {
        throw new Error("No files found in cache");
    }

    return getGeneration(newestFile, false);
}

/**
 * Get a random generation from the database
 */
async function getRandomGeneration() {
    const files = [];
    db.keys().forEach(key => {
        if (key === '__metadata__') return;
        
        const file = db.get(key);
        if (!file.file.startsWith('info') && file.ext.toLowerCase() === '.png') {
            files.push(file);
        }
    });

    if (!files.length) {
        throw new Error("No files found in cache");
    }

    const randomFile = files[Math.floor(Math.random() * files.length)];
    return getGeneration(randomFile, true);
}

/**
 * Add a file to the cache
 */
async function addFile(folderName, fileName) {
    if (!_imgPath) {
        throw new Error("Cache not initialized");
    }

    const fileAbsolutePath = path.join(_imgPath, fileName);

    try {
        if (!fs.existsSync(fileAbsolutePath)) {
            throw new Error(`File does not exist: ${fileAbsolutePath}`);
        }

        const { stats, resolvedPath } = getFileStats(fileAbsolutePath);
        if (!stats.isFile()) {
            throw new Error(`Path is not a file: ${fileAbsolutePath}`);
        }

        const metadata = createFileMetadata(fileName, _imgPath, stats, resolvedPath);
        const key = `${folderName}:${fileName}`;

        // Update db
        db.put(key, metadata);

        // Update cache
        if (!_cache[folderName]) {
            _cache[folderName] = [];
        }
        _cache[folderName] = _cache[folderName].filter(item => item.file !== fileName);
        
        // Insert maintaining sort by mtime
        const insertIndex = _cache[folderName].findIndex(item => item.mtime > metadata.mtime);
        if (insertIndex === -1) {
            _cache[folderName].push(metadata);
        } else {
            _cache[folderName].splice(insertIndex, 0, metadata);
        }

        _totalFiles++;

        // Update metadata
        const dbMeta = db.get('__metadata__');
        dbMeta.totalFiles = _totalFiles;
        db.put('__metadata__', dbMeta);

        // Return generation data for added file
        return getGeneration(metadata);
    } catch (error) {
        console.error(`Failed to add file ${fileName}:`, error);
        throw error;
    }
}

/**
 * Remove and return the first file from a folder's cache
 */
async function shiftFile(folderName) {
    if (!_imgPath) {
        throw new Error("Cache not initialized");
    }

    // Get folder contents
    const files = getFolder(folderName);
    
    if (files.length === 0) {
        console.log(`Reloading cache for folder: ${folderName}`);
        refreshCache();
        return shiftFile(folderName);
    }

    const item = files.shift();
    if (item) {
        // Update cache
        _cache[folderName] = files;
        _totalFiles--;

        // Update db
        db.del(`${folderName}:${item.file}`);
        
        // Update metadata
        const metadata = db.get('__metadata__');
        metadata.totalFiles = _totalFiles;
        db.put('__metadata__', metadata);

        // Return generation data for shifted file
        return getGeneration(item);
    }

    return null;
}

// Public API
module.exports = {
    initCache,
    refreshCache,
    getCache: () => _cache ?? initCache(),
    getFolder,
    getFolderGenerations,
    getNewestGeneration,
    getRandomGeneration,
    getGeneration,
    addFile,
    shiftFile,
    imgPath: () => _imgPath ?? initCache(),
    totalFiles: () => _totalFiles,
    setLimit
};