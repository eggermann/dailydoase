const axios = require('axios');
const fs = require('fs-extra');const path = require('path');
const sanitize = require('sanitize-filename');
const fileCounter = new (require('../helper/incremental-call'))('./exemplar-cntr.txt');
const imageDirCounter = new (require('../helper/incremental-call'))('./folder-cntr.txt');
const server = require('../server')
let _imageDir = '';
(async () => {
    _imageDir = './../images/v-' + await imageDirCounter.increment();
})()


const createDirWhenNotExist = require('../helper/createDirWhenNotExist');


/*
*  .then(({ images_bak }) => writeFileSync('path/to/image.png', images_bak[0], 'base64'))
*
* */
//http://127.0.0.1:7860/docs#/default/img2imgapi_sdapi_v1_img2img_post


module.exports = {
    config: {
        pollingTime: 3000,
        description: 'stable diffusion 1.5/ webui 1111'
    },
    prompt: async (prompt, options) => {
        let totalPrompt = prompt + options.staticPrompt;

        totalPrompt = sanitize(totalPrompt);//.trim().replaceAll(',,', ',')

        const o = Object.assign({},
            options.stableDiffusionOptions,
            {prompt: totalPrompt})
        console.log('------>: ', o);

        return new Promise((resolve, reject) => {
            axios.post('http://localhost:7860/sdapi/v1/txt2img', o)
                .then(async function (response) {

                    const name = response.data.images.length + '-'
                        + await fileCounter.increment();

                    let dataPath = options.folderVersionString
                        ? _imageDir + '-' + options.folderVersionString : _imageDir;

                    dataPath = path.join(__dirname, '../' + dataPath);
                    createDirWhenNotExist(dataPath);

                    console.log('------>: -----------', dataPath);

                    const imgPath = dataPath + '/' + name + '.png';
                    fs.writeFileSync(imgPath, response.data.images[0], 'base64')

                    const jsonPath = dataPath + '/' + name + '.json';
                    options.prompt = prompt
                    const jsonObj = JSON.stringify(options);

                    fs.writeFileSync(jsonPath, jsonObj, 'utf-8')
                })

                .catch(function (error) {
                    console.log('XXXerr-->', error)
                    console.log(error);
                })
                .finally(function () {
                    // always executed
                    resolve()
                });
        })
    }
}