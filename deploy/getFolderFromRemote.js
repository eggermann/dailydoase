
/*
FOR download the images on uberspace to fresh-folder

 */


const configPath = process.env.HOME + '/Documents/config-data/eggman';
const config = require(configPath);
const destinationPath = 'Projekte/dailyDoase';
const fs = require('fs');
const path = require('path');
const pathConfig = require('./config.json');
const serverPath = pathConfig.serverImgPath;
const localPath = path.join(__dirname, pathConfig.localImgPath);
const promiseWaterfall = require('promise.waterfall')
const SFTPClient = require('./SftpClient');
const _ = {
    existLocalCnt: 0,
    freshFileCnt: 0
}

module.exports = async () => {
    //const parsedURL = new URL(process.env.SFTPTOGO_URL);
    const port = 22;
    //const {host, username, password} = parsedURL;
    //* Open the connection
    const client = new SFTPClient();
    await client.connect({
        host: config.host,
        port,
        username: config.user,
        password: config.password
    });

    //* List working directory files

    const localFolders = fs.readdirSync(localPath)
    //  _.getServerFiles(serverPath);
    const serverFolders = await client.listFiles(serverPath);

    console.log('serverFolders',serverFolders)
    const pSF = serverFolders.filter(folder => {
        const name = path.basename(folder)
        return !localFolders.includes(name);
    }).map(async folder => {

//        await client.downloadFile('Projekte/dailyDoase/images/s-98-v2/1-4212.json', './1-4212.json');
        //      process.exit();

        const name = path.basename(folder);
        const files = await client.listFiles(path.join(serverPath, name));


        console.log('***jpg/josn ****', name, files.length);
        ///


        const pF = files.map(file => {
            return async () => {
                const server = path.join(serverPath, name, file);
                const local = path.join('./fresh-folders', name, file)
                const dirname = './fresh-folders' + '/' + path.basename(path.dirname(local))

                if (!fs.existsSync(dirname)) {
                    fs.mkdirSync(dirname, {recursive: true});
                }
                if (fs.existsSync(local)) {
                    _.existLocalCnt++
                } else {
                    _.freshFileCnt++;
                    await client.downloadFile(server, local);
                }

            }
        })

        return promiseWaterfall(pF)
            .catch(console.error)
    });

    await Promise.all(pSF);
    console.log(
        'existLocalCnt:', _.existLocalCnt,
        'freshFileCnt:', _.freshFileCnt
    )
    client.disconnect();
};

module.exports();