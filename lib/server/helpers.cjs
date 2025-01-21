const path = require("path");
const os = require("os");

const isValidPartial = (file) => {
    return path.extname(file) === ".hbs";
};

const isOnServer = () => {
    const userHomeDir = os.homedir();
    //console.log('on uberspace ------>', userHomeDir, '<-------', (userHomeDir.indexOf('eggman') != -1))
    return (userHomeDir.indexOf('eggman') != -1);
};

module.exports = {
    isValidPartial,
    isOnServer,
};