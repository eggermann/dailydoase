import axios from 'axios';
import fs from 'fs-extra';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { createFileName } from './createFileName.js';
import axiosRetry from 'axios-retry';
import PostTo from './PostTo.js';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import store from '../server/store.cjs';
dotenv.config();

const _YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
if (!_YOUTUBE_API_KEY) {
    throw new Error("YouTube API key is not set. Check your .env file.");
}


const checkFilLimit = (lmit, path) => {

}
function durationToSeconds(durationString) {
    const regex = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/;
    const matches = durationString.match(regex);
    const hours = matches[1] ? parseInt(matches[1]) : 0;
    const minutes = matches[2] ? parseInt(matches[2]) : 0;
    const seconds = matches[3] ? parseInt(matches[3]) : 0;
    return hours * 3600 + minutes * 60 + seconds;
}

// Configure Axios for retry logic
axiosRetry(axios, {
    retries: 3,
    retryDelay: (retryCount) => retryCount * 1000,
    retryCondition: (error) =>
        axiosRetry.isNetworkOrIdempotentRequestError(error) ||
        (error.response && error.response.status >= 500),
});

class YouTubeAPI extends PostTo {
    constructor(modelConfig) {
        super(modelConfig);
        this.config = modelConfig;
        console.log('modelConfig', modelConfig.words)


        this.config.folderName =
            modelConfig.words ?
                createFileName(modelConfig) : 'test';
        this.imageDir = '../../GENERATIONS/youtube';

        store.initCache(this.imageDir);
    }

    getQuery(q) {
        q = encodeURIComponent(q);
        return `https://www.googleapis.com/youtube/v3/search?part=snippet&key=${_YOUTUBE_API_KEY}&safeSearch=none&videoCaption=none&videoDefinition=standard&videoEmbeddable=true&videoSyndicated=true&videoDimension=2d&type=video&maxResults=3&q=${q}`;
    }

    async prompt(prompt, options = {}) {
//        await this.checkSignature();
console.log('tore.getCache().youtube.length', store.getCache())
process.exit(0)
        if(store.totalFiles() > 20){
            return false;
        }


        try {
            const totalPrompt = this.addStaticPrompt(prompt, options);
            const jsonPath = path.join(__dirname, this.imageDir)
            //path.join(this.imageDir);
            await fs.ensureDir(jsonPath);

            const url = this.getQuery(totalPrompt);
            console.log('Fetching URL:', url);

            const response = await axios.get(url);
            console.log('API Response:', response.data);

            if (!response.data.items.length) {
                const arr = prompt.split(' ')
                arr.shift();
                const newPrompt = arr.join(' ')

                if (!newPrompt) {
                    return true;
                }

                return await this.prompt(newPrompt, options)
            }

            for (const [index, item] of response.data.items.entries()) {
                const id = item.id.videoId;
                item.link = `https://www.youtube.com/watch?v=${id}`;
                const responseDetailUrl = `https://www.googleapis.com/youtube/v3/videos?part=contentDetails&id=${id}&key=${_YOUTUBE_API_KEY}`;

                try {
                    const responseDetails = await axios.get(responseDetailUrl);
                    if (!responseDetails.data.items.length) return true;

                    const data = responseDetails.data.items[0].contentDetails;
                    if (data.duration === 'P0D') return true;

                    const seconds = durationToSeconds(data.duration);
                    item.time = seconds;

                    const name = `yt-${Date.now()}-${index}.json`;
                    const jsonObj = JSON.stringify({ ...item, ...data }, null, 2);
                    await fs.writeFile(path.join(jsonPath, name), jsonObj, 'utf-8');
                    store.addFile(jsonPath, name)

                    checkFilLimit()



                    console.log(`Saved metadata: ${name}`);
                } catch (error) {
                    console.error('Error fetching video details:', error);
                    return false;
                }
            }
            return true;
        } catch (error) {
            if (error.response) {
                console.error('API Error Response:', {
                    status: error.response.status,
                    data: error.response.data,
                });
            } else if (error.request) {
                console.error('No response received. Request details:', error.request);
            } else {
                console.error('Unexpected error:', error.message);
            }


            return false;
        }
    }
}

export default {
    init: (config) => new YouTubeAPI(config),
};
/*
// Run and cleanup logic
const i = new YouTubeAPI(
    {words: [['Robotics', 'en'], [':NewsStream', {startWord: ''}], ['Humanities', 'en']]
    });
i.prompt('xxx').then(async (result) => {
    console.log(result);

});
*/