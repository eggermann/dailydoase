import PostTo from '../PostTo.js';
import AiqtechNSFW from '../text-image/aiqtech-NSFW-Real/textImage.js';
import ImageActorInScene from '../image-image/imageActorInScene.js';
import FLUX from '../post-to-FLUX.js';
import fs from 'fs-extra';
import path from 'path';
import promptCreator from '../../prompt-creator.js';

import { PostToWan22_FirstLastFrame } from '../image-video/wan22/firstLastFrame.js';
import { PostToWan22_5B_ImageVideo } from '../image-video/wan22/imageVideo.js';


//import { fileURLToPath } from 'url';
import { PostToMirelo_VideoSound } from '../mireloAI/video-sound.js';
import { muxVideoAndAudio } from '../utils.js';
import { extractLastFrame } from '../ffmpeg-helpers.js';

import { saveJSON, downloadToFile } from './../save-utils.js';


import { gateConcatAndUpload } from '../../helper/yt-upload/gate-and-upload.js';

//const __filename = fileURLToPath(import.meta.url);
//const __dirname = path.dirname(__filename);



class Generator extends PostTo {
    /**
     * @param {object} modelConfig
     * @param {'schnell'|'dev'} [modelConfig.fluxVariant] - Choose FLUX endpoint
     */
    constructor(modelConfig) {
        super(modelConfig);

        this.workType = "start-end-frame-mirelo";
        this.config.folderName = modelConfig.folderName ?? this.workType;

        this.config = modelConfig;
        this.videoModelFirstLast = null;
        this.videoModel2 = null;
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

        this.videoModelFirstLast = await new PostToWan22_FirstLastFrame().init((this.config.video.model) ?? {});

        this.PostToWan22_5B_ImageVideo = await new PostToWan22_5B_ImageVideo().init((this.config.video.model2) ?? {});



        const imgType = this.config.image?.type;
        const imageModel = (imgType === 'aiqtech-NSFW-Real')
            ? AiqtechNSFW
            : (imgType === 'imageActorInScene')
                ? ImageActorInScene
                : FLUX;
        // For imageActorInScene, pass only the inner model data to the generator
        const imageInitConfig = this.config.image.model
            ? this.config.image.model
            : this.config.image;
        this.flux = await imageModel.init(imageInitConfig);




        this.mireloAI.imageDir = path.join(this.imageDir, '/parts');
        this.videoModelFirstLast.imageDir = path.join(this.imageDir, '/parts');
        this.PostToWan22_5B_ImageVideo.imageDir = path.join(this.imageDir, '/parts');
        this.flux.imageDir = path.join(this.imageDir, '/parts');

        // await store.initCache(this.imageDir);
        return this;
    }
    async generateImage(streams, options) {
        let prompt = await promptCreator.default(streams, options);

        if (options?.prompts?.create) {
            prompt = await options.prompts.create(prompt);
        }

        const totalImagePrompt = this.addStaticPrompt(prompt, options.staticPrompt);
        const defaultAndImageConfigMerged = { ...this.config, ...options };
        // If using the HF actor-in-scene generator, surface its model options at top-level
        if (this.config.image?.type === 'imageActorInScene') {
            const m = this.config.image.model || {};
            const actorOpts = {
                imagePath: m.imagePath,
                guidance_scale: m.guidance_scale,
                num_inference_steps: m.num_inference_steps,
                seed: m.seed,
                width: m.width,
                height: m.height,
                negative_prompt: m.negative_prompt,
                model: m.model,
            };
            Object.assign(defaultAndImageConfigMerged, actorOpts);
        }


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

        const useSingleImage = (options.useSingleImage && options.useSingleImage()) ?? 0;

        console.log('Generator useSingleImage:', options.useSingleImage, useSingleImage);


        try {
            if (this.repeatVideoCall) {

                console.log('\x1b[32m%s\x1b[0m', 'Generator: repeating last video call');
                const data = await this.repeatVideoCall();
                delete this.repeatVideoCall;
                return data;
            }

            let startFrame = this.lastEndFRame;//
            const imageOptions = options.image;


            if (!startFrame) {
                startFrame = await this.generateImage(streams, imageOptions);

                console.log('Generator !startFrame--> image:', startFrame);

            }


            let videoType = this.videoModelFirstLast; // 'firstlast' | 'video2'
            let videoPrompt = options.video.prompts || {};
            let videoModel = options.video;
            let generatedPrompt = ''
            /*ENDFRAME*/
            if (useSingleImage) {
                videoType = this.PostToWan22_5B_ImageVideo;
                videoPrompt = options.video2.prompts || {};
                videoModel = options.video2;


                if (videoPrompt.create) {
                    generatedPrompt = await videoPrompt.create(startFrame.json.metadata.prompt);
                }

            } else {
                options.name = fileName + '-end';

                this.lastEndFRame = await this.generateImage(streams, imageOptions);
                options.endImageStream = this.lastEndFRame.image.path;



                videoPrompt = options.video.prompts || {};

                if (videoPrompt.create) {
                    generatedPrompt = await videoPrompt.create(startFrame.json.metadata.prompt,
                        this.lastEndFRame.json.metadata.prompt);
                }


            }
            await new Promise(resolve => setTimeout(resolve, 10000));

            let totalPrompt = "";
            console.log('\x1b[35m%s\x1b[0m', `video prompt: ${generatedPrompt}`);
            const mergedConfig = { ...this.config, ...(videoModel.model || {}) };
            totalPrompt = this.addStaticPrompt(generatedPrompt, videoModel.staticPrompt);

            mergedConfig.prompt = generatedPrompt ?? (options.useImagePrompt ?
                startFrame.json.metadata.prompt : '');


            console.log('GenImgVideo final video prompt:', mergedConfig.prompt);


            this.repeatVideoCall = async () => {
                let data = await videoType.prompt(startFrame.image.path, mergedConfig);

                if (useSingleImage) {

                    //       imageOptions.prompt.staticPrompt.pre += 'this is the first sce';
                    //     imageOptions.prompt.staticPrompt.post += ', as a Donald Trump video in wild western style';

                } else {


                    // If a video was generated, extract its last frame and set as lastEndFRame
                    const lastPng = data.file.replace(/\.mp4$/, '-last-frame.png');
                    await extractLastFrame(data.file, lastPng);
    
    
                    this.lastEndFRame = {
                        image: { path: lastPng },
                        json: startFrame.json
                    };
                }



                console.log('\x1b[33m%s\x1b[0m', 'GenImgVideo data --> :', data);
                return data;
            }

            const videoData = await this.repeatVideoCall();
            delete this.repeatVideoCall;
            // console.log('this.videoModelFirstLast.prompt res: ', videoData);
            const videoUrl = videoData.json.metadata.url;
            options.mireloAI.prompt = startFrame.json.metadata.prompt;
            options.mireloAI = options.mireloAI || {};

            if (typeof options.mireloAI.duration === 'function') {
                options.mireloAI.duration = options.mireloAI.duration();
            }

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

                    const mergedOutDir = path.join(this.imageDir, '/merged');
                    fs.ensureDirSync(mergedOutDir);

                    const op = {
                        outputName: `${fileName}-with-sound.mp4`
                    }

                    const mergedFilePath = await muxVideoAndAudio(videoPath, audioPath, mergedOutDir, op);


                    //  await fs.copy(mergedPath, finalVideoPath);
                    console.log('GenImgVideo: muxed video and audio to', mergedFilePath);


                    const allDats = {
                        file: mergedFilePath,
                        //  file: await downloadToFile(url, savePath),
                        json: await saveJSON(savePath, {
                            mergedFilePath,
                            mireloResponse: dataFromMirelo,
                            videoResponse: videoData,
                            imageResponse: startFrame,
                        })
                    };

                    await gateConcatAndUpload({ imageDir: this.imageDir, options: options.uploadToYT, allDats })
                        .then(res => {
                            console.log('gateConcatAndUpload result:', res);
                        });



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
