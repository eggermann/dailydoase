import {fileURLToPath} from 'url';
import path from 'path';
//https://medium.com/@neonforge/how-to-automate-midjourney-image-generation-with-python-and-gui-automation-ac9ca5f747ae
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


import fs from 'fs-extra';
import axios from 'axios';
import sanitize from 'sanitize-filename';
import Midjourney from "midjourney-discord-api";


import Filcounter from '../fileCounter.js';

const fileCounter = new Filcounter('./exemplar-cntr.txt');
const imageDirCounter = new Filcounter('./folder-cntr.txt')

const client = new Midjourney(__dirname + "/interaction_2.txt");


let _imageDir = '';
(async () => {
    _imageDir = './../images/midj-' + await imageDirCounter.increment();
})()


import index from "./index.js";

const handleNewSerie = index.handleNewSerie;

/*
*  .then(({ images_bak }) => writeFileSync('path/to/image.png', images_bak[0], 'base64'))
*
* */
//http://127.0.0.1:7860/docs#/default/img2imgapi_sdapi_v1_img2img_post
//const fullFillPrompt = require('./index.cjs').fullFillPrompt;
const _ = {
    config: {
        pollingTime: 5000,
        description: 'stable diffusion 1.5/ webui 1111'
    },
    prompt: async (prompt, options) => {


        let totalPrompt = prompt + (options.staticPrompt ? options.staticPrompt : '');
        const seed = Math.round(120 * Math.random());

        totalPrompt += ` --c 20 --aspect 3:2 --testp   `;// --quality .25 --c 20  --seed ${seed} --testp --aspect 3:2


        //  totalPrompt = sanitize(totalPrompt);//.trim().replaceAll(',,', ',')

        const o = Object.assign(
            {},
            options.stableDiffusionOptions,
            {prompt: totalPrompt}
        );


        console.log('final prompt-->', totalPrompt)
        //return true;


        return new Promise(async (resolve, reject) => {
            try {
                //    console.log('XXX-->',await fileCounter.increment())
                const name = 'midj-' + await fileCounter.increment();
                console.log('***********0');
                let dataPath = options.folderVersionString
                    ? _imageDir + '-' + options.folderVersionString : _imageDir;

                dataPath = path.join(__dirname, '../' + dataPath);
                handleNewSerie(dataPath, options);
                console.log('***********0.1');
                let imgPath = dataPath + '/' + name + '.png';
                const secure = setTimeout(async () => {
//read in meassages
                    const msgs = await client.getMessages();
                    console.log(msgs.length + "SECURE**** ****  messages visibles", msgs); // by default get 50 messages


                    msgs.forEach(async (m, i) => {
                        if (m.attachments) {

                            if(m.prompt && m.prompt.prompt.trim()==totalPrompt.trim()){
                                imgPath = dataPath + '/' + i + '_' + name + '.png';
                                await m.download(0, imgPath);
                            }
                        }
                    })


                    resolve(true);
                }, 80000)


                const msg = await client.imagine(totalPrompt, i => {
                    console.log('**', i);
                });


                //->   https://github.com/UrielCh/midjourney-client/blob/main/samples/ImagineSet.ts
                console.log('***********0.2');
                console.log('msg: ', msg)

                //  const url = msg.attachments[0].url
                //  console.log({url})

                console.log('***********1');

                await msg.download(0, imgPath);

                options.prompt = prompt
                options.totalPrompt = totalPrompt
                console.log('***********2');
                const jsonObj = JSON.stringify(options);
                const jsonPath = dataPath + '/' + name + '.json';
                fs.writeFileSync(jsonPath, jsonObj, 'utf-8')
                console.log('***********3');
                /* */
                clearTimeout(secure);
                resolve(true);
            } catch (e) {
                console.log('err-err-->', '!!!!!!   error', e);

                // process.exit()
                resolve(false);
            }

        })
    }
}

export default _;
//_.prompt('hello saddam ötcalan apple , forground waves of dune, smoking wather', {});