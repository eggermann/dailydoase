
const fs = require("fs");
const path = require("path");
const { ensureDirectoryExists } = require("./server/helpers.cjs");

// Constants
const DEFAULT_LIMIT = 10;
const PNG_EXTENSION = ".png";
const JSON_EXTENSION = ".json";
const GENERATIONS_PATH = path.resolve(__dirname, '../GENERATIONS');

/**
 * Cache structure for storing file metadata
 * @typedef {Object} FileMetadata
 * @property {string} file - File name
 * @property {string} ext - File extension
 * @property {string} fullPath - Absolute file path
 * @property {string} url - Relative URL path
 * @property {Date} mtime - Last modified time
 * @property {string} jsonPath - Path to associated JSON file
 */

/**
 * @type {Object.<string, FileMetadata[]>}
 */
let _cache = Object.create(null);
let _totalFiles = 0;
let _imgPath = null;
let _limit = DEFAULT_LIMIT;

/**
 * Set the limit for file processing
 * @param {number} limit - Maximum number of files to process
 * @throws {Error} If limit is not a positive number
 */
function setLimit(limit) {
    if (!Number.isInteger(limit) || limit <= 0) {
        throw new Error("Limit must be a positive integer");
    }
    _limit = limit;
}

/**
 * Get file stats with symbolic link resolution
 * @param {string} fullPath - Path to the file
 * @returns {Object} File stats and resolved path
 */
function getFileStats(fullPath) {
    try {
        const lstat = fs.lstatSync(fullPath);
        if (lstat.isSymbolicLink()) {
            try {
                const linkTarget = fs.readlinkSync(fullPath);
                const realPath = path.resolve(path.dirname(fullPath), linkTarget);
                const targetStats = fs.statSync(realPath); // Use statSync to follow symlinks
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
 * Create file metadata object
 * @param {string} fileName - Name of the file
 * @param {string} basePath - Base path for the file
 * @param {Object} stats - File stats
 * @param {string} resolvedPath - Resolved file path
 * @returns {FileMetadata}
 */
function createFileMetadata(fileName, basePath, stats, resolvedPath) {
    return {
        file: fileName,
        ext: path.extname(fileName),
        fullPath: resolvedPath,
        url: resolvedPath.split(basePath)[1],
        mtime: stats.mtime,
        jsonPath: resolvedPath.replace(PNG_EXTENSION, JSON_EXTENSION),
    };
}

/**
 * Scans a folder recursively for files and subfolders
 * @param {string} folderAbsolutePath - Absolute path to folder
 * @param {Object} options - Scan options
 * @param {boolean} [options.recursive=false] - Whether to scan recursively
 * @param {function} [options.filterFn] - Custom filter function for items
 * @returns {FileMetadata[]} Array of file and folder metadata objects
 */
function scanFolderForFilesAndFolder(folderAbsolutePath, options = {}) {
    const { recursive = false, filterFn } = options;
    console.log(`Scanning folder: ${folderAbsolutePath}, recursive: ${recursive}`);

    try {
        const items = fs.readdirSync(folderAbsolutePath, { withFileTypes: true });
        let results = [];

        // Track all file types
        const fileTypes = new Map();

        // Process all files in current directory
        items
            .filter(dirent => !dirent.name.startsWith('.') && dirent.isFile())
            .forEach(dirent => {
                const ext = path.extname(dirent.name).toLowerCase();
                fileTypes.set(ext, (fileTypes.get(ext) || 0) + 1);

                // Only process PNG files for results
                if (ext === PNG_EXTENSION) {
                 
                }

                const fullPath = path.join(folderAbsolutePath, dirent.name);

           


                try {
                    const { stats, resolvedPath } = getFileStats(fullPath);
                    const metadata = createFileMetadata(dirent.name, folderAbsolutePath, stats, resolvedPath);
                   
                    if (metadata) {
                        results.push(metadata);
                        results.sort((a, b) => a.mtime - b.mtime); // Keep results sorted by mtime
                    }
                } catch (error) {
                    console.warn(`Skipping ${dirent.name} due to error:`, error);
                }
            });


        // Log file type statistics
        const fileReport = Array.from(fileTypes.entries())
            .map(([ext, count]) => `${count}${ext} files`)
            .join(' and ');
        if (fileReport) {
            console.log(`Found ${fileReport} in ${folderAbsolutePath}`);
        }

        // If recursive, process subdirectories
        if (recursive) {
            const subDirs = items.filter(dirent =>
                !dirent.name.startsWith('.') && (dirent.isDirectory() || dirent.isSymbolicLink())
            );

            for (const dir of subDirs) {
                const fullPath = path.join(folderAbsolutePath, dir.name);
                try {
                    const { stats, resolvedPath, isSymlink } = getFileStats(fullPath);

                    // Only process if it's a directory or a symlink to a directory
                    if (stats.isDirectory()) {
                        console.log(`Processing ${isSymlink ? 'symlinked ' : ''}directory: ${dir.name}`);
                        const subResults = scanFolderForFilesAndFolder(resolvedPath, {
                            recursive: true,
                            filterFn
                        });

                        // Only include results if directory has files
                        if (subResults.length > 0) {
                            // Sort results by modification time before concatenating
                            subResults.sort((a, b) => a.mtime - b.mtime);
                            results = results.concat(subResults);
                        }
                    }
                } catch (error) {
                    console.warn(`Skipping ${dir.name}: ${error.message}`);
                }
            }
        }

        if (results.length > 0) {
            console.log(`Found ${results.length} files in ${folderAbsolutePath}`);
        }
        return results;
    } catch (error) {
        console.error(`Error scanning folder ${folderAbsolutePath}:`, error);
        return [];
    }
}

/**
 * Initialize the cache by scanning the image directory
 * @param {string} imageDir - Image directory path
 * @returns {string} Initialized image path
 * @throws {Error} If directory initialization fails
 */
function initCache(imageDir = GENERATIONS_PATH) {
    imageDir = imageDir || GENERATIONS_PATH;
    console.log('Initializing cache with directory:', imageDir);

    if (!imageDir) {
        throw new Error("Image directory path is required");
    }

    try {
        _cache = {};
        _imgPath = imageDir;
        _totalFiles = 0;

        ensureDirectoryExists(_imgPath);
        console.log('Directory verified at:', _imgPath);

        // Collect all directories to process
        const allFolders = new Set();

        // First check the root directory
        const items = fs.readdirSync(_imgPath, { withFileTypes: true });
        console.log('Found items in root:', items.map(i => i.name).join(', '));

        // Check for and process 'images' directory first
        const imagesDir = items.find(item => (item.isDirectory() || item.isSymbolicLink()) && item.name === 'images');
        if (imagesDir) {
            const imagesPath = path.join(_imgPath, 'images');
            try {
                const { resolvedPath, isSymlink } = getFileStats(imagesPath);
                console.log(`Found images ${isSymlink ? 'symlink' : 'directory'}, scanning contents...`);

                // Use resolved path for symlinks
                const imageContents = fs.readdirSync(resolvedPath, { withFileTypes: true });
                imageContents
                    .filter(dirent => dirent.isDirectory() || dirent.isSymbolicLink())
                    .forEach(dirent => {
                        const subfolderPath = path.join('images', dirent.name);
                        allFolders.add(subfolderPath);
                        console.log('Added subfolder from images:', subfolderPath);
                    });
            } catch (error) {
                console.error('Error scanning images directory:', error);
            }
        }

        // Add root-level directories and symlinks (except 'images')
        items
            .filter(dirent => {
                const isValidDir = dirent.isDirectory() || dirent.isSymbolicLink();
                const notImages = dirent.name !== 'images';
                const notHidden = !dirent.name.startsWith('.');
                return isValidDir && notImages && notHidden;
            })
            .forEach(dirent => {
                const fullPath = path.join(_imgPath, dirent.name);
                try {
                    const { stats, resolvedPath, isSymlink } = getFileStats(fullPath);
                    if (stats.isDirectory()) {
                        allFolders.add(dirent.name);
                        console.log(`Added root ${isSymlink ? 'symlink' : 'folder'}: ${dirent.name} => ${isSymlink ? resolvedPath : 'N/A'}`);
                    }
                } catch (error) {
                    console.warn(`Skipping inaccessible ${dirent.name}:`, error);
                }
            });

        console.log(`Found total folders to process: ${allFolders.size} (including symlinks)`);

        // Process all collected folders
        for (const folderPath of allFolders) {
            const fullPath = path.join(_imgPath, folderPath);
            console.log(`Processing folder: ${folderPath}`);

            try {
                const files = scanFolderForFilesAndFolder(fullPath, {
                    recursive: true,
                    filterFn: (dirent, stats) => stats.isFile() && dirent.name.toLowerCase()
                    //.endsWith(PNG_EXTENSION)
                });

                const folderName = folderPath.includes(path.sep) ?
                    folderPath.split(path.sep).pop() :
                    folderPath;

                if (files.length > 0) {
                    // Sort files by modification time (oldest first)
                    files.sort((a, b) => a.mtime - b.mtime);
                    console.log(`Adding ${files.length} files from ${folderName}`);
                    _cache[folderName] = files;
                    _totalFiles += files.length;
                } else {
                    console.log(`No PNG files found in ${folderName}`);
                }
            } catch (error) {
                console.error(`Error processing folder ${folderPath}:`, error);
            }
        }

        console.log('Cache initialization complete');
        console.log('Cached folders:', Object.keys(_cache).join(', '));
        console.log('Total files:', _totalFiles);

        return _imgPath;
    } catch (error) {
        console.error('Failed to initialize cache:', error);
        throw new Error(`Cache initialization failed: ${error.message}`);
    }
}

/**
 * Refresh the entire cache
 * @throws {Error} If refresh is called before initialization
 */
function refreshCache() {
    if (!_imgPath) {
        throw new Error("Cannot refresh cache: not initialized");
    }
    return initCache(_imgPath);
}

/**
 * Get files from a specific folder
 * @param {string} folderName - Name of the folder
 * @returns {FileMetadata[]} Array of file metadata
 */
function getFolder(folderName) {
    return _cache[folderName] || [];
}

/**
 * Add a file to the cache
 * @param {string} folderName - Target folder name
 * @param {string} fileName - File name to add
 * @throws {Error} If cache is not initialized or file operations fail
 */
function addFile(folderName, fileName) {
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

        if (!_cache[folderName]) {
            _cache[folderName] = [];
        }

        // Remove existing entry if present
        _cache[folderName] = _cache[folderName].filter(item => item.file !== fileName);

        const metadata = createFileMetadata(fileName, _imgPath, stats, resolvedPath);
        
        // Insert new file in sorted order by mtime (oldest first)
        const insertIndex = _cache[folderName].findIndex(item => item.mtime > metadata.mtime);
        if (insertIndex === -1) {
            _cache[folderName].push(metadata); // Add to end if newest
        } else {
            _cache[folderName].splice(insertIndex, 0, metadata);
        }
        _totalFiles++;

        console.log(`Added file "${fileName}" to folder "${folderName}"`);
    } catch (error) {
        console.error(`Failed to add file ${fileName}:`, error);
        throw error;
    }
}

/**
 * Remove and return the first file from a folder's cache
 * @param {string} folderName - Target folder name
 * @returns {FileMetadata|null} First file metadata or null
 */
function shiftFile(folderName) {
    if (!_imgPath) {
        throw new Error("Cache not initialized");
    }

    if (!_cache[folderName]) {
        _cache[folderName] = [];
    }

    let item = _cache[folderName].shift();

    if (!item) {
        console.log(`Reloading cache for folder: ${folderName}`);
        initCache(_imgPath);
        item = _cache[folderName]?.shift() || null;
    }

    if (item) {
        _totalFiles--;
    }

    return item;
}

// Public API
module.exports = {
    initCache,
    refreshCache,
    getCache: () => _cache ?? initCache(),
    getFolder,
    addFile,
    shiftFile,
    imgPath: () => _imgPath ?? initCache(),
    totalFiles: () => _totalFiles,
    setLimit
};