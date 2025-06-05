const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');
const sanitize = require('sanitize-filename');
const fileCounter ='XXtest';// new (require('../fileCounter.js'))('./exemplar-cntr.txt');
const imageDirCounter ='XXtest';//  new (require('../fileCounter.js'))('./folder-cntr.txt');
const createDirWhenNotExist = require('../helper/createDirWhenNotExist');
const os = require("os");
const {handleNewSerie} = require("./index");
const _token = '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'//'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';
const isOnServer = () => {
    const userHomeDir = os.homedir();

    //console.log('on uberspace ------>', userHomeDir, '<-------', (userHomeDir.indexOf('eggman') != -1))

    return (userHomeDir.indexOf('eggman') != -1)
}
let _imageDir = '';
(async () => {
    const folderSuffix = isOnServer() ? 's-' : 'l-'
    _imageDir = `./../images/${folderSuffix}` +'XtestX'

})()

//https://api-inference.huggingface.co/models/stabilityai/stable-diffusion-2-1
module.exports = {
    config: {
        pollingTime: 4 * 60 * 1000,
        description: 'stable diffusion 1.5/ hugginface, low rate'
    },

    prompt: async (prompt, options) => {
        let totalPrompt = prompt + options.staticPrompt;

        console.log('totalPrompt: ', totalPrompt)

        return new Promise((resolve, reject) => {
            axios.post(	"https://api-inference.huggingface.co/models/SG161222/Realistic_Vision_V1.4",
                {"inputs": totalPrompt},///https://huggingface.co/SG161222/Realistic_Vision_V1.4?text=Water+%28disambiguation%29%2CNintendo+expects+to+sell+only+15+million+Switch+consoles+over+the+next+year%2C+background+Animal+%28disambiguation%29%2C+%28high+detailed+skin%3A1.2%29%2C+8k+uhd%2C+dslr%2C+soft+lighting%2C+high+quality%2C+film+grain%2C+Fujifilm+XT3
                {
                    Authorization: _token,
                    Accept: 'application/json',
                    'Content-Type': 'application/json',
                    responseType: 'arraybuffer',
                }).then(async function (result) {

                const name = result.data.images ? result.data.images.length : '1' + '-'
                    + 'test X'

                options.prompt = prompt;
                options.totalPrompt = totalPrompt;
                let dataPath = options.folderVersionString
                    ? _imageDir + '-' + options.folderVersionString : _imageDir;

                dataPath = path.join(__dirname, '../' + dataPath);

                handleNewSerie(dataPath,options);
                console.log('------>: -----------', dataPath);

                const jsonObj = JSON.stringify(options);
                const imgPath = dataPath + '/' + name + '.png';

                const buffer = Buffer.from(result.data);
                fs.writeFileSync(imgPath, buffer, "binary");

                const jsonPath = dataPath + '/' + name + '.json';
                fs.writeFileSync(jsonPath, jsonObj, 'utf-8');
            }).catch(function (error) {
                console.log('err-err-->', error);
            }).finally(function () {
                // always executed
                resolve()
            });
        });
    }
}

module.exports.prompt('hello saddam', {});