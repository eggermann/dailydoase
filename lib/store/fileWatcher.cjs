const fs = require("fs");
const path = require("path");
const { JSON_EXTENSION } = require('./fileUtils.cjs');

class FileWatcher {
    constructor() {
        this._watchers = new Set();
    }

    /**
     * Watch directory for changes
     */
    watch(dir, onFileAdded) {
        if (this._watchers.has(dir)) return;

        try {
            const watcher = fs.watch(dir, { recursive: true }, (eventType, filename) => {
                if (!filename) return;
                
                const fullPath = path.join(dir, filename);
                if (eventType === 'rename') { // File/directory added or removed
                    if (fs.existsSync(fullPath)) {
                        if (!filename.toLowerCase().endsWith(JSON_EXTENSION)) {
                            const folderName = path.basename(path.dirname(fullPath));
                            onFileAdded(folderName, filename).catch(err => {
                                console.warn(`Failed to add new file ${filename}:`, err);
                            });
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