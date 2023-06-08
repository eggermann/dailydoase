const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');
const sanitize = require('sanitize-filename');
const fileCounter = new (require('../helper/incremental-call'))('./exemplar-cntr.txt');
const imageDirCounter = new (require('../helper/incremental-call'))('./folder-cntr.txt');

let _imageDir = '';
(async () => {
    _imageDir = './../images/sd-' + await imageDirCounter.increment();
})()


const {handleNewSerie} = require("./index");

const isBlackImage = require('../helper/isBlackImage').isBlackImage;

/*
*  .then(({ images_bak }) => writeFileSync('path/to/image.png', images_bak[0], 'base64'))
*
* */
//http://127.0.0.1:7860/docs#/default/img2imgapi_sdapi_v1_img2img_post
const fullFillPrompt = require('./index').fullFillPrompt;

module.exports = {
    config: {
        pollingTime: 100,
        description: 'stable diffusion 1.5/ webui 1111'
    },
    prompt: async (prompt, options) => {


       const  totalPrompt =prompt +  (options.staticPrompt ? options.staticPrompt : '');

        //  totalPrompt = sanitize(totalPrompt);//.trim().replaceAll(',,', ',')

        const o = Object.assign(
            {},
            options.stableDiffusionOptions,
            {prompt: totalPrompt}
        );
        console.log('final prompt-->', totalPrompt)
 //return true;


        return new Promise((resolve, reject) => {
            axios.post('http://localhost:7860/sdapi/v1/txt2img', o)
                .then(async function (response) {
                    const name = response.data.images.length + '-'
                        + await fileCounter.increment();

                    let dataPath = options.folderVersionString
                        ? _imageDir + '-' + options.folderVersionString : _imageDir;

                    dataPath = path.join(__dirname, '../' + dataPath);
                    handleNewSerie(dataPath, options);
                    //  console.log('------>: -----------', dataPath);

                    const options2 = {
                        data: response.data.images[0],
                        type: 'base64'
                    }

                    const shouldSave = !await isBlackImage(options2);

                    if (shouldSave) {
                        const imgPath = dataPath + '/' + name + '.png';
                        fs.writeFileSync(imgPath, response.data.images[0], 'base64')

                        options.prompt = prompt
                        options.totalPrompt = totalPrompt

                        const jsonObj = JSON.stringify(options);
                        const jsonPath = dataPath + '/' + name + '.json';
                        fs.writeFileSync(jsonPath, jsonObj, 'utf-8')
                    }

                    resolve(true);
                }).catch(function (error) {

                console.log('err-err-->', '!!!!!!   error', 'error');

                // process.exit()
                resolve(false);
                // reject(totalPrompt);--> try again to not loose prompts
            })
        })
    }
}