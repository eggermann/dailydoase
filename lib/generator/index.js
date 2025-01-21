import os from 'os';
import magicPrompt from './magicPrompt.js';

const isOnServer = () => {
    const userHomeDir = os.homedir();
    //console.log('on uberspace ------>', userHomeDir, '<-------', (userHomeDir.indexOf('eggman') != -1))
    return (userHomeDir.indexOf('eggman') !== -1)
}

export default {

    fullFillPrompt: async (prompt) => {
        const mPrompt = await magicPrompt(prompt);
        //   console.log('Magic Prompt---->', mPprompt)
        const totalPrompt = mPrompt ? mPrompt : prompt;
        //    console.log('--> totalPrompt mPprompt: ', totalPrompt)
        return '' + totalPrompt;
    },
    setVersion: async (options) => {
        const model = options.model;

        if (isOnServer()) {
            model.scriptName = 'post-to-hugging.js';
        }

        const scriptPath = model.scriptName ?? 'post-to-hugging.js';

        return (await import("./" + scriptPath)).default.init(options);
    }
}
