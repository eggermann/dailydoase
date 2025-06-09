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
        return { json: metadata, imgPath };   // allow caller to know the exact saved file
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

        // Define sensible defaults for FLUX parameters
        const defaultOptions = {
            width: 512,
            height: 512,
            num_inference_steps: 2,
            guidance_scale: 7.5,
            negative_prompt: '',
            seed: undefined
        };

        // Merge user-provided options with defaults
        const mergedOptions = { ...defaultOptions, ...options };

        // --- Sanity‑check / auto‑fix user‑supplied dimensions & steps -----------------
        // FLUX models require width & height ≥ 256 px and divisible by 16.
        const clampTo16 = (v) => Math.ceil(v / 16) * 16;
        mergedOptions.width = clampTo16(Math.max(256, mergedOptions.width));
        mergedOptions.height = clampTo16(Math.max(256, mergedOptions.height));

        // Minimum sensible inference steps: 4 for "schnell", 10 for "dev"
        const minSteps = this.fluxVariant === 'schnell' ? 4 : 10;
        if (mergedOptions.num_inference_steps < minSteps) {
            console.warn(
                `⚠️  num_inference_steps too low (${mergedOptions.num_inference_steps}); clamping to ${minSteps}`
            );
            mergedOptions.num_inference_steps = minSteps;
        }
        // -------------------------------------------------------------------------------

        if (!this.apiToken) {
            throw new Error('HF_API_TOKEN not set in environment');
        }

        // Build a `parameters` object per HF Diffusers Inference API spec
        const parameters = {
            width: mergedOptions.width,
            height: mergedOptions.height,
            num_inference_steps: mergedOptions.num_inference_steps,
            guidance_scale: mergedOptions.guidance_scale,
            negative_prompt: mergedOptions.negative_prompt,
            ...(mergedOptions.seed !== undefined && { seed: mergedOptions.seed })
        };

        const postBody = {
            inputs: totalPrompt,
            parameters
        };
        console.log('FLUX POST body:', JSON.stringify(postBody, null, 2));

        const response = await axios.post(
            this.endpoint,
            postBody,
            {
                headers: {
                    Authorization: `Bearer ${this.apiToken}`,
                    'Content-Type': 'application/json',
                    // Accept anything; let the server choose the best content‑type.
                    Accept: '*/*',
                },
                responseType: 'arraybuffer'
            }
        );

        const buffer = Buffer.from(response.data, 'binary');
        // If HF returns a JSON payload (e.g. {error: "..."} or queue message) instead of bytes,
        // bail out early so we don't write a corrupt file.
        const cType = response.headers['content-type'] || '';
        if (!cType.startsWith('image/')) {
            const msg = buffer.toString('utf-8');
            console.error(`FLUX: Unexpected content-type: ${cType}`);
            console.error(`FLUX: Response (first 200 chars): ${msg.slice(0, 200)}…`);
            let hfErr = 'HF inference returned non‑image response';
            try {
                const { error: apiError, estimated_time } = JSON.parse(msg);
                if (apiError) {
                    hfErr = `HF inference error: ${apiError}${estimated_time ? ` (retry in ~${estimated_time}s)` : ''}`;
                }
            } catch { /* not JSON – keep generic message */ }
            throw new Error(hfErr);
        }

        const name = (mergedOptions && mergedOptions.name) || 'flux';
        let savedPath = null;

        let data = null;
        if (response.status === 200) {
            const data = await this.saveFile(buffer, name, totalPrompt);

            return data;
        }
        // Return the actual saved file path (or null if save failed)

        throw new Error('no' + response.status + ' response from FLUX API');
    }
}

let cachedInstance = null;

export default {
    init: async (config) => {
        const instance = new PostToFLUX(config);
        cachedInstance = await instance.init();
        return cachedInstance;
    },
    get: async () => cachedInstance || (async (config={}) => {
         const instance = new PostToFLUX(config);
        cachedInstance = await instance.init();
        return cachedInstance;
    })(),
}
