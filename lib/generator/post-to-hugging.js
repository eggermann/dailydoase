import https from 'https';
import axios from 'axios';
import fs from 'fs-extra';
import path from 'path';
import dotenv from 'dotenv';
import {fileURLToPath} from 'url';
import {createRequire} from 'module';
import axiosRetry from 'axios-retry';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);
const {isBlackImage} = require(path.join(__dirname, '/../helper/isBlackImage.cjs'));

import PostTo from './PostTo.js';

const _HF_API_KEY = process.env.HF_API_KEY;

if (!_HF_API_KEY) {
    throw new Error("Hugging Face API key is not set. Check your .env file.");
}

// Configure Axios for retry logic
axiosRetry(axios, {
    retries: 3,
    retryDelay: (retryCount) => retryCount * 1000, // Exponential backoff
    retryCondition: (error) => {
        return axiosRetry.isNetworkOrIdempotentRequestError(error) || error.response?.status >= 500;
    },
});

class HuggingFace extends PostTo {
    constructor(modelConfig) {
        super(modelConfig);

        this.config = modelConfig;
        this.config.folderName = this.config.folderName ?? 'HF';
        this.config.url = this.config.url
            ?? 'https://api-inference.huggingface.co/models/black-forest-labs/FLUX.1-schnell';
    }

    async prompt(prompt, options = {}) {
        await this.checkSignature();

        try {
            const totalPrompt = this.addStaticPrompt(prompt, options);
            const imageFolderDir = this.imageDir;

            const payload = {
                inputs: totalPrompt,
                parameters: {
                    // Uncomment and adjust as needed
                    // negative_prompt: options.negative_prompt || 'katze',
                    //    temperature:.7
                    num_inference_steps: '10'
                },
            };

            // Log the payload for debugging
            console.log('Payload sent to Hugging Face API:', JSON.stringify(payload, null, 2));

            const agent = new https.Agent({keepAlive: true});

            const response = await axios.post(
                this.config.url,
                payload,
                {
                    headers: {
                        'X-Wait-For-Model': true,
                        Authorization: `Bearer ${_HF_API_KEY}`,
                        Accept: 'application/json',
                        'Content-Type': 'application/json',
                    },
                    responseType: 'arraybuffer',
                    timeout: 60000 * 4, // 60 seconds timeout
                    httpsAgent: agent,
                }
            );

            const buffer = Buffer.from(response.data);
            const isBlack = await isBlackImage({data: buffer, type: 'binary'});

            if (isBlack) {
                console.warn(`Black image detected. Skipping save for prompt: "${prompt}"`);
                return true;
            }

            const imageName = `${Date.now()}-${await this.fileCounter.increment()}.png`;
            const imgPath = path.join(imageFolderDir, imageName);
            const jsonPath = path.join(imageFolderDir, `${imageName}.json`);

            // Save the image file
            await fs.writeFile(imgPath, buffer, 'binary');

            // Save metadata
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
            if (error.response) {
                console.error('API Error Response:', {
                    status: error.response.status,
                    data: error.response.data.toString(),
                });
            } else if (error.request) {
                console.error('No response received. Request details:', {
                    method: error.request?.method || 'undefined',
                    headers: error.request?._header || 'undefined',
                    data: error.request?._data || 'undefined',
                });
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