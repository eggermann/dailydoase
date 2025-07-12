import { fileURLToPath } from 'url';
import path from 'path';
import fs from "fs-extra";
import FileCounter from '../fileCounter.js';
import createDirWhenNotExist from "../helper/createDirWhenNotExist.js";
import store from '../store.cjs';

const GENERATIONS_PATH = store.GENERATIONS_PATH;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
    //options und config 888
    constructor(options) {
        const dataPath = path.resolve(__dirname, './auto-count--exemplar.txt');
        this.fileCounter = new FileCounter(dataPath);
        this.config = options;
        this.id = Math.round(Math.random() * 100000);
        this.config.id = this.id;
        // Set basepath using GENERATIONS_PATH from store.cjs

        this.imageDir = GENERATIONS_PATH;

        // Register cleanup logic for application exit
        this.registerCleanupOnExit();
    }

    addStaticPrompt(prompt, options) {
        const staticPrompt = options.staticPrompt;

        let pre = '';
        let post = '';

        if (staticPrompt) {
            pre = staticPrompt.pre || '';
            post = staticPrompt.post || '';
        }


        return pre + ' ' + prompt + ' ' + post;
    }

    async checkSignature() {
        if (!this.firstTime) {
            this.firstTime = true;

            const imageDirCounter = new FileCounter(
                path.join(__dirname, './auto-count--collection.txt')
            );

            const collectionCnt = await imageDirCounter.increment();
            console.log('collectionCnt', collectionCnt);

            const folderPath = this.imageDir;
            let prefix = this.config.folderName;
            prefix = prefix ? prefix : '';

            const folderName = versionPrefix + '-' + collectionCnt +
                (prefix ? '-' + prefix : '') +
                (this.config.folderNamePostfix ? this.config.folderNamePostfix : '');


            const newFolderPath = checkFolderExistence(folderPath, folderName);
            this.imageDir = '' + newFolderPath;

            this.handleNewSeries(this.imageDir)
        }
    }

    registerCleanupOnExit() {
        const cleanup = () => {
            if (this.imageDir && fs.existsSync(this.imageDir)) {
                const files = fs.readdirSync(this.imageDir);
                if (files.length <= 1) {
                    console.log(`Deleting empty directory: ${this.imageDir}`);
                    fs.rmSync(this.imageDir, { recursive: true, force: true });
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

    handleNewSeries(path) {
        const options = this.config;

        fs.writeFileSync(
            path + '/info.json',
            JSON.stringify(options),
            'utf-8'
        );
        options.info && delete options.info;
    }
}