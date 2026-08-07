const fs = require("fs");
class FileWatcher {
    constructor() {
        this._watchers = new Map();
        this._refreshTimers = new Map();
    }

    /**
     * Refresh once after a burst of filesystem changes.
     *
     * Publishing a trailer creates a folder and then copies several files. A
     * single delayed rescan keeps the cache correct without polling or doing a
     * full scan for every individual filesystem event.
     */
    scheduleRefresh(ctx) {
        if (this._refreshTimers.has(ctx)) {
            clearTimeout(this._refreshTimers.get(ctx));
        }

        const timer = setTimeout(() => {
            this._refreshTimers.delete(ctx);
            ctx.refreshFromFilesystem();
        }, 750);

        this._refreshTimers.set(ctx, timer);
    }

    /**
     * Watch one directory. Each existing directory gets its own non-recursive
     * watcher: recursive fs.watch is unavailable on the Linux production host.
     */
    watch(dir, ctx) {
        if (process.env.DISABLE_FILE_WATCH === '1' || this._watchers.has(dir)) return;

        try {
            const watcher = fs.watch(dir, (eventType, filename) => {
                if (filename === '.DS_Store') return;
                this.scheduleRefresh(ctx);
            });

            this._watchers.set(dir, watcher);

            watcher.on('error', (error) => {
                console.error(`Watch error on ${dir}:`, error);
                this.unwatch(dir);
                if (error && (error.code === 'EMFILE' || error.code === 'ENOSPC')) {
                    return;
                }
                // Try to re-establish the watch after a delay
                setTimeout(() => this.watch(dir, ctx), 5000);
            });
        } catch (error) {
            console.error(`Failed to watch directory ${dir}:`, error);
        }
    }

    unwatch(dir) {
        const watcher = this._watchers.get(dir);
        if (!watcher) return;
        try {
            watcher.close();
        } catch (_) {
            // ignore close failures
        }
        this._watchers.delete(dir);
    }

    /**
     * Clear all watchers
     */
    clearWatchers() {
        for (const [dir] of this._watchers) {
            this.unwatch(dir);
        }

        for (const timer of this._refreshTimers.values()) {
            clearTimeout(timer);
        }
        this._refreshTimers.clear();
    }

    /**
     * Check if a directory is being watched
     */
    isWatching(dir) {
        return this._watchers.has(dir);
    }
}

module.exports = new FileWatcher();
