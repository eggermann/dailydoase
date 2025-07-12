// Hugging Face FLUX model API client for image generation
import fs from 'fs-extra';
import path from 'path';
import PostTo from './PostTo.js';
import FLUX from './post-to-FLUX.js';

import promptCreator from '../prompt-creator.js';
import LTXVideo from './post-to-ltx-distilled.js';



/**
 * Configurable FLUX client, modeled after GenSeq.
 */
class GenImgVideo extends PostTo {
    /**
     * @param {object} modelConfig
     * @param {'schnell'|'dev'} [modelConfig.fluxVariant] - Choose FLUX endpoint
     */
    constructor(modelConfig) {
        super(modelConfig);
        this.config = modelConfig;
        this.config.folderName = this.config.folderName ?? 'image-video';
        this.ltxVideo = null;
        this.flux = null;
    }

    async init() {
        this.ltxVideo = await LTXVideo.init(this.config.video);
        this.flux = await FLUX.init(this.config.image);


        // await store.initCache(this.imageDir);
        return this;
    }




    /**
     * Generate an image using the FLUX model.
     * @param {string} prompt
     * @param {object} [options]
     * @returns {Promise<string>} Path to saved image
     */
    async prompt(streams, options = {}) {
        await this.checkSignature();

        try {


            let prompt = await promptCreator.default(streams, options);
            const totalPrompt = this.addStaticPrompt(prompt, options);


            const defaultAndImageConfigMerged = { ...this.config, ...(options.image || {}) };
            // console.log('GenImgVideo prompt:', totalPrompt, defaultAndImageConfigMerged);

            const data1 = await this.flux.prompt(totalPrompt, defaultAndImageConfigMerged);


            // console.log('GenImgVideo prompt:', data1);



            /////VIDEO

            //    console.log('GenImgVideo prompt:', data1.imgPath, 'mergedConfig:', this.config.video);


            if (options.video.useImagePrompt) {
                console.log('GenImgVideo prompt:', data1.json.modelProbe, 'mergedConfig:', this.config.video);

            }

            options.video.prompt = options.video.useImagePrompt ? data1.json.modelProbe : '';

            const mergedConfig = { ...this.config, ...(options.video || {}) };



            console.log('GenImgVideo prompt:', data1);

            const data = await this.ltxVideo.prompt(data1.imgPath, mergedConfig);



            //console.log('Loaded FLUX images:', fluxImages.map(img => img.name || 'unnamed'));



            // Extra promise save function
            await new Promise(resolve => setTimeout(resolve, 1000));


            return true;
        } catch (error) {
            console.error('GenImgVideo', error);
            return false;
        }


        return true;



    }
}

let cachedInstance = null;

export default {
    init: async (config) => {
        const instance = new GenImgVideo(config).init();

        return instance;
    }
    /*,
    get: async () => cachedInstance || (async (config={}) => {
         const instance = new PostToFLUX(config);
        cachedInstance = await instance.init();
        return cachedInstance;
    })(),*/
}
