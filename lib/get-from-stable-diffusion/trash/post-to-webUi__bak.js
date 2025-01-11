import {fileURLToPath} from 'url';
import path from 'path';
//https://medium.com/@neonforge/how-to-automate-midjourney-image-generation-with-python-and-gui-automation-ac9ca5f747ae
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);



const axios = require('axios');

const fs = require('fs-extra');
const sanitize = require('sanitize-filename');

import Filecounter from '../helper/incremental-call.js';
const fileCounter = new Filecounter('./exemplar-cntr.txt');
const imageDirCounter = new Filecounter('./folder-cntr.txt')

let _imageDir = '';
(async () => {
    _imageDir = './../images/sd-' + await imageDirCounter.increment();
})()


import index from "./index.js";

const handleNewSerie = index.handleNewSerie;


const isBlackImage = require(__dirname+'/../helper/isBlackImage').isBlackImage;

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


        return new Promise((resolve, reject) =>
        {
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