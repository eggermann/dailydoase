import {fileURLToPath} from 'url';
import path from 'path';
import {artworkDescription,imageDescription,midjDescription} from "./openAiPrompt.js";
//https://medium.com/@neonforge/how-to-automate-midjourney-image-generation-with-python-and-gui-automation-ac9ca5f747ae
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
//--> https://github.com/erictik/midjourney-discord/tree/main
import {createRequire} from "module";
import fs from 'fs-extra';
import axios from 'axios';
import sanitize from 'sanitize-filename';
import Midjourney from "midjourney-discord-api";
import PostTo from "./PostTo.js";

import 'dotenv/config';
const client = new Midjourney(__dirname + "/interaction_2.txt");
let _firsttime = true;

/*
*  .then(({ images_bak }) => writeFileSync('path/to/image.png', images_bak[0], 'base64'))
*
* */
//http://127.0.0.1:7860/docs#/default/img2imgapi_sdapi_v1_img2img_post
//const fullFillPrompt = require('./index.cjs').fullFillPrompt;
const _ = {
    config: {
        folderName: 'mid',
        folderNamePostfix: 'md',
        pollingTime: 15000,
        description: 'midjourney '
    },
    webUi: class extends PostTo {
        constructor(config) {
            super(config);

            this.oldMsg = '';
        }


        async prompt(prompt, options) {
            let totalPrompt = this.addStaticPrompt(prompt, options);

            try {
                console.log('bevor GPT ',totalPrompt)
                totalPrompt =await midjDescription(totalPrompt)
            } catch (e) {
                console.log(e)
            }


            const seed = Math.round(1204 * Math.random());
//--c 20 --aspect 3:2 --testp
            //https://docs.midjourney.com/docs/quality --weird 40 --stylize 750
            totalPrompt += ` --ar 16:9  --c 70 --aspect 3:2 --seed ${seed}`;// --quality .25 --c 20  --seed ${seed} --testp --aspect 3:2


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


                    const name = 'midj-' + (await this.fileCounter.increment());

                    this.handleNewSerie(this.imageDir, options);


                    let imgPath = this.imageDir + '/' + name + '.png';
                    const grabber = async () => {
                        clearTimeout(this.secureTimer);
//read in meassag

                        let msg = this.oldMsg;
                        try {
                            msg = (await client.getMessages({limit: 1}))[0];

                        } catch (e) {
                            console.log('err+', e)
                        }


                        //  console.log('Zedong', msg)

                        if (JSON.stringify(this.oldMsg) == JSON.stringify(msg)) {
                            console.log("old message repeat SECURE***"); // by default get 50 messages

                        } else {
                            console.log("SECURE**** ****  messages visibles new"); // by default get 50 messages
                            const obj = JSON.parse(JSON.stringify(msg));
                            console.log('msg', msg.prompt, typeof (msg))

                            const timeStamp = obj.timestamp;

                            //     console.log(timeStamp);
                            //  process.exit();

                            const completion = obj.prompt.completion;


                            console.log('completion', completion)
                            if (completion == '1' && !_firsttime) {
                                clearTimeout(secure);

                                console.log('completion -1');
                                imgPath = this.imageDir + '/' + name + '.png';
                                try {
                                    await msg.download(0, imgPath);
                                } catch (err) {
                                    console.log('err download ', err);
                                }

                                options.prompt = prompt
                                options.totalPrompt = totalPrompt
                                console.log('***********2');

                                const jsonObj = JSON.stringify(options);
                                const jsonPath = this.imageDir + '/' + name + '.json';

                                console.log('completion -1');
                                fs.writeFileSync(jsonPath, jsonObj, 'utf-8')
                                console.log('***********3');
                                /* */

                                resolve(true);
                            }
                        }


                        this.oldMsg = msg;

                        /*    msgs.forEach(async (m, i) => {
                                if (m.attachments) {

                                    if (m.prompt && m.prompt.prompt.trim() == totalPrompt.trim()) {
                                        imgPath = dataPath + '/' + i + '_' + name + '.png';
                                        await m.download(0, imgPath);
                                    }
                                }
                            })*/

                        _firsttime = false;
                    };


                    console.log('***********0.1c', totalPrompt);


                    this.secureTimer = setTimeout(() => {
                        resolve(true);
                    }, 20000);
                    const secure = setInterval(grabber, 15000)

                    await client.imagine(totalPrompt, i => {
                        console.log('progress ---> **', i);
                    });

                } catch (e) {
                    console.log('err-err-->', '!!!!!!   error', e);
                    // process.exit()
                    return resolve(true);
                }
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

if (false) {
    const i = new _.webUi(_.config)
    i.prompt('hello mausi  suger  apple , forground waves of dust').then(console.log)
}