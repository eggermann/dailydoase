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
        this.imageDir = '';
        this.fileCounter = new Filecounter('./exemplar-cntr.txt');
        this.config = config;

        this.saveFolder();
    }

    async saveFolder() {
        const imageDirCounter = new Filecounter('./folder-cntr.txt')

        this.imageDir = './../images/n_' + this.config.folderNamePostfix + '-' + await imageDirCounter.increment();
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