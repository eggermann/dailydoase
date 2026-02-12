import os from 'os';
import fs from 'fs-extra';
import path from 'path';
import magicPrompt from './magicPrompt.js';
import store from '../store.cjs';

const isOnServer = () => {
    const userHomeDir = os.homedir();
    //console.log('on uberspace ------>', userHomeDir, '<-------', (userHomeDir.indexOf('eggman') != -1))
    return (userHomeDir.indexOf('eggman') !== -1)
}

export default {

    XXXfullFillPrompt: async (prompt) => {
        console.log('fullFillPromptfullFillPromptfullFillPromptfullFillPromptfullFillPromptfullFillPrompt')
        process.exit();
        // process.exit();
        try {
            const mPrompt = await magicPrompt(prompt);
            return mPrompt || prompt;
        } catch (error) {
            console.error('Error in fullFillPrompt:', error);
            return prompt;
        }
    },

    setVersion: async (options) => {
        try {
            const model = options.model;

            //server broke TODO
            const scriptName = model.scriptName ?? 'post-to-hugging.js';

            // Use a cache to avoid re-importing the same script module
            if (!globalThis._scriptModuleCache) {
                globalThis._scriptModuleCache = {};
            }

            const cache = globalThis._scriptModuleCache;
            let scriptModule = cache[scriptName];

            if (!scriptModule) {
                scriptModule = await import(`./${scriptName}`);
                cache[scriptName] = scriptModule;
            }

            const instance = await scriptModule.default.init(options);

            // Reuse last folder if words match and refresh !== true
            try {
                const wantRefresh = options.refresh === true || options.model?.refresh === true;
                const words = options.words;
                if (!wantRefresh && Array.isArray(words) && words.length > 0) {
                    const baseDir = store.imgPath();
                    const match = await (async () => {
                        if (!baseDir || !(await fs.pathExists(baseDir))) return null;
                        const entries = await fs.readdir(baseDir);
                        // Sort folders by mtime desc so we hit newest first
                        const withTimes = await Promise.all(entries.map(async (name) => {
                            const p = path.join(baseDir, name);
                            try {
                                const st = await fs.stat(p);
                                return st.isDirectory() ? { name, path: p, mtime: st.mtimeMs } : null;
                            } catch { return null; }
                        }));
                        const folders = withTimes.filter(Boolean).sort((a, b) => b.mtime - a.mtime);
                        const eq = (a, b) => {
                            try { return JSON.stringify(a) === JSON.stringify(b); } catch { return false; }
                        };
                        for (const f of folders) {
                            const infoPath = path.join(f.path, 'info.json');
                            try {
                                const txt = await fs.readFile(infoPath, 'utf-8');
                                const json = JSON.parse(txt);
                                if (json && Array.isArray(json.words) && eq(json.words, words)) {
                                    return f.path;
                                }
                            } catch { /* ignore */ }
                        }
                        return null;
                    })();

                    if (match) {
                        instance.imageDir = match;
                        // Mark as initialized so PostTo.checkSignature does not create a new folder
                        instance.firstTime = true;
                        console.log('\x1b[33m[generator.setVersion]\x1b[0m Reusing existing folder for same words:', match);
                    }
                }
            } catch (err) {
                console.warn('[generator.setVersion] reuse check failed:', err?.message || err);
            }

            return instance;
        } catch (error) {
            console.error('Error in setVersion:', error);
            throw error;
        }
    }
}
