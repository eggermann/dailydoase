import {fileURLToPath} from 'url';
import path from 'path';
import fs from "fs-extra";

import FileCounter from '../fileCounter.js';
import createDirWhenNotExist from "../helper/createDirWhenNotExist.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const imagePath = '../../GENERATIONS/images';

function checkFolderExistence(folderPath, folderName, count = 1) {
    const fullPath = `${folderPath}/${folderName}`;

    if (fs.existsSync(fullPath)) {
        const newFolderName = `${folderName}_${count}`;
        return checkFolderExistence(folderPath, newFolderName, count + 1);
    } else {
        console.log('fullPath', fullPath);
        return fullPath;
    }
}

export default class PostTo {
    constructor(config) {
        const dataPath = path.join(__dirname, './auto-count--exemplar.txt');
        this.fileCounter = new FileCounter(dataPath);
        this.config = config;
        this.imageDir = '';


    }

    addStaticPrompt(prompt, options) {
        return (options.prePrompt ? options.prePrompt : '') + prompt +
            (options.staticPrompt ? options.staticPrompt : '');
    }

    async checkSignature() {
        if (!this.firstTime) {
            this.firstTime = true;

            let prefix = this.config.folderName;
            prefix = prefix ? prefix : '';

            const imageDirCounter = new FileCounter(
                path.join(__dirname, './auto-count--collection.txt')
            );


            const collectionCnt =await imageDirCounter.increment();

            console.log('collectionCnt', collectionCnt);


            const folderPath = path.join(__dirname, imagePath);
            const folderName = 'v_2-' + collectionCnt +
                (prefix ? '-' + prefix : '') +
                (this.config.folderNamePostfix ? this.config.folderNamePostfix : '');

            console.log(folderName);

            const newFolderPath = checkFolderExistence(folderPath, folderName);

            this.imageDir = ''+newFolderPath;
        }
    }

    handleNewSerie(path, options) {
        if (createDirWhenNotExist(path)) {
            if (options) {
                fs.writeFileSync(
                    path + '/info.json',
                    JSON.stringify(options),
                    'utf-8'
                );
                options.info && delete options.info;
            }
        }
    }
}