import PostTo from './PostTo.js';
import FLUX from './post-to-FLUX.js';
import wan from './post-to-wan.js';
import { PostToWan22_FirstLastFrame } from './wan22/firstLastFrame.js';
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
        this.videoModel = await new PostToWan22_FirstLastFrame(this.config.video).init();
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

            const totalImagePrompt = this.addStaticPrompt(prompt, imageOptions);
            const defaultAndImageConfigMerged = { ...this.config, ...imageOptions };
            // console.log('GenImgVideo prompt:', totalPrompt, defaultAndImageConfigMerged);

            const data1 = await this.flux.prompt(totalImagePrompt, defaultAndImageConfigMerged);


      console.log('GenImgVideo data1:', data1);


            /////VIDEO

            //    console.log('GenImgVideo prompt:', data1.imgPath, 'mergedConfig:', this.config.video);

            const prompTags = await this.config.prompts.createStyleTags(prompt);

            console.log('\x1b[36m%s\x1b[0m', `prompt tags : ${prompTags}`);


            const lyrics = await this.config.prompts.createLyrics(prompTags, prompt);

            // Colorize model response for better visibility
            console.log('\x1b[35m%s\x1b[0m', `response createLyrics: ${lyrics}`);
  const totalPrompt = this.addStaticPrompt(lyrics, options);
           

            if (options.video.useImagePrompt) {
                console.log('GenImgVideo: using image prompt from image stage');
            }

            options.video.prompt = options.video.useImagePrompt ? totalImagePrompt : (options.video.prompt || '');

            const mergedConfig = { ...this.config, ...(options.video || {}) };

            console.log('GenImgVideo prompt:', data1);
            mergedConfig.prompt = totalPrompt
            const data = await this.videoModel.prompt(data1.imgPath, mergedConfig);



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
