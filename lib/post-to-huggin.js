const axios = require('axios');
const fs = require('fs-extra');
const sanitize = require('sanitize-filename');
const fileCounter = new (require('./incremental-call'))('./exemplar-cntr.txt');
const imageDirCounter = new (require('./incremental-call'))('./folder-cntr.txt');
const createDirWhenNotExist=require('./createDirWhenNotExist');
const _token = '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'//'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';
let _imageDir = '';
(async () => {
    _imageDir = './images/v-' + await imageDirCounter.increment();
})()


module.exports.prompt = async (prompt, options) => {
    let totalPrompt = prompt + options.staticPrompt;

    totalPrompt = sanitize(totalPrompt);//.trim().replaceAll(',,', ',')

   // totalPrompt = "Cyberneticist,  Operation (game) a battery-operated, board game , Horror fiction  ,Naturism (disambiguation), 4k"
    const o = {
        config: {
            Authorization: _token,
            Accept: 'application/json',
            'Content-Type': 'application/json',
            responseType: 'arraybuffer',
        }
    }
console.log('totalPrompt: ',totalPrompt)
    return new Promise((resolve, reject) => {
        axios.post(
            'https://api-inference.huggingface.co/models/runwayml/stable-diffusion-v1-5',
            {"inputs": totalPrompt},
            {
                Authorization: _token,
                Accept: 'application/json',
                'Content-Type': 'application/json',
                responseType: 'arraybuffer',
            }).then(async function (result) {

            const name = result.data.images ? result.data.images.length : '1' + '-'
                + await fileCounter.increment();

            let dataPath = options.folderVersionString
                ? _imageDir + '-' + options.folderVersionString : _imageDir;

            dataPath = '../' + dataPath;
            createDirWhenNotExist(dataPath);
            const imgPath = dataPath + '/' + name + '.png';


            const buffer = Buffer.from(result.data);
            const a = fs.writeFileSync(imgPath, buffer, "binary");

            const jsonPath = dataPath + '/' + name + '.json';
            options.prompt = prompt
            const jsonObj = JSON.stringify(options);

            fs.writeFileSync(jsonPath, jsonObj, 'utf-8')

        }).catch(function (error) {
            console.log('err-err-->', error);
        }).finally(function () {
            // always executed
            resolve()
        });
    });
}

//module.exports.prompt('', {});