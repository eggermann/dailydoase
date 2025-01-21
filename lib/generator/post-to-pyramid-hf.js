import axios from 'axios';
import fs from 'fs-extra';
import path from 'path';
import dotenv from 'dotenv';
import PostTo from "./PostTo.js";
import { fileURLToPath } from 'url';

dotenv.config();

const apiKey = process.env.HUGGINGFACE_API_KEY;
const modelName = 'Lightricks/LTX-Video';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const _ = {
    config: {
        pollingTime: null,
        description: 'pyramid hf',
        folderName: 'pyramid',
        folderNamePostfix: 'hf'
    },
    pyramidHf: class extends PostTo {
        constructor(config) {
            super(config);
        }
        async prompt(prompt, options) {
            const totalPrompt = this.addStaticPrompt(prompt, options);

            const height = 512;
            const width = 768;
            const numFrames = 257;
            const seed = Math.round(1204 * Math.random());

            const url = `https://api-inference.huggingface.co/models/${modelName}`;

            const headers = {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            };

            const data = {
                inputs: totalPrompt,
                parameters: {
                    height: height,
                    width: width,
                    num_frames: numFrames,
                    seed: seed
                }
            };
            return new Promise(async (resolve, reject) => {
                try {
                    const response = await axios.post(url, data, { headers, responseType: 'arraybuffer' });
                    if (response.status === 200) {
                        const name = 'pyramid-' + (await this.fileCounter.increment());
                        this.handleNewSerie(this.imageDir, options);
                        const outputPath = this.imageDir + '/' + name + '.mp4';
                        fs.writeFileSync(outputPath, response.data);
                        options.prompt = prompt
                        options.totalPrompt = totalPrompt
                        const jsonObj = JSON.stringify(options);
                        const jsonPath = this.imageDir + '/' + name + '.json';
                        fs.writeFileSync(jsonPath, jsonObj, 'utf-8')
                        console.log(`Video successfully generated and saved to ${outputPath}`);
                    } else {
                        console.error(`Unexpected response status: ${response.status}`);
                    }
                    resolve(true);
                } catch (error) {
                    if (error.response && error.response.data) {
                        const errorData = error.response.data.toString('utf-8');
                        try {
                            const errorJson = JSON.parse(errorData);
                            console.error('Error generating video:', errorJson);
                        } catch (parseError) {
                            console.error('Error generating video:', errorData);
                        }
                    } else {
                        console.error('Error generating video:', error.message);
                    }
                    resolve(false);
                }
            });
        }
    }
}
export default {
    config: _.config,
    init: () => {
        return new _.pyramidHf(_.config);
    }
}
