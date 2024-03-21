import axios from 'axios';
import fs from "fs-extra";
import path from 'path';


import {fileURLToPath} from 'url';

const _token = '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'//'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';//


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import {createRequire} from "module";
//const temp = require('temp');

const require = createRequire(import.meta.url);
const isBlackImage = require(__dirname + '/../helper/isBlackImage.cjs').isBlackImage;

import PostTo from "./PostTo.js";

// Automatically track and cleanup files at exit
//temp.track();


const _ = {
    config: {
        pollingTime: (4 * 60 * 1000) * 4,
        description: 'stable diffusion 2/ HugginFace, low rate',
        folderName: 'HF'
    },
    HugginFace: class extends PostTo {
        async prompt(prompt, options) {

            let totalPrompt = (options.prePrompt ? options.prePrompt : '') + prompt + (options.staticPrompt ? options.staticPrompt : '');

            let imageFolderDir = this.imageDir;
            console.log('--->', totalPrompt);

            return new Promise((resolve, reject) => {
                axios.post(
                    //     'https://api-inference.huggingface.co/models/stabilityai/stable-diffusion-2-1',
//             'https://api-inference.huggingface.co/models/prompthero/openjourney',
//                'https://api-inference.huggingface.co/models/stabilityai/stable-diffusion-xl-base-1.0',
                    //  'https://api-inference.huggingface.co/models/SG161222/Realistic_Vision_V1.4',
//'https://api-inference.huggingface.co/models/SG161222/Realistic_Vision_V5.1_noVAE',
                    //  'https://api-inference.huggingface.co/models/dataautogpt3/OpenDalleV1.1',
                    options.model ? options.model : 'https://api-inference.huggingface.co/models/ByteDance/SDXL-Lightning',
//-. SG161222/Realistic_Vision_V2.0

                    {
                        "inputs": totalPrompt,
                        //----->  sehr gut      "negative_prompt": ' (deformed iris, deformed pupils, semi-realistic, cgi, 3d, render, sketch, cartoon, drawing, anime:1.4), text, close up, cropped, out of frame, worst quality, low quality, jpeg artifacts, ugly, duplicate, morbid, mutilated, extra fingers, mutated hands, poorly drawn hands, poorly drawn face, mutation, deformed, blurry, dehydrated, bad anatomy, bad proportions, extra limbs, cloned face, disfigured, gross proportions, malformed limbs, missing arms, missing legs, extra arms, extra legs, fused fingers, too many fingers, long neck'

                        "negative_prompt": (options.negative_prompt ? options.negative_prompt : '') + ' (deformed iris, deformed pupils, semi-realistic, anime:1.4), text, close up, cropped, out of frame, worst quality, low quality, jpeg artifacts, extra fingers, mutated hands, poorly drawn hands, poorly drawn face, dehydrated, bad anatomy, bad proportions, extra limbs, cloned face, disfigured, gross proportions, malformed limbs, missing arms, missing legs, extra arms, extra legs, fused fingers, too many fingers'

                    },
                    {
                        Authorization: _token,
                        Accept: 'application/json',
                        'Content-Type': 'application/json',
                        responseType: 'arraybuffer',
                    })
                    .then(async (result) => {

                        console.log('------>: then-----------');
                        const name = result.data.images ? result.data.images.length : '1' + '-'
                            + await this.fileCounter.increment();


                        options.prompt = prompt;
                        options.totalPrompt = totalPrompt;

                        this.handleNewSerie(imageFolderDir, options);

                        const jsonObj = JSON.stringify(options);
                        const imgPath = imageFolderDir + '/' + name + '.png';
                        const buffer = Buffer.from(result.data);

                        const options2 = {
                            data: buffer,
                            type: 'binary'
                        }
                        const shouldSave = !await isBlackImage(options2);
                        if (shouldSave) {
                            try {
                                fs.writeFileSync(imgPath, buffer, "binary");
                                //  console.log('save ------>: -----------', imgPath);

                                const jsonPath = imageFolderDir + '/' + name + '.json';

                                fs.writeFileSync(jsonPath, jsonObj, 'utf-8');
                            } catch (err) {
                                console.log('err in write file', err)
                            }

                        } else {
                            console.log('------>: -----------XXXXX blck', imgPath);
                        }
                        resolve(true);
                    }).catch(function (error) {
                    console.log('err-err-->', '!!!!!!   error', 'error');
                    resolve(false);
                    // reject(totalPrompt);--> try again to not loose prompts
                })
            });
        }
    },

}
export default {
    config: _.config,
    init: () => {
        return new _.HugginFace(_.config);
    }
}
//module.exports.prompt('', {});