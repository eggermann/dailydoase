import axios from 'axios';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

// Load environment variables from .env file
dotenv.config();

const _token = process.env.HF_API_KEY;


// Define __dirname equivalent for ES6 modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isOnServer = () => {
    const userHomeDir = os.homedir();
    return userHomeDir.indexOf('eggman') !== -1;
};

let _imageDir = '';

(async () => {
    const folderSuffix = isOnServer() ? 's-' : 'l-';
    _imageDir = `./../images/${folderSuffix}XtestX`;
})();

export const config = {
    pollingTime: 4 * 60 * 1000,
    description: 'stable diffusion 1.5/ hugginface, low rate'
};
///SG161222/RealVisXL_V4.0
const model = 'https://api-inference.huggingface.co/models/black-forest-labs/FLUX.1-schnell';//models/Kwai-Kolors/Kolors';//stabilityai/stable-diffusion-2-1';///models/fal/AuraFlow';

export const prompt = async (prompt, options) => {
    return new Promise((resolve, reject) => {
        axios.post(model,
            { "inputs": prompt },
            {
                headers: {
                    Authorization: `Bearer ${_token}`,
                    Accept: 'application/json',
                    'Content-Type': 'application/json',
                },
                responseType: 'arraybuffer',
            })
            .then(async (result) => {
                console.log(result)
                const name = (result.data.images ? result.data.images.length : '1') + '-testX';
                options.prompt = prompt;
                options.totalPrompt = prompt;

                const jsonObj = JSON.stringify(options);
                const imgPath = `./${name}.png`;

                const buffer = Buffer.from(result.data);
                fs.writeFileSync(imgPath, buffer, "binary");

                const jsonPath = `./${name}.json`;
                fs.writeFileSync(jsonPath, jsonObj, 'utf-8');
            })
            .catch((error) => {
                console.log('err-err-->', error);
                reject(error);
            })
            .finally(() => {
                resolve();
            });
    });
};


prompt('hello neo chi saddam gong pussy', {});