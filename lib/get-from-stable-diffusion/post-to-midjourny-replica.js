

const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');
const fileCounter = new (require('../helper/incremental-call'))('./exemplar-cntr.txt');
const imageDirCounter = new (require('../helper/incremental-call'))('./folder-cntr.txt');

const handleNewSerie = require('./index').handleNewSerie
const os = require("os");
const isBlackImage = require('../helper/isBlackImage').isBlackImage;
const fullfillPrompt = require('./index').fullffillPrompt

const temp = require('temp');

// Automatically track and cleanup files at exit
temp.track();

const isOnServer = () => {
    const userHomeDir = os.homedir();

    //console.log('on uberspace ------>', userHomeDir, '<-------', (userHomeDir.indexOf('eggman') != -1))

    return (userHomeDir.indexOf('eggman') != -1)
}
let _imageDir = '';
(async () => {
    const folderSuffix = 'mdjrny-v4 ' + (isOnServer() ? 's-' : 'l-')
    _imageDir = `./../images/${folderSuffix}` + await imageDirCounter.increment();

})()
const _ = {}

module.exports = {
    config: {
        pollingTime: 1000,
        description: 'midjourney-client'
    },

    prompt: async (prompt, options) => {
        if (!_.midjourney) {
            _.midjourney = (await import("midjourney-client")).default;
        }
        let totalPrompt = prompt + (options.staticPrompt ? options.staticPrompt : '');
        totalPrompt = await fullfillPrompt({inputs: totalPrompt});
        console.log('----->prompt', totalPrompt);

        return new Promise(async (resolve, reject) => {
            let res = '';

            try {
                res = await _.midjourney("mdjrny-v4 " + totalPrompt);

            } catch (err) {
                console.log(err);
                return resolve(false);
            }
            const name = res.length + '-'
                + await fileCounter.increment();

            const url = JSON.parse(JSON.stringify(res));// 'https://replicate.delivery/pbxt/3GLojZXEl5JJKZ8iyJDaVUrg4O9OzQvfxBbALqrHZXSCvtZIA/out-0.png';//JSON.parse(JSON.stringify(res));
            console.log('----->url', url)

            const response = await axios({
                url,
                method: 'GET',
                responseType: 'stream',
            })

            let dataPath = options.folderVersionString
                ? _imageDir + '-' + options.folderVersionString : _imageDir;

            dataPath = path.join(__dirname, '../' + dataPath);


            handleNewSerie(dataPath,options);
            const imgPath = dataPath + '/' + name + '.png';

            console.log('dataPath:  ', dataPath);
            await response.data
                .pipe(fs.createWriteStream(imgPath))
                .on('error', reject)
                .once('close', () => {


                    options.prompt = prompt
                    const jsonObj = JSON.stringify(options);
                    const jsonPath = dataPath + '/' + name + '.json';
                    fs.writeFileSync(jsonPath, jsonObj, 'utf-8')


                    return resolve(true);


                })
        }).catch(function (error) {
            console.log('------>: catch-----------!!!!!!   error', error);
            resolve(false);
        });
    }
}

//module.exports.prompt('hausmaus im mixer', {});