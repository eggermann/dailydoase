import os from 'os';
import fs from 'fs-extra';
import mPrmpt from './magicPrompt.js';

import createDirWhenNotExist from '../helper/createDirWhenNotExist.js';

let model = null;
const isOnServer = () => {
    const userHomeDir = os.homedir();

    //console.log('on uberspace ------>', userHomeDir, '<-------', (userHomeDir.indexOf('eggman') != -1))

    return (userHomeDir.indexOf('eggman') != -1)
}

export default {
    handleNewSerie: (path, options) => {
        if (createDirWhenNotExist(path)) {
            if (options) {
                fs.writeFileSync(path + '/info.json', JSON.stringify(options), 'utf-8');
                options.info && delete options.info;
            }
        }
        ;
    },
    fullFillPrompt: async (prompt) => {
        const mPprompt = await mPrmpt(prompt);
        //   console.log('Magic Prompt---->', mPprompt)
        const totalPrompt = mPprompt ? mPprompt : prompt;
        //    console.log('--> totalPrompt mPprompt: ', totalPrompt)
        return totalPrompt;
    },
    setVersion: async (name) => {
        if (isOnServer()) {
            name = 'huggin';
        }//or unreachable webui.sh
        // name = 'huggin';
        //  console.log('midjourneyReplica',name)

        switch (name) {
            case 'huggin':
                model = await import("./post-to-huggin");
                break;
            case 'webUi':
                model = await import("./post-to-webUi.js");
                break;
            case 'midjourneyReplica':
                model = await import("./post-to-midjourny-replica.js");
                break;
            case 'midjourney':
                model = await import("./post-to-midjourney.js");
                break;
        }

        return model;
    }
}
