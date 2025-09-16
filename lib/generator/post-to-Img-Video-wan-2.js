import PostTo from './PostTo.js';
import FLUX from './post-to-FLUX.js';

import videoModel from './post-to-wan.js';
import promptCreator from '../prompt-creator.js';


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

        const workType = 'image-video-wan';
        this.workType = workType;
        this.config = modelConfig;
        this.config.folderName = this.config.folderName ?? workType;
        this.videoModel = null;
        this.flux = null;
    }

    async init() {
        this.videoModel = await videoModel.init(this.config.video);
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
            const imageOptions = options.image.options || {};
            let prompt = await promptCreator.default(streams, options);

            if (imageOptions?.prompts?.create) {
                prompt = imageOptions.prompts.create(prompt);
            }

            
            const totalImagePrompt = this.addStaticPrompt(prompt, imageOptions.staticPrompt);
            const defaultAndImageConfigMerged = { ...this.config, ...imageOptions };
            // console.log('GenImgVideo prompt:', totalPrompt, defaultAndImageConfigMerged);

            const data1 = await this.flux.prompt(totalImagePrompt, defaultAndImageConfigMerged);
            console.log('GenImgVideo data1:', data1);

            const videoPrompt = options.video.prompts || {};
            console.log('GenImgVideo videoOptions:', videoPrompt);


            if (videoPrompt.create) {
                prompt = videoPrompt.create(totalImagePrompt);
                console.log('\x1b[35m%s\x1b[0m', `response createLyrics: ${prompt}`);
            }


            // Colorize model response for better visibility

            const totalPrompt = this.addStaticPrompt(prompt, options.video.staticPrompt);


            //--> ust hthe image prompt  /*??*/options.video.prompt = options.video.useImagePrompt ? data1.json.modelProbe : '';

            const mergedConfig = { ...this.config, ...(options.video || {}) };

            console.log('GenImgVideo prompt:', data1);
            mergedConfig.prompt = totalPrompt
            const data = await this.videoModel.prompt(data1.imgPath, mergedConfig);


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
