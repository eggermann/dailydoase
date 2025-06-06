import fs from 'fs-extra';
import path from 'path';
import sharp from 'sharp';
import store from '../store.cjs';
import PostTo from './PostTo.js';



/**
 * Generate a coloured “Zuckertütchen” (little sugar‑packet) PNG.
 * The packet colour is driven by `model.color` (defaults to #FF0000).
 */
class GenSeq extends PostTo {
    constructor(modelConfig) {
        super(modelConfig);
        this.config = modelConfig;
        this.config.folderName = this.config.folderName ?? 'genSeq';
    }

    async init() {
        await store.initCache(this.imageDir);
        return this;
    }

    /**
   * Save the generated image and metadata after a delay.
   * @param {string} svg - SVG content to save as PNG.
   * @param {string} name - Base name for the image file.
   * @param {string} totalPrompt - The prompt used for generation.
   */
    async saveFile(svg, name, totalPrompt) {
        const imageName = `${Date.now()}-${name}.png`;
        const imgPath = path.join(this.imageDir, imageName);
        const jsonPath = path.join(this.imageDir, `${imageName}.json`);

        await sharp(Buffer.from(svg))
            .png()
            .toFile(imgPath);
        store.addFile(path.basename(this.imageDir), imageName);

        const metadata = {
            prompt: totalPrompt,
            color: this.color,
            timestamp: new Date().toISOString()
        };
        await fs.writeJson(jsonPath, metadata, { spaces: 2 });

        console.log(`Test image saved: ${imgPath}`);
    }

    /**
     * @param {string} prompt – optional extra text to identify the run
     * @param {object} [options]
     */
    async prompt(prompt = '', options = {}) {
        await this.checkSignature();
        const totalPrompt = this.addStaticPrompt(prompt, options);
        // genSeq variant: intentionally leave the packet text empty
        const svgText = '';

        const name = 'genSeq-test';

        try {



            

            // Extra promise save function
            await new Promise(resolve => setTimeout(resolve, 5000));
            // await this.save();

            return true;
        } catch (error) {
            console.error('Error in colorize test:', error);
            return false;
        }
    }
}


let cachedInstance = null;

export default {
    init: async (config) => {
        const instance = new GenSeq(config);
        cachedInstance = await instance.init();
        if (!cachedInstance) {
            // Instance already initialized above
        }
        return cachedInstance;
    },
    get: () => cachedInstance
}

