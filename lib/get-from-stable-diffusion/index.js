import os from 'os';
import mPrmpt from './magicPrompt.js';

import createDirWhenNotExist from '../helper/createDirWhenNotExist.js';

const isOnServer = () => {
    const userHomeDir = os.homedir();

    //console.log('on uberspace ------>', userHomeDir, '<-------', (userHomeDir.indexOf('eggman') != -1))

    return (userHomeDir.indexOf('eggman') != -1)
}

export default {

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
        //    name = 'huggin';
        //  console.log('midjourneyReplica',name)

        let model = null;


        switch (name) {
            case 'huggin':
                model = (await import("./post-to-huggin.js")).default.init();
                break;
            case 'webUi':
                model = (await import("./post-to-webUi.js")).default.init();
                break;
            case 'midjourneyReplica':
                //off     model = await import("./post-to-midjourny-replica.js");
                break;
            case 'midjourney':
                model = (await import("./post-to-midjourney.js")).default.init();
                break;
            case 'youtube':
                model = (await import("./post-to-youtube.js")).default.init();
                break;
            case 'dailymotion':
                model = (await import("./post-to-dailymotion.js")).default.init();
                break;
        }

        return model;
    }
}
