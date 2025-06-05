const path = require("path");
const fs = require("fs");
const { JSON_EXTENSION } = require('./fileUtils.cjs');
const { getFileStats, createFileMetadata, getGeneration } = require('./fileUtils.cjs');
const fileWatcher = require('./fileWatcher.cjs');

class CacheManager {
    constructor() {
        this._cache = Object.create(null);
        this._totalFiles = 0;
        this._imgPath = null;
    }

    /**
     * Get folder contents
     */
    getFolder(folderName) {
        return this._cache[folderName] || [];
    }

    /**
     * Process a single file
     */
    processFile(file, dir) {
        const fullPath = path.join(dir, file);
        if (file.toLowerCase().endsWith(JSON_EXTENSION)) return;
        
        try {
            const { stats, resolvedPath } = getFileStats(fullPath);
            const metadata = createFileMetadata(file, this._imgPath, stats, resolvedPath);
            const folderName = path.basename(dir);

            if (!this._cache[folderName]) {
                this._cache[folderName] = [];
            }

            this._cache[folderName].push(metadata);
            this._cache[folderName].sort((a, b) => a.mtime - b.mtime);
            this._totalFiles++;
        } catch (error) {
            console.warn(`Skipping file ${file}:`, error);
        }
    }

    /**
     * Scan directory recursively
     */
    scanDir(dir) {
        try {
            const normalizedDir = path.normalize(dir);
            
            if (!fs.existsSync(normalizedDir)) {
                console.warn(`Directory does not exist: ${normalizedDir}`);
                return;
            }

            // Check if we're not going deeper than GENERATIONS/images
            if (normalizedDir.split(path.sep).filter(p => p === 'images').length > 1) {
                console.warn(`Skipping nested images directory: ${normalizedDir}`);
                return;
            }

            // Start watching this directory
            fileWatcher.watch(normalizedDir, (folderName, filename) => this.addFile(folderName, filename));

            const items = fs.readdirSync(normalizedDir);
            console.log(`Scanning directory: ${normalizedDir}, found ${items.length} items`);

            for (const item of items) {
                if (item.startsWith('.')) continue;

                try {
                    const fullPath = path.join(normalizedDir, item);
                    const stats = fs.statSync(fullPath);

                    if (stats.isDirectory()) {
                        this.scanDir(fullPath);
                    } else if (stats.isFile()) {
                        this.processFile(item, normalizedDir);
                    }
                } catch (itemError) {
                    console.warn(`Error processing item ${item} in ${normalizedDir}:`, itemError);
                    continue;
                }
            }
        } catch (error) {
            console.error(`Error scanning directory ${dir}:`, error);
            throw new Error(`Failed to scan directory ${dir}: ${error.message}`);
        }
    }

    /**
     * Initialize or refresh the cache
     */
    initialize(imageDir) {
        console.log('Initializing cache with directory:', imageDir);

        if (!imageDir) {
            throw new Error("Image directory path is required");
        }

        try {
            fileWatcher.clearWatchers();
            this._cache = {};
            this._imgPath = imageDir;
            this._totalFiles = 0;

            this.scanDir(this._imgPath);

            console.log(`Initialized cache with ${this._totalFiles} files in ${Object.keys(this._cache).length} folders`);
            return this._imgPath;
        } catch (error) {
            console.error('Failed to initialize cache:', error);
            throw new Error(`Cache initialization failed: ${error.message}`);
        }
    }

    /**
     * Add a file to the cache
     */
    async addFile(folderName, fileName) {
        if (!this._imgPath) {
            throw new Error("Cache not initialized");
        }

        // Ensure paths are cleaned and normalized
        const cleanPath = (p) => p.replace(/GENERATIONS[\/\\]GENERATIONS/, 'GENERATIONS')
                                .replace(/^GENERATIONS[\/\\]/, '');
                                
        // Normalize folder name
        const normalizedFolderName = cleanPath(folderName);
        
        // Construct absolute path without duplicating GENERATIONS
        const fileAbsolutePath = path.join(this._imgPath, normalizedFolderName, path.basename(fileName));
        
        console.log('Adding file:', {
            imgPath: this._imgPath,
            folderName: normalizedFolderName,
            fileName: path.basename(fileName),
            fileAbsolutePath
        });

        try {
            if (!fs.existsSync(fileAbsolutePath)) {
                throw new Error(`File does not exist: ${fileAbsolutePath}`);
            }

            const { stats, resolvedPath } = getFileStats(fileAbsolutePath);
            if (!stats.isFile()) {
                throw new Error(`Path is not a file: ${fileAbsolutePath}`);
            }

            const metadata = createFileMetadata(fileName, this._imgPath, stats, resolvedPath);

            if (!this._cache[folderName]) {
                this._cache[folderName] = [];
            }
            this._cache[folderName] = this._cache[folderName].filter(item => item.file !== fileName);
            
            const insertIndex = this._cache[folderName].findIndex(item => item.mtime > metadata.mtime);
            if (insertIndex === -1) {
                this._cache[folderName].push(metadata);
            } else {
                this._cache[folderName].splice(insertIndex, 0, metadata);
            }

            this._totalFiles++;

            return getGeneration(metadata);
        } catch (error) {
            console.error(`Failed to add file ${fileName}:`, error);
            throw error;
        }
    }

    /**
     * Remove and return the first file from a folder's cache
     */
    async shiftFile(folderName) {
        if (!this._imgPath) {
            throw new Error("Cache not initialized");
        }

        const files = this.getFolder(folderName);
        
        if (files.length === 0) {
            console.log(`Reloading cache for folder: ${folderName}`);
            this.initialize(this._imgPath);
            return this.shiftFile(folderName);
        }

        const item = files.shift();
        if (item) {
            this._cache[folderName] = files;
            this._totalFiles--;
            return getGeneration(item);
        }

        return null;
    }

    /**
     * Get files from a specific folder with their generation data
     */
    async getFolderGenerations(folderName) {
        const files = this.getFolder(folderName)
            .filter(file => !file.file.toLowerCase().endsWith(JSON_EXTENSION));
        
        return Promise.all(files.map(file => getGeneration(file, false)));
    }

    /**
     * Get the newest file's generation data
     */
    async getNewestGeneration() {
        let newestFile = null;

        Object.values(this._cache).forEach(folderFiles => {
            folderFiles.forEach(file => {
                const fileName = path.basename(file.fullPath);
                if (!fileName.startsWith('info') && !fileName.toLowerCase().endsWith(JSON_EXTENSION)) {
                    if (!newestFile || new Date(file.mtime) > new Date(newestFile.mtime)) {
                        newestFile = {
                            ...file,
                            file: fileName
                        };
                    }
                }
            });
        });

        if (!newestFile) {
            throw new Error("No files found in cache");
        }

        return getGeneration(newestFile, false);
    }

    /**
     * Get a random generation from the cache
     */
    async getRandomGeneration() {
        const files = [];
        Object.values(this._cache).forEach(folderFiles => {
            folderFiles.forEach(file => {
                const fileName = path.basename(file.fullPath);
                if (!fileName.startsWith('info') && !fileName.toLowerCase().endsWith(JSON_EXTENSION)) {
                    files.push({
                        ...file,
                        file: fileName
                    });
                }
            });
        });

        if (!files.length) {
            throw new Error("No files found in cache");
        }

        const randomFile = files[Math.floor(Math.random() * files.length)];
        return getGeneration(randomFile, true);
    }

    getCache() {
        return this._cache;
    }

    getTotalFiles() {
        return this._totalFiles;
    }

    getImgPath() {
        return this._imgPath;
    }
}

module.exports = new CacheManager();