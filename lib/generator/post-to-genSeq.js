import fs from 'fs-extra';
import path from 'path';
import sharp from 'sharp';
import store from '../store.cjs';
import PostTo from './PostTo.js';
import FLUX from './post-to-FLUX.js';
import Hunyuan from './post-to-hunyuan-video.js';

import promptCreator from '../prompt-creator.js';
import { console } from 'inspector';

const _promptBuffer = [];

class GenSeq extends PostTo {
    constructor(modelConfig) {
        super(modelConfig);
        this.config = modelConfig;
        this.config.folderName = this.config.folderName ?? 'genSeq';
    }

    async init() {
        await store.initCache(this.imageDir);

        return this;
    }


    async saveFile(svg, name, totalPrompt) {
        const imageName = `${Date.now()}-${name}.png`;
        const imgPath = path.join(this.imageDir, imageName);
        const jsonPath = path.join(this.imageDir, `${imageName}.json`);

        await sharp(Buffer.from(svg))
            .png()
            .toFile(imgPath);
        store.addFile(path.basename(this.imageDir), imageName);

        const metadata = {
            prompt: totalPrompt,
            color: this.color,
            timestamp: new Date().toISOString()
        };
        await fs.writeJson(jsonPath, metadata, { spaces: 2 });

        console.log(`Test image saved: ${imgPath}`);
    }


    async prompt(streams, options = {}) {

        console.log('XXX');
        console.log('genSeq prompt:', streams, options);



        await this.checkSignature();
        const name = 'genSeq-test';



        try {
            const flux = await FLUX.get(this.config);

            let prompt = await promptCreator.default(streams, options);
            const totalPrompt = this.addStaticPrompt(prompt, options);
            const data1 = await flux.prompt(totalPrompt, this.config);


            let prompt2 = await promptCreator.default(streams, options);
            const totalPrompt2 = this.addStaticPrompt(prompt2, options);
            const data2 = await flux.prompt(totalPrompt2, this.config);

            console.log('genSeq prompt:', totalPrompt, totalPrompt2);
            console.log('genSeq prompt:', data1, data2);



          //  const Hunyuan = await Hunyuan.get({});


            //console.log('Loaded FLUX images:', fluxImages.map(img => img.name || 'unnamed'));



            // Extra promise save function
            await new Promise(resolve => setTimeout(resolve, 1000));


            return true;
        } catch (error) {
            console.error('genSeq', error);
            return false;
        }
    }
}

let cachedInstance = null;

export default {
    init: async (config) => {
        const instance = new GenSeq(config);
        cachedInstance = await instance.init();
        if (!cachedInstance) {
            // Instance already initialized above
        }
        return cachedInstance;
    },
    get: () => cachedInstance
}

