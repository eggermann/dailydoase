import os from 'os';
import magicPrompt from './magicPrompt.js';

const isOnServer = () => {
    const userHomeDir = os.homedir();
    //console.log('on uberspace ------>', userHomeDir, '<-------', (userHomeDir.indexOf('eggman') != -1))
    return (userHomeDir.indexOf('eggman') !== -1)
}

export default {

    fullFillPrompt: async (prompt) => {
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
            const scriptName = isOnServer() ? 'post-to-hugging.js' : (model.scriptName ?? 'post-to-hugging.js');
           
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

            return instance;
        } catch (error) {
            console.error('Error in setVersion:', error);
            throw error;
        }
    }
}
