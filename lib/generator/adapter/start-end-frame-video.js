import PostTo from '../PostTo.js';
import FLUX from '../post-to-FLUX.js';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import { PostToWan22_FirstLastFrame } from '../wan22/firstLastFrame.js';
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

        this.workType = "start-end-frame-video";
        this.config.folderName = modelConfig.folderName ?? this.workType;

        this.config = modelConfig;
        this.videoModel = null;
        this.flux = null;
    }

    async init() {
        await this.checkSignature();

        this.videoModel = await new PostToWan22_FirstLastFrame({
            //: path.basename(tmpDir),
            /* steps: 2,
             duration_seconds: 1.0,
             guidance_scale: 1.0,
             guidance_scale_2: 1.0,
             seed: 0,
             randomize_seed: false,*/
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
            if (this.repeatVideoCall) {

                console.log('\x1b[32m%s\x1b[0m', 'Generator: repeating last video call');
                const data = await this.repeatVideoCall();
                delete this.repeatVideoCall;
                return data;
            }

            let startFrame = this.lastEndFRame;//

            if (!startFrame) {
                startFrame = await this.generateImage(streams, options);
            }
            options.name = fileName + '-end';
            this.lastEndFRame = await this.generateImage(streams, options);
            options.endImageStream = this.lastEndFRame.image.path;

            const videoPrompt = options.video.prompts || {};
            let totalPrompt = "";

            console.log('Generator startFrame:------->', startFrame);
            let prompt;
            if (videoPrompt.create) {
                prompt = videoPrompt.create(startFrame.image.path, options.video.model);
                console.log('\x1b[35m%s\x1b[0m', `video prompt: ${prompt}`);
            }
            totalPrompt = this.addStaticPrompt(prompt, options.video.staticPrompt);
            options.video.model.prompt = options.video.useImagePrompt
                ? startFrame.json.prompt : '';

            const mergedConfig = { ...this.config, ...(options.video.model || {}) };
            mergedConfig.prompt = totalPrompt

            //  console.log('GenImgVideo final video prompt:', totalPrompt, 'mergedConfig:', mergedConfig);


            this.repeatVideoCall = async function () {
                const data = await this.videoModel.prompt(startFrame.image.path, mergedConfig);
                return data;
            }


            const data = await this.repeatVideoCall();
            delete this.repeatVideoCall;
            console.log('GenImgVideo final video data:', data);
            return data;
        } catch (error) {
            console.error('GenImgVideo', error);

            const retries = options._retryCount || 0;
            const maxRetries = (options.video && options.video.maxRetriesOnAbort) ?? 3;
            const retryDelayMs = (options.video && options.video.retryDelayMs) ?? 10000;

            // Detect "GPU task aborted" from various shapes of the error
            const isGpuAbort = (() => {
                try {
                    if (!error) return false;
                    const parts = [];

                    if (typeof error === 'string') parts.push(error);
                    if (error.message) parts.push(String(error.message));
                    if (error.title) parts.push(String(error.title));
                    if (error.stage) parts.push(String(error.stage));
                    if (error.message || error.title || error.stage) {
                        if (error.success === false) parts.push('success:false');
                    }
                    if (error.response && error.response.data) {
                        const body = Buffer.isBuffer(error.response.data)
                            ? Buffer.from(error.response.data).toString('utf-8')
                            : String(error.response.data);
                        parts.push(body);
                    }
                    const haystack = parts.join(' | ').toLowerCase();
                    return haystack.includes('gpu task aborted') || haystack.includes('zerogpu worker error');
                } catch {
                    return false;
                }
            })();

            if (isGpuAbort && retries < maxRetries) {
                console.warn(`GenImgVideo: GPU task aborted. Retrying ${retries + 1}/${maxRetries} after ${retryDelayMs}ms`);
                await new Promise(res => setTimeout(res, retryDelayMs));
                return await this.prompt(streams, { ...options, _retryCount: retries + 1, });
            }

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
