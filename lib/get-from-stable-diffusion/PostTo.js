import {fileURLToPath} from 'url';
import path from 'path';
//https://medium.com/@neonforge/how-to-automate-midjourney-image-generation-with-python-and-gui-automation-ac9ca5f747ae
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


import Filecounter from '../helper/incremental-call.js';
import createDirWhenNotExist from "../helper/createDirWhenNotExist.js";
import fs from "fs-extra";

function checkFolderExistence(folderPath, folderName, count = 1) {
    const fullPath = `${folderPath}/${folderName}`;

    if (fs.existsSync(fullPath)) {
        console.log('fullPath', fullPath)
        const newFolderName = `${folderName}_${count}`;
        return checkFolderExistence(folderPath, newFolderName, count + 1);
    } else {
        console.log('fullPath', fullPath)
        return fullPath;
    }
}

export default class PostTo {

    constructor(config) {

        const dataPath = path.join(__dirname, './auto-count--exemplar.txt');
        this.fileCounter = new Filecounter(dataPath);
        this.config = config;
        this.imageDir = '';


        this.prepareFilePathes();
    }


    addStaticPrompt(prompt, options) {
        return (options.prePrompt ? options.prePrompt : '') + prompt + (options.staticPrompt ? options.staticPrompt : '');

    }

    async prepareFilePathes() {

        let prefix = this.config.folderName;
        prefix = prefix ? prefix + '-' : '';

        const imageDirCounter = new Filecounter(path.join(__dirname, './auto-count--collection.txt'))

        const collectionCnt = await imageDirCounter.increment();
        console.log(collectionCnt)


        console.log('collectionCnt', collectionCnt)
        const folderPath = path.join(__dirname,
            '../../images');
        const folderName = '' + collectionCnt +
            (prefix ? '-' + prefix : '') +
            (this.config.folderNamePostfix ? this.config.folderNamePostfix : '')
        console.log(folderName)

        const newFolderPath = checkFolderExistence(folderPath, folderName);
        this.imageDir = newFolderPath;

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

/*
const folderPath = path.join(__dirname,
    '../../images');

console.log(checkFolderExistence(folderPath,'167-mid-md'));
const a=checkFolderExistence(folderPath,'167-mid-md');
fs.emptyDir(a)*/