

const os=require('os');
let model = null;
const isOnServer = () => {
    const userHomeDir = os.homedir();

    //console.log('on uberspace ------>', userHomeDir, '<-------', (userHomeDir.indexOf('eggman') != -1))

    return (userHomeDir.indexOf('eggman') != -1)
}
module.exports = {
    setVersion: (name) => {
        if (isOnServer()) {
            name = 'huggin';
        }

        switch (name) {
            case 'huggin':
                model = require("./post-to-huggin");
                break;
            case 'webUi':
                model = require("./post-to-webUi.js");
                break;
        }

        return model;
    }
}