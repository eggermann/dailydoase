import PostTo from '../PostTo.js';
import FLUX from '../post-to-FLUX.js';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import { PostToWan22_5B_ImageVideo } from '../wan22/imageVideo.js';
import promptCreator from '../../prompt-creator.js';
//const tmpDir = await fs.mkdtemp(path.join(__dirname, 'wan22-firstlast-test-'));


/**
 * Configurable FLUX client, modeled after GenSeq.
 */
class Generator extends PostTo {
    /**
     * @param {object} modelConfig
     * @param {'schnell'|'dev'} [modelConfig.fluxVariant] - Choose FLUX endpoint
     */
    constructor(modelConfig) {
        super(modelConfig);

        this.workType = "start-frame-video";
        this.config.folderName = modelConfig.folderName ?? this.workType;

        this.config = modelConfig;
        this.videoModel = null;
        this.flux = null;
    }

    async init() {
        await this.checkSignature();

        this.videoModel = await new PostToWan22_5B_ImageVideo({


        }).init();
        this.flux = await FLUX.init(this.config.image);

        this.videoModel.imageDir = path.join(this.imageDir);
        this.flux.imageDir = path.join(this.videoModel.imageDir);



        // await store.initCache(this.imageDir);
        return this;
    }
    async generateImage(streams, options) {



        let prompt = await promptCreator.default(streams, options);
        const imageOptions = options.image.options || {};

        if (imageOptions?.prompts?.create) {
            prompt = imageOptions.prompts.create(prompt);
        }

        const totalImagePrompt = this.addStaticPrompt(prompt, imageOptions.staticPrompt);
        const defaultAndImageConfigMerged = { ...this.config, ...imageOptions };
        // console.log('GenImgVideo prompt:', totalPrompt, defaultAndImageConfigMerged);

        const data = await this.flux.prompt(totalImagePrompt, defaultAndImageConfigMerged);
        //   console.log('GenImgVideo data1:', data1);
        //     process.exit



        return data;

    }
    /**
     * Generate an image using the FLUX model.
     * @param {string} prompt
     * @param {object} [options]
     * @returns {Promise<string>} Path to saved image
     */
    async prompt(streams, options = {}) {

        const fileName = '' + Date.now();
        options.name = fileName;
        console.log('Generator prompt:', this.imageDir);


        try {
            const startFrame = await this.generateImage(streams, options);

            const videoPrompt = options.video.prompts || {};
            let totalPrompt = "";
            let prompt;
            if (videoPrompt.create) {
                prompt = videoPrompt.create(startFrame.image.path, options.video);
                console.log('\x1b[35m%s\x1b[0m', `video prompt: ${prompt}`);
            }
            totalPrompt = this.addStaticPrompt(prompt, options.video.staticPrompt);
            //--> ust hthe image prompt  /*??*/options.video.prompt = options.video.useImagePrompt ? data1.json.modelProbe : '';

            const mergedConfig = { ...this.config, ...(options.video || {}) };
            mergedConfig.prompt = totalPrompt

            //  console.log('GenImgVideo final video prompt:', totalPrompt, 'mergedConfig:', mergedConfig);
            const data = await this.videoModel.prompt(startFrame.image.path, mergedConfig);
            console.log('GenImgVideo final video data:', data);
            return data;
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
        const instance = new Generator(config).init();

        return instance;
    }
    /*,
    get: async () => cachedInstance || (async (config={}) => {
         const instance = new PostToFLUX(config);
        cachedInstance = await instance.init();
        return cachedInstance;
    })(),*/
}
