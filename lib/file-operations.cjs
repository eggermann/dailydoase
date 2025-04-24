const path = require("path");
const fs = require("fs");
const store = require("./store.cjs");

/**
 * File operation utility functions
 * @module file-operations
 */
const fileOperations = {
    /**
     * Checks and manages file limit in a folder, deleting oldest files if limit is exceeded
     * @param {string} folderPath - Path to the folder to check
     * @param {number} limit - Maximum number of files allowed
     * @returns {number} Number of files deleted
     */
    checkFileLimit(folderPath, limit) {
        try {
            const files = fs.readdirSync(folderPath);
            if (files.length <= limit) return 0;

            // Track all file types
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

            // Create an array of file paths with their stats
            const fileStats = files.map(file => {
                const filePath = path.join(folderPath, file);
                try {
                    const stats = fs.statSync(filePath);
                    return { file: filePath, mtime: stats.mtime };
                } catch (err) {
                    console.error(`Failed to get stats for ${filePath}:`, err);
                    return null;
                }
            }).filter(Boolean);

            // Sort files by modified time (oldest first)
            fileStats.sort((a, b) => a.mtime - b.mtime);

            const filesToDelete = fileStats.length - limit;
            let deletedCount = 0;

            // Delete oldest files
            for (let i = 0; i < filesToDelete; i++) {
                try {
                    fs.unlinkSync(fileStats[i].file);
                    deletedCount++;
                    console.log(`Deleted file: ${fileStats[i].file}`);
                } catch (err) {
                    console.error(`Failed to delete ${fileStats[i].file}:`, err);
                }
            }

            return deletedCount;
        } catch (err) {
            console.error(`Error in checkFileLimit for ${folderPath}:`, err);
            throw err;
        }
    },

    /**
     * Reads and parses a JSON file from the image directory
     * @param {string} dir - Relative path within the image directory
     * @returns {Promise<Object>} Parsed JSON data
     */
    async getJSON(dir) {
        try {
            const p = path.join(await store.imgPath(), dir);
            const data = await fs.promises.readFile(p, "utf-8");
            return JSON.parse(data);
        } catch (e) {
            console.error(`getJSON error for ${dir}:`, e);
            return {};
        }
    },

    /**
     * Reads a file as base64 from the image directory
     * @param {string} dir - Relative path within the image directory
     * @returns {Promise<string>} Base64 encoded file content
     */
    async getFile(dir) {
        try {
            const p = path.join(await store.imgPath(), dir);
            return await fs.promises.readFile(p, { encoding: "base64" });
        } catch (e) {
            console.error(`getFile error for ${dir}:`, e);
            throw e;
        }
    }
};

module.exports = fileOperations;