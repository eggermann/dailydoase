// Hugging Face FLUX model API client for image generation
import fs from 'fs-extra';
import path from 'path';
import axios from 'axios';
import store from '../store.cjs';
import PostTo from './PostTo.js';

/**
 * FLUX endpoints
 */
const FLUX_ENDPOINTS = {
    schnell: 'https://api-inference.huggingface.co/models/black-forest-labs/FLUX.1-schnell',
    dev: 'https://api-inference.huggingface.co/models/black-forest-labs/FLUX.1-dev'
};

/**
 * Configurable FLUX client, modeled after GenSeq.
 */
class PostToFLUX extends PostTo {
    /**
     * @param {object} modelConfig
     * @param {'schnell'|'dev'} [modelConfig.fluxVariant] - Choose FLUX endpoint
     */
    constructor(modelConfig = {}) {
        super(modelConfig);
        this.config = modelConfig;
        this.config.folderName = this.config.folderName ?? 'FLUX';
        this.fluxVariant = modelConfig.fluxVariant || 'schnell';
        this.endpoint = FLUX_ENDPOINTS[this.fluxVariant] || FLUX_ENDPOINTS.schnell;
        this.apiToken = process.env.HF_API_TOKEN;
    }

    async init() {
        await store.initCache(this.imageDir);
        return this;
    }

    /**
     * Save the generated image and metadata.
     * @param {Buffer} imageBuffer
     * @param {string} name
     * @param {string} prompt
     */
    async saveFile(imageBuffer, name, prompt) {
        const imageName = `${Date.now()}-${name}.jpeg`;
        const imgPath = path.join(this.imageDir, imageName);
        const jsonPath = path.join(this.imageDir, `${imageName}.json`);

        await fs.writeFile(imgPath, imageBuffer);
        store.addFile(path.basename(this.imageDir), imageName);

        const metadata = {
            prompt,
            endpoint: this.endpoint,
            timestamp: new Date().toISOString()
        };
        await fs.writeJson(jsonPath, metadata, { spaces: 2 });

        console.log(`FLUX image saved: ${imgPath}`);
    }

    /**
     * Generate an image using the FLUX model.
     * @param {string} prompt
     * @param {object} [options]
     * @returns {Promise<string>} Path to saved image
     */
    async prompt(prompt = '', options = {}) {
        await this.checkSignature();
        const totalPrompt = this.addStaticPrompt(prompt, options);

        if (!this.apiToken) {
            throw new Error('HF_API_TOKEN not set in environment');
        }

        const response = await axios.post(
            this.endpoint,
            { inputs: totalPrompt },
            {
                headers: {
                    Authorization: `Bearer ${this.apiToken}`,
                    'Content-Type': 'application/json',
                    Accept: 'image/*'                // <-- ask HF to stream raw image bytes
                },
                responseType: 'arraybuffer'
            }
        );

        const buffer = Buffer.from(response.data, 'binary');
        // If HF returns a JSON payload (e.g. {error: "..."} or queue message) instead of bytes,
        // bail out early so we don't write a corrupt file.
        const cType = response.headers['content-type'] || '';
        if (!cType.startsWith('image')) {
            const msg = buffer.toString('utf-8');
            throw new Error(`HF inference returned non-image response: ${msg.slice(0, 200)}…`);
        }
        const name = (options && options.name) || 'flux';
        if (response.status === 200) {
            await this.saveFile(buffer, name, totalPrompt);
        }
        return path.join(this.imageDir, `${Date.now()}-${name}.jpeg`);
    }
}

let cachedInstance = null;

export default {
    init: async (config) => {
        const instance = new PostToFLUX(config);
        cachedInstance = await instance.init();
        return cachedInstance;
    },
    get: async () => cachedInstance || (async() => {
        cachedInstance = await instance.init();
        return cachedInstance;
    })(),
}

