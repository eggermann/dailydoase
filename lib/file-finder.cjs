const path = require("path");
const fs = require("fs");
const store = require("./store.cjs");
const fileOperations = require("./file-operations.cjs");

// Constants for image handling
const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB limit
const CACHE_TIMEOUT = 60 * 1000; // 1 minute cache
const imageCache = new Map();

/**
 * Clean expired entries from cache
 * @private
 */
function cleanCache() {
    const now = Date.now();
    for (const [key, { timestamp }] of imageCache) {
        if (now - timestamp > CACHE_TIMEOUT) {
            imageCache.delete(key);
        }
    }
}

/**
 * File finding and newest file operations
 * @module file-finder
 */
const fileFinder = {
    /**
     * Gets the newest file from any folder in the cache
     * @returns {Promise<Object>} Object containing the newest file's data and metadata
     */
    async newestFile() {
        try {
            cleanCache();

            const cache = store.getCache();
            let newestFile = null;
            let newestFolder = null;

            // Find newest file across all folders
            Object.entries(cache).forEach(([folder, files]) => {
                if (!files.length) return;
                const validFiles = files.filter(file => {

                    return !file.file.startsWith('info')
                        && file.ext !== '.json' // Exclude JSON files
                }
                );
                //  console.log("validFiles...", validFiles);
                if (!validFiles.length) return;
                const lastFile = validFiles[validFiles.length - 1]; // Get last file (newest)
                if (!newestFile || lastFile.mtime > newestFile.mtime) {
                    newestFile = lastFile;
                    newestFolder = folder;
                }
            });

            if (!newestFile || !newestFolder) {
                throw new Error("No files found in cache");
            }

            // Get the paths
            const imgPath = await store.imgPath();
            const fullRelativePath = path.relative(imgPath, newestFile.fullPath);
            const filePath = path.basename(newestFile.fullPath);

            const jsonPathFile = filePath.replace(path.extname(filePath), '.json');
            const jsonPath = path.join(path.dirname(fullRelativePath), path.basename(jsonPathFile));


            // Check cache for image
            const cacheKey = fullRelativePath;
            const cached = imageCache.get(cacheKey);
            if (cached && Date.now() - cached.timestamp < CACHE_TIMEOUT) {
                return {
                    imageBase64: cached.data,
                    json: cached.json,
                    metadata: {
                        ...newestFile,
                        folderName: newestFolder,
                        filePath,
                        jsonPath
                    }
                };
            }

            // Check file size before loading
            const stats = await fs.promises.stat(path.join(imgPath, fullRelativePath));
            if (stats.size > MAX_IMAGE_SIZE) {
                throw new Error(`Image size exceeds limit: ${stats.size} bytes`);
            }


            //   console.log("LfullRelativePath...", fullRelativePath);
            let [imageBase64, jsonData] = await Promise.all([

                fileOperations.getFile(fullRelativePath),

                fileOperations.getJSON(jsonPath)
                    .catch(err => {
                        console.warn(`JSON file not found: ${jsonPath}`, err);
                        return JSON.stringify({});
                    })
            ]);

            imageBase64 = 'data:image/png;base64,' + imageBase64

            const result = {
                imageBase64,
                json: jsonData,
                metadata: {
                    ...newestFile,
                    folderName: newestFolder,
                    filePath,
                    jsonPath
                },
                timestamp: Date.now()
            };

            // Cache the result
            imageCache.set(cacheKey, {
                data: imageBase64,
                json: jsonPath,

            });

            return result;
        } catch (err) {
            console.error("newestFile error:", err);
            return { error: err.message };
        }
    },

    /**
     * Finds newest file or folder in a directory
     * @param {string} dir - Directory to search
     * @param {boolean} returnFiles - If true, return files; if false, return folders
     * @returns {Object|null} Object containing file info and mtime, or null if none found
     */
    getNewestFileOrFolder(dir, returnFiles) {
        try {
            const items = fs.readdirSync(dir)
                .filter(file => {
                    try {
                        if (file.startsWith('info')) return false;
                        const lstat = fs.lstatSync(path.join(dir, file));
                        return returnFiles ?
                            lstat.isFile() :
                            lstat.isDirectory();
                    } catch (err) {
                        console.warn(`Error accessing ${file}:`, err);
                        return false;
                    }
                })
                .map(file => {
                    const fullPath = path.join(dir, file);
                    return {
                        file,
                        mtime: fs.lstatSync(fullPath).mtime.getTime()
                    };
                });

            if (!items.length) return null;

            // Track file types if returning files
            if (returnFiles) {
                const fileTypes = new Map();
                items.forEach(item => {
                    const ext = path.extname(item.file).toLowerCase();
                    fileTypes.set(ext, (fileTypes.get(ext) || 0) + 1);
                });

                // Log file statistics
                const fileReport = Array.from(fileTypes.entries())
                    .map(([ext, count]) => `${count}${ext}`)
                    .join(' files and ');
                console.log(`Found ${fileReport} files in ${dir}`);
            }

            return items.reduce((latest, current) =>
                current.mtime > latest.mtime ? current : latest);
        } catch (err) {
            console.error(`Error in getNewestFileOrFolder for ${dir}:`, err);
            return null;
        }
    },

    /**
     * Gets the most recent file or folder with its metadata
     * @param {number} [indexImage=0] - Index of the image to return
     * @returns {Promise<Object>} Object containing image data and metadata
     */
    async mostRecentFileOrFolder(indexImage = 0) {
        try {
            cleanCache();

            const imgPath = await store.imgPath();
            const folder = this.getNewestFileOrFolder(imgPath, false);

            if (!folder) {
                throw new Error("No folders found in image path");
            }

            const folderPath = path.join(imgPath, folder.file);
            const files = fs.readdirSync(folderPath)
                .filter(file => !file.startsWith('info'));

            // Track file types
            const fileTypes = new Map();
            files.forEach(file => {
                const ext = path.extname(file).toLowerCase();
                fileTypes.set(ext, (fileTypes.get(ext) || 0) + 1);
            });

            // Log file statistics
            const fileReport = Array.from(fileTypes.entries())
                .map(([ext, count]) => `${count}${ext}`)
                .join(' files and ');
            console.log(`Found ${fileReport} files in ${folderPath}`);

            const nonJsonFiles = files
                .filter(file => !file.endsWith('.json'))
                .map(file => ({
                    file,
                    mtime: fs.lstatSync(path.join(folderPath, file)).mtime.getTime()
                }))
                .sort((a, b) => b.mtime - a.mtime); // Sort newest first

            if (!nonJsonFiles.length) {
                throw new Error(`No image files found in folder: ${folder.file}`);
            }

            // Ensure index wraps around
            const selectedFile = nonJsonFiles[indexImage % nonJsonFiles.length];
            const fullPath = path.join(folderPath, selectedFile.file);

            // Check cache
            const cacheKey = path.relative(imgPath, fullPath);
            const cached = imageCache.get(cacheKey);
            if (cached && Date.now() - cached.timestamp < CACHE_TIMEOUT) {
                return {
                    imageBase64: cached.data,
                    json: cached.json
                };
            }

            // Check file size
            const stats = await fs.promises.stat(fullPath);
            if (stats.size > MAX_IMAGE_SIZE) {
                throw new Error(`Image size exceeds limit: ${stats.size} bytes`);
            }

            const jsonPath = fullPath.replace(path.extname(fullPath), '.json');
            const [jsonData] = await Promise.all([
                fs.promises.readFile(fullPath, { encoding: "base64" })
            ]);


            const result = {
                //   imageBase64: `data:image/png;base64,${imageBase64}`,
                json: jsonData
            };

            // Cache the result
            imageCache.set(cacheKey, {
                // data: imageBase64,
                jsonData,
                timestamp: Date.now()
            });

            return result;
        } catch (err) {
            console.error("mostRecentFileOrFolder error:", err);
            return { error: err.message };
        }
    }
};

module.exports = fileFinder;