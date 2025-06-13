const fs = require("fs");
const path = require("path");
const { JSON_EXTENSION } = require('./fileUtils.cjs');
const cacheManager = require('./cacheManager.cjs');

class FileWatcher {
    constructor() {
        this._watchers = new Set();
    }

    /**
     * Watch directory for changes
     */
    watch(dir, ctx) {
        if (this._watchers.has(dir)) return;

        try {
            const watcher = fs.watch(dir, { recursive: true }, (eventType, filename) => {
                if (!filename) return;

                console.log(`[fileWatcher] eventType: ${eventType}, filename: ${filename}`);
// Only process events where filename is just the file, not a relative path
                if (filename !== path.basename(filename)) return;


                const cleanPath = (p) => p.replace(/GENERATIONS[\/\\]GENERATIONS/, 'GENERATIONS');
                const dirPath = cleanPath(dir);
                const fullPath = cleanPath(path.join(dirPath, filename));
                const relativePath = path.relative(dirPath, path.dirname(fullPath));
                const folderName = relativePath || path.basename(dirPath);


                // Clean up the paths by removing any duplicate GENERATIONS segments



                if (eventType === 'rename') { // File/directory added or removed
                    // Skip directory events, only handle file events

                    let stats;
                    try {
                        stats = fs.statSync(fullPath);
                    } catch (err) {
                        if (err.code === 'ENOENT') {
                            // File was removed
                            const justFileName = path.basename(filename);
                     console.log('-->justFileName', justFileName);

                           ctx.removeFile(folderName, justFileName)
                            return;
                        };
                        throw err;
                    }
                    if (!stats.isFile()) return;

                    if (fs.existsSync(fullPath)) {
                        if (!filename.toLowerCase().endsWith(JSON_EXTENSION)) {
                            // Get the folder name relative to the watched directory

                            const justFileName = path.basename(filename);
                            // Only add if not already in cache
                            if (!ctx.getFolder(folderName).some(meta => meta.fileName === justFileName)) {
                                ctx.addFile(folderName, justFileName).catch(err => {

                                    console.warn(`Failed to add new file ${justFileName}:`, err);
                                });
                            }
                        }
                    }
                }
            });

            this._watchers.add(dir);
            console.log(`Watching directory: ${dir}`);

            watcher.on('error', (error) => {
                console.error(`Watch error on ${dir}:`, error);
                this._watchers.delete(dir);
                // Try to re-establish the watch after a delay
                setTimeout(() => this.watch(dir, onFileAdded), 5000);
            });
        } catch (error) {
            console.error(`Failed to watch directory ${dir}:`, error);
        }
    }

    /**
     * Clear all watchers
     */
    clearWatchers() {
        for (const dir of this._watchers) {
            this._watchers.delete(dir);
        }
    }

    /**
     * Check if a directory is being watched
     */
    isWatching(dir) {
        return this._watchers.has(dir);
    }
}

module.exports = new FileWatcher();