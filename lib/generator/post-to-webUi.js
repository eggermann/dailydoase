/*__migration mod-ES6*/
import {fileURLToPath} from 'url';
import path from 'path';

//https://medium.com/@neonforge/how-to-automate-midjourney-image-generation-with-python-and-gui-automation-ac9ca5f747ae
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import {createRequire} from "module";
/**/

import fs from "fs-extra";
import axios from 'axios';//nvm use 14 !!!
import PostTo from "./PostTo.js";


const require = createRequire(import.meta.url);
//const fullFillPrompt = index.fullFillPrompt
const isBlackImage = require(__dirname + '/../helper/isBlackImage.cjs').isBlackImage;

/*
*  .then(({ images_bak }) => writeFileSync('path/to/image.png', images_bak[0], 'base64'))
*
* */
//http://127.0.0.1:7860/docs#/default/img2imgapi_sdapi_v1_img2img_post


const _ = {
    config: {
        folderName: 'web',
        folderNamePostfix: 'sd',
        pollingTime: 5000,
        description: 'stable diffusion 1.5/ webui 1111'
    },
    webUi: class extends PostTo {
        constructor(config) {
            super(config);
        }

        async prompt(prompt, options) {
            const totalPrompt = this.addStaticPrompt(prompt, options);

            const o = Object.assign(
                {},
                options.stableDiffusionOptions,
                {prompt: totalPrompt}
            );
            console.log('final prompt-->', totalPrompt)
            //return true;


            return new Promise((resolve, reject) => {
                axios.post('http://localhost:7860/sdapi/v1/txt2img', o)
                    .then(async (response) => {
                        const name = response.data.images.length + '-'
                            + await this.fileCounter.increment();

                        this.handleNewSerie(this.imageDir, options);


                        const options2 = {
                            data: response.data.images[0],
                            type: 'base64'
                        }

                        const shouldSave = !await isBlackImage(options2);

                        if (shouldSave) {
                            const imgPath = this.imageDir + '/' + name + '.png';
                            fs.writeFileSync(imgPath, response.data.images[0], 'base64')

                            options.prompt = prompt
                            options.totalPrompt = totalPrompt

                            const jsonObj = JSON.stringify(options);
                            const jsonPath = this.imageDir + '/' + name + '.json';
                            fs.writeFileSync(jsonPath, jsonObj, 'utf-8')
                        }

                        return resolve(true);
                    }).catch(function (error) {

                    console.log('err-err-->', '!!!!!!   error', error);

                    // process.exit()
                    resolve(false);
                    // reject(totalPrompt);--> try again to not loose prompts
                })
            })
        }
    }
}

export default {
    config: _.config,
    init: () => {
        return new _.webUi(_.config);
    }
}
/*
const i = new _.webUi(_.config)
i.prompt('xxx').then(console.log)
*/