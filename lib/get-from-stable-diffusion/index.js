const os = require('os');
const mPrmpt = require("./magicPrompt");
let model = null;
const isOnServer = () => {
    const userHomeDir = os.homedir();

    //console.log('on uberspace ------>', userHomeDir, '<-------', (userHomeDir.indexOf('eggman') != -1))

    return (userHomeDir.indexOf('eggman') != -1)
}
module.exports = {
    fullffillPrompt: async (totalPrompt) => {
        const mPprompt = await mPrmpt(totalPrompt)
        console.log('---->', mPprompt)
        totalPrompt = mPprompt ? mPprompt : totalPrompt;
        console.log('--> totalPrompt: ', totalPrompt)
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