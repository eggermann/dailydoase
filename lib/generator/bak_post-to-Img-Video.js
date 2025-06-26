import fs from 'fs-extra';
import path from 'path';
import sharp from 'sharp';
import PostTo from './PostTo.js';
import FLUX from './post-to-FLUX.js';
import LTXVideo from './post-to-ltx-distilled.js';

import promptCreator from '../prompt-creator.js';
import { console } from 'inspector';
import { merge } from 'cheerio';

const _promptBuffer = [];

class GenImgVideo extends PostTo {
    constructor(modelConfig) {
        super(modelConfig);
        this.config = modelConfig;
        this.config.folderName = this.config.folderName ?? 'image-video';
    }

    async init() {

        return this;
    }


    async prompt(streams, options = {}) {
        console.log('GenImgVideo prompt called with streams:', streams, 'and options:', options);

        await this.checkSignature();

        const name = 'FluxToVideo';

        try {
            const flux = await FLUX.get(this.config);

            let prompt = await promptCreator.default(streams, options);
            const totalPrompt = this.addStaticPrompt(prompt, options);


            const a = { ...this.config, ...(options.image || {}) };
            console.log('GenImgVideo prompt:', totalPrompt, a);



            const data1 = await flux.prompt(totalPrompt, a);


            console.log('GenImgVideo prompt:', totalPrompt);
            console.log('GenImgVideo prompt:', data1);

            const mergedConfig = { ...this.config, ...(options.video || {}) };

            const ltx = await LTXVideo.get(data1.imgPath, mergedConfig);


            console.log('GenImgVideo prompt:', totalPrompt);
            console.log('GenImgVideo prompt:', data1);


            //console.log('Loaded FLUX images:', fluxImages.map(img => img.name || 'unnamed'));



            // Extra promise save function
            await new Promise(resolve => setTimeout(resolve, 1000));


            return true;
        } catch (error) {
            console.error('GenImgVideo', error);
            return false;
        }
    }
}

let cachedInstance = null;

export default {

    init: async (config) => {
        const instance = new GenImgVideo(config).init();
        return instance;
    }
}

