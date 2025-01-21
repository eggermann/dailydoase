import { fileURLToPath } from 'url';
import path from 'path';
import fs from "fs-extra";
import FileCounter from '../fileCounter.js';
import createDirWhenNotExist from "../helper/createDirWhenNotExist.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const imagePath = '../../GENERATIONS/images';
const versionPrefix = 'v_2';

function checkFolderExistence(folderPath, folderName, count = 0) {
    const fullPath = count > 0
        ? path.join(folderPath, `${folderName}_${count}`)
        : path.join(folderPath, folderName);

    if (fs.existsSync(fullPath)) {
        const newFolderName = `${folderName}_${count}`;
        return checkFolderExistence(folderPath, newFolderName, count + 1);
    } else {
        console.log('fullPath', fullPath);

        // Create the folder
        fs.ensureDirSync(fullPath);

        return fullPath;
    }
}

export default class PostTo {
    constructor(config) {
        const dataPath = path.join(__dirname, './auto-count--exemplar.txt');
        this.fileCounter = new FileCounter(dataPath);
        this.config = config;
        this.imageDir = '';

        // Register cleanup logic for application exit
        this.registerCleanupOnExit();
    }

    addStaticPrompt(prompt, options) {
        return (options.prePrompt ? options.prePrompt : '') + prompt +
            (options.staticPrompt ? options.staticPrompt : '');
    }

    async checkSignature() {
        if (!this.firstTime) {
            this.firstTime = true;

            const imageDirCounter = new FileCounter(
                path.join(__dirname, './auto-count--collection.txt')
            );

            const collectionCnt = await imageDirCounter.increment();
            console.log('collectionCnt', collectionCnt);

            const folderPath = path.join(__dirname, imagePath);
            let prefix = this.config.folderName;
            prefix = prefix ? prefix : '';

            const folderName = versionPrefix + '-' + collectionCnt +
                (prefix ? '-' + prefix : '') +
                (this.config.folderNamePostfix ? this.config.folderNamePostfix : '');

            const newFolderPath = checkFolderExistence(folderPath, folderName);
            this.imageDir = '' + newFolderPath;
        }
    }

    registerCleanupOnExit() {
        const cleanup = () => {
            if (this.imageDir && fs.existsSync(this.imageDir)) {
                const files = fs.readdirSync(this.imageDir);
                if (files.length === 0) {
                    console.log(`Deleting empty directory: ${this.imageDir}`);
                    fs.rmdirSync(this.imageDir);
                }
            }
        };

        // Run cleanup on application exit
        process.on('exit', cleanup);

        // Handle termination signals (e.g., Ctrl+C)
        process.on('SIGINT', () => {
            cleanup();
            process.exit(0);
        });

        // Handle uncaught exceptions
        process.on('uncaughtException', (err) => {
            console.error('Uncaught Exception:', err);
            cleanup();
            process.exit(1);
        });
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