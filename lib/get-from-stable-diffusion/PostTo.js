import {fileURLToPath} from 'url';
import path from 'path';
//https://medium.com/@neonforge/how-to-automate-midjourney-image-generation-with-python-and-gui-automation-ac9ca5f747ae
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


import Filecounter from '../helper/incremental-call.js';
import createDirWhenNotExist from "../helper/createDirWhenNotExist.js";
import fs from "fs-extra";


export default class PostTo {

    constructor(config) {

        const dataPath = path.join(__dirname, './auto-count--exemplar.txt');
        this.fileCounter = new Filecounter(dataPath);
        this.config = config;
        this.imageDir = '';


        this.prepareFilePathes();
    }

    async prepareFilePathes() {
        let prefix = this.config.folderName;
        prefix = prefix ? prefix  + '-': '';

        const imageDirCounter = new Filecounter(path.join(__dirname, './auto-count--collection.txt'))
        const collectionCnt = await imageDirCounter.increment();

        console.log('collectionCnt', collectionCnt)
        this.imageDir = path.join(__dirname,
            '../../images/'
            + collectionCnt +  '-'
            + prefix
            + (this.config.folderNamePostfix ?  this.config.folderNamePostfix : ''))
    }

    addStaticPrompt(prompt,options={}){

        const totalPrompt = prompt + (options.staticPrompt ? options.staticPrompt : '');
        console.log('with static prompt ------->', totalPrompt);
        //  totalPrompt = sanitize(totalPrompt);//.trim().replaceAll(',,', ',')
return totalPrompt;
    }
    handleNewSerie(path, options) {
        if (createDirWhenNotExist(path)) {
            if (options) {
                fs.writeFileSync(path + '/info.json', JSON.stringify(options), 'utf-8');
                options.info && delete options.info;
            }
        }
    }
}