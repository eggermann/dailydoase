// post-to-FLUX.js
// Hugging Face FLUX model API client for image generation

import fs from 'fs-extra';
import path from 'path';
import axios from 'axios';
import PostTo from './PostTo.js';
import { saveJSON, saveJPG } from './save-utils.js';

const defaultOptions = {
    width: 512,
    height: 512,
    num_inference_steps: 4,
    guidance_scale: 7.5,
    negative_prompt: '',
    seed: undefined
};

/**
 * FLUX endpoints via HF router
 * Docs: https://huggingface.co/docs/api-inference/index
 */
const HF_ROUTER_BASE = 'https://router.huggingface.co/hf-inference';

const FLUX_ENDPOINTS = {
    schnell: `${HF_ROUTER_BASE}/models/black-forest-labs/FLUX.1-schnell`,
    dev: `${HF_ROUTER_BASE}/models/black-forest-labs/FLUX.1-dev`
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

        this.workType = 'image';
        this.config = modelConfig;
        this.config.folderName = this.config.folderName ?? 'FLUX';

        this.fluxVariant = modelConfig.fluxVariant || 'schnell';
        this.endpoint = FLUX_ENDPOINTS[this.fluxVariant] || FLUX_ENDPOINTS.schnell;
        this.apiToken = process.env.HF_API_TOKEN;

        this._setupImageDir();

        console.log('[PostToFLUX] Config:', this.config);
        console.log('[PostToFLUX] imageDir set to:', this.imageDir);
    }

    /**
     * Ensure image directory exists.
     * @private
     */
    _setupImageDir() {
        // If you want a subfolder per client, uncomment:
        // this.imageDir = path.join(this.imageDir, this.config.folderName);
        if (!fs.existsSync(this.imageDir)) {
            fs.ensureDirSync(this.imageDir);
        }
    }

    async init() {
        return this;
    }

    /**
     * Generate an image using the FLUX model.
     * @param {string} prompt
     * @param {object} [options]
     * @returns {Promise<object|false>} Save result paths
     */
    async prompt(prompt = '', options = {}) {
        // Optional auth / signature check from parent class
        await this.checkSignature();

        let totalPrompt = prompt;

        if (this.config.prompts) {
            totalPrompt = await this.config.prompts.create(prompt);
        }

        console.log('FLUX totalPrompt\x1b[32m', totalPrompt, ':\x1b[0m');

        const totalPromptWithStatic = this.addStaticPrompt(totalPrompt, options);

        // Merge user-provided options with defaults
        // options.image?.model is safe even if options.image is undefined
        const mergedOptions = {
            ...defaultOptions,
            ...options,
            ...(options.image?.model || {})
        };

        // --- Sanity-check / auto-fix user-supplied dimensions & steps -----------------
        // FLUX models require width & height ≥ 256 px and divisible by 16.
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
            inputs: totalPromptWithStatic,
            parameters
        };

        // console.log('FLUX POST body:', JSON.stringify(postBody, null, 2));

        let response;
        try {
            response = await axios.post(
                this.endpoint,
                postBody,
                {
                    headers: {
                        Authorization: `Bearer ${this.apiToken}`,
                        'Content-Type': 'application/json',
                        // You can tighten this to 'image/png, image/jpeg, application/json' if you like
                        Accept: '*/*'
                    },
                    responseType: 'arraybuffer'
                }
            );
        } catch (err) {
            // Log a clear error message with status code and error details
            if (err.response) {
                console.error(`[FLUX] AxiosError: ${err.message} (status: ${err.response.status})`);
                if (err.response.data) {
                    try {
                        const errJson = JSON.parse(Buffer.from(err.response.data).toString('utf-8'));
                        console.error(`[FLUX] API error: ${errJson.error || err.response.data}`);
                    } catch {
                        console.error(
                            `[FLUX] API error: ${Buffer.from(err.response.data).toString('utf-8')}`
                        );
                    }
                }
            } else {
                console.error(`[FLUX] Request failed: ${err.message}`);
            }

            throw err;
        }

        const buffer = Buffer.from(response.data, 'binary');

        // If HF returns a JSON payload instead of bytes, bail out early so we don't write a corrupt file.
        const cType = response.headers['content-type'] || '';
        if (!cType.startsWith('image/')) {
            const msg = buffer.toString('utf-8');
            console.error(`FLUX: Unexpected content-type: ${cType}`);
            console.error(`FLUX: Response (first 200 chars): ${msg.slice(0, 200)}…`);
            let hfErr = 'HF inference returned non-image response';

            try {
                const { error: apiError, estimated_time } = JSON.parse(msg);
                if (apiError) {
                    hfErr = `HF inference error: ${apiError}${
                        estimated_time ? ` (retry in ~${estimated_time}s)` : ''
                    }`;
                }
            } catch {
                // not JSON – keep generic message
            }

            throw new Error(hfErr);
        }

        if (response.status === 200) {
            const name = mergedOptions.name || 'flux';

            const image = await saveJPG(this.imageDir, name, { buffer });
            const json = await saveJSON(image.path, {
                prompt: totalPromptWithStatic,
                endpoint: this.endpoint
            });

            const data = { image, json };

            return data;
        }

        console.error(`FLUX API error: Received status ${response.status}`);
        return false;
    }
}

export default {
    init: async (config) => {
        const instance = new PostToFLUX(config);
        return instance;
    }
};