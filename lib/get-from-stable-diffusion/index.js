const os = require('os');
const mPrmpt = require("./magicPrompt");
const createDirWhenNotExist = require('../helper/createDirWhenNotExist');
const fs = require("fs-extra");

const chalk = require('chalk');
let model = null;
const isOnServer = () => {
    const userHomeDir = os.homedir();

    //console.log('on uberspace ------>', userHomeDir, '<-------', (userHomeDir.indexOf('eggman') != -1))

    return (userHomeDir.indexOf('eggman') != -1)
}


module.exports = {
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
        const mPprompt = await mPrmpt(prompt) ;
     //   console.log('Magic Prompt---->', mPprompt)
       const totalPrompt = mPprompt ? mPprompt : prompt;
    //    console.log('--> totalPrompt mPprompt: ', totalPrompt)
        return totalPrompt;
    },
    setVersion: (name) => {
        if (isOnServer()) {
            name = 'huggin';
        }//or unreachable webui.sh
        // name = 'huggin';
        //  console.log('midjourneyReplica',name)

        switch (name) {
            case 'huggin':
                model = require("./post-to-huggin");
                break;
            case 'webUi':
                model = require("./post-to-webUi.js");
                break;
            case 'midjourneyReplica':
                model = require("./post-to-midjourny-replica.js");
                break;
        }

        return model;
    }
}