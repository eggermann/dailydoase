import { fileURLToPath } from 'url';
import path from 'path';
import fs from "fs-extra";
import FileCounter from '../fileCounter.js';
import store from '../store.cjs';

const GENERATIONS_PATH = store.GENERATIONS_PATH;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);



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
        this.roundCounter = 0;
        // Set basepath using GENERATIONS_PATH from store.cjs

        this.imageDir = GENERATIONS_PATH;

        // Register cleanup logic for application exit
        this.registerCleanupOnExit();
    }

    addStaticPrompt(prompt, staticPrompt) {


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



            const folderName =
                collectionCnt +
                (prefix ? '-' + prefix : '') +
                (this.config.folderNamePostfix ? this.config.folderNamePostfix : '');


            const newFolderPath = checkFolderExistence(folderPath, folderName);
            this.imageDir = '' + newFolderPath;
            console.log('\x1b[31m\x1b[1mImage output folder:', this.imageDir, '\x1b[0m');
            this.handleNewSeries(this.imageDir)

        }
    }

    registerCleanupOnExit() {
        const cleanup = () => {
            if (this.imageDir && fs.existsSync(this.imageDir)) {
                const files = fs.readdirSync(this.imageDir);
                if (files.length <= 1) {
                    console.log(`----Deleting empty directory: ${this.imageDir}`);
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

        const dir = path; // `path` is the method argument (folder path)

        // Helper: valid JS identifier for unquoted object keys
        const isValidIdentifier = (name) => /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name);

        // Recursively serialize an object into executable JS source.
        // Functions are kept as their toString() representation.
        const serializeToJS = (value) => {
            if (value === null) return 'null';
            if (typeof value === 'string') return JSON.stringify(value);
            if (typeof value === 'number' || typeof value === 'boolean') return String(value);
            if (typeof value === 'function') return value.toString();
            if (Array.isArray(value)) {
                return '[' + value.map(serializeToJS).join(',') + ']';
            }
            if (typeof value === 'object') {
                const entries = Object.entries(value).map(([k, v]) => {
                    const key = isValidIdentifier(k) ? k : JSON.stringify(k);
                    return key + ':' + serializeToJS(v);
                });
                return '{' + entries.join(',') + '}';
            }
            return 'undefined';
        };

        try {
            // Write a JSON file where functions are stored as their string source
            fs.writeFileSync(
                dir + '/info.json',
                JSON.stringify(
                    options,
                    (k, v) => (typeof v === 'function' ? v.toString() : v),
                    2
                ),
                'utf-8'
            );

            // Also write a JS module that exports the options as executable code
            const jsModule = 'export default ' + serializeToJS(options) + ';';
            fs.writeFileSync(dir + '/info.js', jsModule, 'utf-8');
        } catch (err) {
            console.error('Failed to write info files:', err);
        }
        options.info && delete options.info;
    }
}