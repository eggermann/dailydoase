import https from 'https';
import axios from 'axios';
import fs from 'fs-extra';
import path from 'path';
import dotenv from 'dotenv';
import {fileURLToPath} from 'url';
import {createRequire} from 'module';
//import axiosRetry from 'axios-retry';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);
const {isBlackImage} = require(path.join(__dirname, '/../helper/isBlackImage.cjs'));

import PostTo from './PostTo.js';
const  _HF_API_KEY =process.env.HF_API_KEY;

/*
// Configure axios to retry failed requests up to 3 times
axiosRetry(axios, {
    retries: 3,
    retryDelay: (retryCount) => retryCount * pollingTime, // Exponential backoff
    retryCondition: (error) => {
        return axiosRetry.isNetworkOrIdempotentRequestError(error) || error.response.status >= 500;
    },
});*/


class HuggingFace extends PostTo {
    constructor(modelConfig) {
        super(modelConfig);
        this.config = modelConfig;
    }

    async prompt(prompt, options = {}) {
        try {
            const totalPrompt =  this.addStaticPrompt(prompt, options);
            const imageFolderDir = this.imageDir;

            const payload = {
                inputs: totalPrompt,
                parameters: {
                    negative_prompt: options.negative_prompt
                        ? `${options.negative_prompt} `
                        : '',
               //     num_inference_steps: options.num_inference_steps || 50,
                },
            };

            console.log('Sending payload to Hugging Face API:', JSON.stringify(payload, null, 2));

            const agent = new https.Agent({keepAlive: true});

            const response = await axios.post(
                this.config.url,
                payload,
                {
                    headers: {
                        Authorization: `Bearer ${_HF_API_KEY}`,
                        Accept: 'application/json',
                        'Content-Type': 'application/json',
                    },
                    responseType: 'arraybuffer',
                    // timeout: 30000, // 30 seconds timeout
                    httpsAgent: agent,
                }
            );

            // Assuming the API returns an image in the response
            const buffer = Buffer.from(response.data);
            const isBlack = await isBlackImage({data: buffer, type: 'binary'});

            if (isBlack) {
                console.warn(`Black image detected. Skipping save for prompt: "${prompt}"`);
                return false;
            }

            const imageName = `${Date.now()}-${await this.fileCounter.increment()}.png`;
            const imgPath = path.join(imageFolderDir, imageName);
            const jsonPath = path.join(imageFolderDir, `${imageName}.json`);

            // Save the image asynchronously
            await fs.writeFile(imgPath, buffer, 'binary');

            // Prepare and save the metadata
            const metadata = {
                prompt,
                totalPrompt,
                options,
                timestamp: new Date().toISOString(),
            };
            await fs.writeJson(jsonPath, metadata, {spaces: 2});

            console.log(`Image saved: ${imgPath}`);
            return true;
        } catch (error) {
            if (error.code === 'ECONNABORTED') {
                console.error('Request timed out.');
            } else if (error.response) {
                console.error('API Error Response:', {
                    status: error.response.status,
                    data: error.response.data,
                });
            } else if (error.request) {
                console.error('No response received. Request details:', error.request);
            } else {
                console.error('Unexpected error:', error.message);
            }
            return false;
        }
    }
}

export default {
    init: (config) => new HuggingFace(config),
};
