import fs from 'fs-extra';
import path from 'path';
import { Client, handle_file } from '@gradio/client';
import PostTo from './PostTo.js';
import sharp from 'sharp';

/**
 * LTX-Video-Distilled endpoints and config
 */
const LTX_DISTILLED_DEFAULTS = {
    space: 'Lightricks/ltx-video-distilled', // Hugging Face Space für das 13 B distillierte Modell  [oai_citation:0‡huggingface.co](https://huggingface.co/spaces/Lightricks/ltx-video-distilled?utm_source=chatgpt.com)
    folderName: 'ltxVideos',              // Zielordner für lokal gespeicherte Videos
    cfg: 3.0,                              // Guidance‑Scale (Prompt-Stärke), üblich zwischen 2–5  [oai_citation:1‡reddit.com](https://www.reddit.com/r/StableDiffusion/comments/1h26okm/ltxvideo_tips_for_optimal_outputs_summary/?utm_source=chatgpt.com)
    steps: 8,                             // Anzahl der Diffusionsschritte (bei Distilled genügen oft 4–8, aber 25 ist konservativ)  [oai_citation:2‡reddit.com](https://www.reddit.com/r/StableDiffusion/comments/1kmid0k/ltxv_13b_distilled_faster_than_fast_high_quality/?utm_source=chatgpt.com)
    motionBucketId: 127,                   // Internes Lightricks‑Motion‑Preset (unverändert)
    fps: 24,                                // Ziel‑Frames‑per‑Second für Ausgabevideo (hier niedrig gesetzt)
    seed: 0                                // Grund‑RNG‑Seed – überschreibbar durch `options.seed_ui` / Zufallsmodus
};

class PostToLtxVideo extends PostTo {
    constructor(modelConfig = {}) {
        super(modelConfig);

        this.config = { ...LTX_DISTILLED_DEFAULTS, ...modelConfig };
        this._cli = null;
    }

    async init() {
        // Ensure output directory exists
        if (!fs.existsSync(this.imageDir)) {
            fs.ensureDirSync(this.imageDir);
        }
        this._cli = await Client.connect(this.config.space, {
            hf_token: process.env.HF_TOKEN ?? process.env.HF_API_TOKEN
        });
        this.config.spaceActive = this.config.space;
        return this;
    }

    /**
     * Save the generated video and metadata.
     * @param {Buffer} videoBuffer
     * @param {string} name
     * @param {object} meta
     */
    async saveFile(videoBuffer, name, meta) {
        const itemName = `${Date.now()}-${name}`;
        const videoName = `${itemName}.mp4`;
        const videoPath = path.join(this.imageDir, videoName);
        const jsonPath = path.join(this.imageDir, `${itemName}.json`);

        await fs.writeFile(videoPath, videoBuffer);
        await fs.writeJson(jsonPath, meta, { spaces: 2 });

        console.log(`LTX-Video saved: ${videoPath}`);
        return { json: meta, videoPath };
    }

    /**
     * Core generator — accepts a Sharp stream *or* an absolute file‑path for the input image
     * @param {string|object} inputImageStream
     * @param {object} options
     */

    // imagePath:'',prompt:
    async prompt(promptObj = { imgPath: null, prompt: '' }, options = {}) {
        await this.checkSignature();

        const endpoint = promptObj.imgPath ? "/image_to_video" : "/text_to_video";
        let payload = {};


        // Determine mode and prepare optional image
        let inputImageFilePath = '';
        if (promptObj.imgPath) {
            // If an image path is provided, load/convert it to a temporary PNG and pass its path
            const inputImage = typeof promptObj.imagePath === 'string'
                ? sharp(promptObj.imagePath)
                : promptObj.imagePath;
            const tmpInputImage = './tmp.png';
            await inputImage.png().toFile(tmpInputImage);
            inputImageFilePath = handle_file(tmpInputImage);
        }

        // Build a single payload that always contains ALL required fields
        payload = {
            prompt: promptObj.prompt ?? '',
            negative_prompt: options.negative_prompt ?? 'worst quality, inconsistent motion, blurry, jittery, distorted',
            input_image_filepath: inputImageFilePath || '',
            input_video_filepath: options.input_video_filepath ?? '',
            height_ui: options.height_ui ?? 512,
            width_ui: options.width_ui ?? 704,
            mode: options.mode ?? (promptObj.imagePath ? 'image-to-video' : 'text-to-video'),
            duration_ui: options.duration_ui ?? 2,
            ui_frames_to_use: options.ui_frames_to_use ?? 9,
            ui_guidance_scale: options.ui_guidance_scale ?? 1,
            seed_ui: options.seed_ui ?? 42,
            // flip to `true` by default so different prompts/seeds yield different videos
            randomize_seed: options.randomize_seed ?? true,
            improve_texture_flag: options.improve_texture_flag ?? true
        };

        console.log('LTX-Video payload:', JSON.stringify(payload, null, 2));

        let result;
        try {
            result = await this._cli.predict(endpoint, payload);
            console.log('Gradio API response:', JSON.stringify(result, null, 2));
        } catch (err) {
            console.error('Error calling Gradio Space:', err);
            throw err;
        }

        // Parse Gradio response for video URL
        if (result && result.error && result.message && result.message.includes('404')) {
            throw new Error(`Gradio Space error: ${result.message}. This may be due to an expired or invalid session. Try re-initializing the client or check the endpoint/fn_index.`);
        }
        let videoUrl = null;
        if (Array.isArray(result.data)) {
            const first = result.data[0];
            if (first && typeof first === 'object' && first.video && first.video.url) {
                videoUrl = first.video.url;
            }
        }
        if (!videoUrl) {
            throw new Error('Space returned no video URL. Check the Gradio Space output format.');
        }

        // Download the video from the URL and save locally
        const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
        const response = await fetch(videoUrl);
        const buffer = await response.arrayBuffer();

        // Save video and metadata
        const meta = {
            prompt: promptObj.prompt ?? '',
            cfg: this.config.cfg,
            steps: this.config.steps,
            motionBucketId: this.config.motionBucketId,
            fps: this.config.fps,
            seed: this.config.seed,
            timestamp: new Date().toISOString(),
            videoUrl
        };
        const { videoPath } = await this.saveFile(Buffer.from(buffer), 'ltx-video', meta);

        return videoPath;
    }
}

export default {
    init: async (config = {}) => {
        const instance = new PostToLtxVideo(config);
        return await instance.init();
    }
};