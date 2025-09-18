/*info: 
the loop mechanism, allow to create a longer film ,
 based on further prompts -> scenes based*/ 



import PostTo from './PostTo.js';
import { Client, handle_file } from '@gradio/client';
import fs from 'fs-extra';
import path from 'path';
import sharp from 'sharp';

import { extractLastFrame, concatMp4Lossless } from './ffmpeg-helpers.js';

const joinOutPath = (subPath) => {
    return path.join(process.cwd(), subPath);
}

class PostToWan22_5B_ImageVideo extends PostTo {
    /**
      * @param {object} modelConfig
      * @param {string} [modelConfig.hfToken] Optional Hugging Face token for private/rate-limited runs
      * @param {string} [modelConfig.space] Hugging Face Space name (default: 'Wan-AI/Wan-2.2-5B')
      * @param {string} [modelConfig.folderName] Output folder name (default: 'wan22ImageVideo')
      * @param {object} [modelConfig.defaults] Default generation params
      * @param {number} [modelConfig.sampling_steps] Number of sampling steps (default: 38)
      * @param {number} [modelConfig.guide_scale] Guidance scale (default: 5)
      */
    constructor(modelConfig = {}) {
        super(modelConfig);
        this.config = modelConfig || {};
        this.config.space = this.config.space ?? 'Wan-AI/Wan-2.2-5B';
        this.config.folderName = this.config.folderName ?? 'wan22ImageVideo';

        this.config.duration_seconds = this.config.duration_seconds ?? 2;
        this.config.sampling_steps = this.config.sampling_steps ?? 38;
        this.config.guide_scale = this.config.guide_scale ?? 5;
        this.config.shift = this.config.shift ?? 5;
        this.config.seed = this.config.seed ?? -1;


        this._cli = null;
        this.imageDir = joinOutPath(this.config.folderName);
        fs.ensureDirSync(this.imageDir);
    }

    async init() {
        // Allow dependency injection for tests to avoid real network/GPU calls
        if (this.config.mockClient) {
            this._cli = this.config.mockClient;
            return this;
        }
        const token = this.config.hfToken || process.env.HF_TOKEN || null;
        this._cli = await Client.connect(this.config.space, token ? { hf_token: token } : {});
        return this;
    }

    /**
     * Generate video from an input image stream or path.
     *
     * @param {Buffer|string|sharp.Sharp} inputImageStream Input image as buffer, path, or sharp object
     * @param {object} options
     * @param {string} [options.prompt] Prompt text
     * @param {number} [options.height] Output height (multiple of 32)
     * @param {number} [options.width] Output width (multiple of 32)
     * @param {number} [options.duration_seconds]
     * @param {number} [options.sampling_steps]
     * @param {number} [options.guide_scale]
     * @param {number} [options.shift]
     * @param {number} [options.seed]
     * @returns {Promise<string>} Path to saved video file
     */
    async prompt(inputImageStream, options = {}) {
        const loop = options?.loop;


        if (loop) {

            console.log(this.roundCounter, loop.prompts.length, (this.roundCounter) % (loop.prompts.length));


            if ((this.roundCounter + loop.prompts.length) % (loop.prompts.length + 1) === 0) {

                /**
                 * concatMp4Lossless(); delete videos upload YT
                 **/

                return true;
            }
        }
        // Normalize inputImageStream to sharp object if string path
        let imageSharp;
        if (typeof inputImageStream === 'string') {
            imageSharp = sharp(inputImageStream);
        } else if (inputImageStream instanceof sharp) {
            imageSharp = inputImageStream;
        } else if (Buffer.isBuffer(inputImageStream)) {
            imageSharp = sharp(inputImageStream);
        } else {
            throw new Error('Unsupported inputImageStream type');
        }

        // Write to temp PNG file
        const tmpInputImage = path.join(this.imageDir, 'input-img', '.png');
        fs.ensureDirSync(path.dirname(tmpInputImage));
        await imageSharp.png().toFile(tmpInputImage);

        // Determine height and width
        let h = options.height;
        let w = options.width;
        if (!h || !w) {
            try {
                const dimRes = await this._cli.predict('/handle_image_upload_for_dims_wan', {
                    uploaded_pil_image: await fs.readFile(tmpInputImage),
                    current_h_val: h ?? 704,
                    current_w_val: w ?? 1280,
                });
                if (Array.isArray(dimRes?.data) && dimRes.data.length >= 2) {
                    h = Number(dimRes.data[0]) || (h ?? 704);
                    w = Number(dimRes.data[1]) || (w ?? 1280);
                } else {
                    h = h ?? 704;
                    w = w ?? 1280;
                }
            } catch (e) {
                h = h ?? 704;
                w = w ?? 1280;
            }
        }

        const payload = {
            image: handle_file(tmpInputImage),
            prompt: options.prompt ?? '',
            height: h,
            width: w,
            duration_seconds: options.duration_seconds ?? this.config.duration_seconds,
            sampling_steps: options.sampling_steps ?? this.config.sampling_steps,
            guide_scale: options.guide_scale ?? this.config.guide_scale,
            shift: options.shift ?? this.config.shift,
            seed: options.seed ?? this.config.seed,
        };

        const result = await this._cli.predict('/generate_video', payload);


        console.log('Gradio API response:', JSON.stringify(result, null, 2));

        let url = null;
        const out = result?.data?.[0].video;
        if (typeof out === 'string') {
            url = out;
        } else if (out && typeof out === 'object') {
            url = out.url || null;
        }

        if (!url) {
            throw new Error('Wan-2.2-5B: Unexpected response format from /generate_video');
        }

        // Download video

        const res = await fetch(url);
        if (!res.ok) {
            console.log(`Failed to download video from ${url}: ${res.status} ${res.statusText}`);

            return false;
        }

        const fnameVideo = `${Date.now()}-wan22-image-video.mp4`;
        const savePath = path.join(this.imageDir, fnameVideo);

        const arrayBuffer = await res.arrayBuffer();
        fs.ensureDirSync(path.dirname(savePath));
        await fs.writeFile(savePath, Buffer.from(arrayBuffer));

        // Save JSON metadata//@worktype video 
        const json = {
            model: this.config.space,
            prompt: options.prompt ?? '',
            height: h,
            width: w,
            duration_seconds: options.duration_seconds ?? this.config.duration_seconds,
            sampling_steps: options.sampling_steps ?? this.config.sampling_steps,
            guide_scale: options.guide_scale ?? this.config.guide_scale,
            shift: options.shift ?? this.config.shift,
            seed: options.seed ?? this.config.seed,
            url,
            sourceUrl: url,
        };

        const jsonPath = savePath + '.json';
        await fs.writeFile(jsonPath, JSON.stringify(json, null, 2));

        if (loop) {
            const lastPng = savePath.replace(/\.mp4$/, '-last-frame.png');
            await extractLastFrame(savePath, lastPng);

            // 3) set that as the next input (read as buffer to feed your api)
            //  nextInput = await fs.readFile(lastPng);

            // (optional) Slightly vary the seed to reduce “frozen” look across segments
            if (typeof options.seed === 'number' && options.seed >= 0) {
                options.seed += 1;
            }

            await this.prompt(lastPng, {
                ...options,
                prompt: loop.prompts
                    ? loop.prompts[this.roundCounter % loop.prompts.length]
                    : options.prompt
            })
        }

        this.roundCounter++;
        return savePath;
    }
}

export default {
    init: async (config = {}) => {
        return await (new PostToWan22_5B_ImageVideo(config)).init();
    }
};
