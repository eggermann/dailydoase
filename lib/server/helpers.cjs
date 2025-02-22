const path = require("path");
const os = require("os");
const fs = require('fs');

const isValidPartial = (file) => {
    return path.extname(file) === ".hbs";
};

const isOnServer = () => {
    const userHomeDir = os.homedir();
    //console.log('on uberspace ------>', userHomeDir, '<-------', (userHomeDir.indexOf('eggman') != -1))
    return (userHomeDir.indexOf('eggman') != -1);
};


function ensureDirectoryExists(folderPath) {
    try {
        if (!fs.existsSync(folderPath)) {
            fs.mkdirSync(folderPath, { recursive: true }); // Creates the folder if it doesn't exist
        }
    } catch (err) {
        console.error(`Error ensuring folder exists: ${folderPath}`, err);
    }
}

module.exports = {
    isValidPartial,
    isOnServer,
    ensureDirectoryExists
};