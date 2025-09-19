import PostTo from '../PostTo.js';
import FLUX from '../post-to-FLUX.js';
import fs from 'fs-extra';
import path from 'path';
import promptCreator from '../../prompt-creator.js';

import { PostToWan22_FirstLastFrame } from '../wan22/firstLastFrame.js';
//import { fileURLToPath } from 'url';
import { PostToMirelo_VideoSound } from '../mireloAI/video-sound.js';
import { muxVideoAndAudio } from '../utils.js';

import { saveJSON, downloadToFile } from './../save-utils.js';



//const __filename = fileURLToPath(import.meta.url);
//const __dirname = path.dirname(__filename);



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


        this.mireloAI = await new PostToMirelo_VideoSound({

            duration: 5.1,
            num_samples: 1,
            steps: 25,
            seed: -1,
            creativity_coef: 4.5,
            maxRetries5xx: 0,
            retryDelayMs: 250,
            text_prompt: 'A soundscape from an 80s reality show, with laughter and applause, like Al Bundy',
        }).init((this.config.mireloAI) ?? {});

        this.videoModel = await new PostToWan22_FirstLastFrame({
            //: path.basename(tmpDir),
            /* steps: 2,
             duration_seconds: 1.0,
             guidance_scale: 1.0,
             guidance_scale_2: 1.0,
             seed: 0,
             randomize_seed: false,*/
        }).init((this.config.video.model) ?? {});

        this.flux = await FLUX.init(this.config.image);

        this.mireloAI.imageDir = path.join(this.imageDir, '/parts');
        this.videoModel.imageDir = path.join(this.imageDir, '/parts');
        this.flux.imageDir = path.join(this.imageDir, '/parts');

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

            //   console.log('Generator startFrame:------->', startFrame);
            let prompt;
            if (videoPrompt.create) {
                prompt = videoPrompt.create(startFrame.image.path, options.video.model);
                console.log('\x1b[35m%s\x1b[0m', `video prompt: ${prompt}`);
            }
            totalPrompt = this.addStaticPrompt(prompt, options.video.staticPrompt);

            options.video.model.prompt = options.video.useImagePrompt
                ? startFrame.json.metadata.prompt : '';

            const mergedConfig = { ...this.config, ...(options.video.model || {}) };
            //    mergedConfig.prompt = totalPrompt??startFrame.json.prompt;
            //  console.log(' options.video.model.prompt: ', options.video.model.prompt);

            //  console.log('GenImgVideo final video prompt:', totalPrompt, 'mergedConfig:', mergedConfig);


            this.repeatVideoCall = async function () {
                const data = await this.videoModel.prompt(startFrame.image.path, mergedConfig);

                console.log('\x1b[33m%s\x1b[0m', 'GenImgVideo data --> :', data);
                return data;
            }

            const videoData = await this.repeatVideoCall();
            delete this.repeatVideoCall;
            // console.log('this.videoModel.prompt res: ', videoData);
            const videoUrl = videoData.json.metadata.url;
            options.mireloAI.prompt = startFrame.json.metadata.prompt;
            const dataFromMirelo = (await this.mireloAI.prompt(videoUrl, options.mireloAI));
            if (!dataFromMirelo) {
                throw new Error('Mirelo did not return an audio file (soundPath is empty).');
            }
            console.log('dataFromMirelo: ', dataFromMirelo);
            const savePath = path.join(this.imageDir, `${fileName}-mirelo-video-sound`);
            const audioPath = dataFromMirelo.file;
            const videoPath = videoData.file;

            // Determine if we actually received an audio asset (.wav/.mp3/etc.)
            console.log('audioPath:', audioPath);
            let finalVideoPath;

            if (audioPath) {

                try {
                    const op = {
                        outputName: `${fileName}-final.mp4`

                    }
                    
                    const mergedPath = await muxVideoAndAudio(videoPath, audioPath, this.imageDir, op);

                    console.log('-:', finalVideoPath);
                    //  await fs.copy(mergedPath, finalVideoPath);
                    console.log('GenImgVideo: muxed video and audio to', mergedPath);


                    const allDats = {
                        file: mergedPath,
                        //  file: await downloadToFile(url, savePath),
                        json: await saveJSON(savePath, {
                            mergedPath,
                            mireloResponse: dataFromMirelo,
                            videoResponse: videoData,
                            imageResponse: startFrame,
                        })
                    };




                    // Optional YouTube gate/upload trigger
                    if (false && options.uploadToYT) {
                        const cfg = options.uploadToYT;

                        
                        const maxDur = typeof cfg === 'number'
                            ? cfg
                            : (cfg.maxDuration ?? cfg.max ?? (typeof cfg === 'object' ? 0 : Number(cfg)));
                        if (Number(maxDur) > 0) {
                            try {
                                await uploadToYT({ maxDuration: Number(maxDur), path: this.imageDir });
                            } catch (e2) {
                                console.warn('[uploadToYT] invocation failed:', e2?.message || e2);
                            }
                        }
                    }
                } catch (e) {
                    console.warn('GenImgVideo: mux failed, returning original video. Reason:', e?.message || e);
                    finalVideoPath = videoUrl;
                }
            } else {
                // No usable audio (likely an error JSON or fallback video file)
                console.warn('GenImgVideo: no audio candidate resolved (possibly Mirelo error JSON). Returning original video only.');
                finalVideoPath = videoUrl;
            }

            return finalVideoPath;
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
