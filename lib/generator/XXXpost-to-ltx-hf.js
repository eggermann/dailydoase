import fs from 'fs-extra';
import path from 'path';
import axios from 'axios';
import PostTo from './PostTo.js';
import store from '../store.cjs';

/**
 * Lightricks LTX-Video Hugging Face endpoints
 */
const LTX_HF_ENDPOINT = 'https://api-inference.huggingface.co/models/Lightricks/LTX-Video';

/**
 * Configurable LTX-Video HF client, modeled after FLUX.
 */
class PostToLTXHF extends PostTo {
    /**
     * @param {object} modelConfig
     */
    constructor(modelConfig = {}) {
        super(modelConfig);
        this.config = modelConfig;
        this.config.folderName = this.config.folderName ?? 'LTX-Video';
        this.endpoint = LTX_HF_ENDPOINT;
        this.apiToken = process.env.HUGGINGFACE_API_KEY;
    }

    async init() {
        await store.initCache(this.imageDir);
        return this;
    }

    /**
     * Generate video using Hugging Face LTX-Video endpoint.
     * @param {string} prompt
     * @param {object} options
     */
    async prompt(prompt, options = {}) {
        const totalPrompt = this.addStaticPrompt(prompt, options);

        const height = 512;
        const width = 768;
        const numFrames = 257;
        const seed = Math.round(1204 * Math.random());

        const headers = {
            'Authorization': `Bearer ${this.apiToken}`,
            'Content-Type': 'application/json'
        };

        const data = {
            inputs: totalPrompt,
            parameters: {
                height,
                width,
                num_frames: numFrames,
                seed
            }
        };

        try {
            const response = await axios.post(this.endpoint, data, { headers, responseType: 'arraybuffer' });
            if (response.status === 200) {
                const name = 'ltx-' + (await this.fileCounter.increment());
                this.handleNewSerie?.(this.imageDir, options);
                const outputPath = path.join(this.imageDir, `${name}.mp4`);
                await fs.writeFile(outputPath, response.data);
                options.prompt = prompt;
                options.totalPrompt = totalPrompt;
                await this.saveMetadata(name, options);
                console.log(`Video successfully generated and saved to ${outputPath}`);
                return { outputPath, metadata: options };
            } else {
                console.error(`Unexpected response status: ${response.status}`);
                return null;
            }
        } catch (error) {
            if (error.response && error.response.data) {
                try {
                    const errorJson = JSON.parse(error.response.data.toString('utf-8'));
                    console.error('Error generating video:', errorJson);
                } catch {
                    console.error('Error generating video:', error.response.data.toString('utf-8'));
                }
            } else {
                console.error('Error generating video:', error.message);
            }
            return null;
        }
    }

    /**
     * Save metadata as JSON.
     * @param {string} name
     * @param {object} metadata
     */
    async saveMetadata(name, metadata) {
        const jsonPath = path.join(this.imageDir, `${name}.json`);
        await fs.writeJson(jsonPath, metadata, { spaces: 2 });
    }
}

export default PostToLTXHF;

// Test function for PostToLTXHF
export async function testPostToLTXHF() {
    const PostToLTXHF = (await import('./post-to-ltx-hf.js')).default;
    const instance = new PostToLTXHF({ folderName: 'LTX-Video-Test' });
    await instance.init();
    const result = await instance.generateVideo('A test prompt for LTX-Video', {});
    console.log('Test result:', result);
}
