import fs from "fs-extra";
import axios from 'axios';
import PostTo from "./PostTo.js";
import path from 'path';

import {fileURLToPath} from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


//var DailymotionStrategy = require('passport-dailymotion').Strategy;

//---> https://www.jsdelivr.com/package/npm/passport-dailymotion
//DM.init({ apiKey: '4af7a55d78b923a254e3', status: true, cookie: true });


//dailymotion api key:4af7a55d78b923a254e3
const _ = {
    DM_API_SECRET: '6c556fd856f0d8ba9eb8b1cffe9d798ab2f0bead',
    API_KEY: "4af7a55d78b923a254e3",
    config: {
        folderName: 'dm',
        folderNamePostfix: 'dm',
        pollingTime: null,
        description: 'call dailymotionApi'
    },
    filmControl: {
        dailymotion: {}
    },
    dailymotionApi: class extends PostTo {
        constructor(config) {
            super(config);
//&videoCategoryId=
        }


        getQuery(q) {
            q = encodeURIComponent(q);

            const searchQuery = q; // Replace with your desired search query
            const limit = 8; // Number of videos to retrieve

// Dailymotion API endpoint for video search

            const apiUrl = `https://api.dailymotion.com/videos?fields=id,title,url,owner.screenname,created_time,thumbnail_url,duration,allow_embed&search=${searchQuery}&limit=${limit}`;

            return apiUrl
        }

        async prompt(prompt, options) {
            return new Promise(async (resolve, reject) => {

                const that = this;

                options = options ? options : {};

                let totalPrompt = this.addStaticPrompt(prompt, options);

                const o = Object.assign(
                    {},
                    options.stableDiffusionOptions,
                    {prompt: totalPrompt}
                );

                const apiUrl = this.getQuery(totalPrompt);

                //return true;

                async function searchDailymotionVideos() {


                    try {
                        const response = await axios.get(apiUrl);
                        const name = 'dm-' + (await that.fileCounter.increment());
                        const videos = response.data.list;

                        if (videos.length === 0) {
                            console.log('No videos found for the given search query.');
                        } else {

                            const jsonPath = path.join(__dirname, '/../../dailymotion/');

                            videos.forEach((item, index) => {
                                if (index >= 4) {
                                    return
                                }
                                console.log(`${index + 1}. Title: ${item.title}`);
                                console.log(`   URL: ${item.url}`);
                                console.log(`   Thumbnail URL: ${item.thumbnail_url}`);
                                console.log(`   Duration: ${item.duration}`);

                                if (_.filmControl.dailymotion[item.url] && false) {
                                    console.log(' video already shown')
                                } else {
                                    _.filmControl.dailymotion[item.url] = true;

                                    that.handleNewSerie(jsonPath, null);
                                    that.imageDir = jsonPath;
                                    that.dailymotionPath = jsonPath;
                                    item.link = item.url;
                                    item.time = item.duration;
                                    item.user = item['owner.screenname']

                                    const date = new Date(item.created_time);

                                    const formattedDate = date.getFullYear() + '-' +
                                        String(date.getMonth() + 1).padStart(2, '0') + '-' +
                                        String(date.getDate()).padStart(2, '0');

                                    item.publishedAt = formattedDate;

                                    const jsonObj = JSON.stringify(item);
                                    fs.writeFileSync(jsonPath + name + '-' + index + '.json', jsonObj, 'utf-8');
                                }
                            });
                        }

                        return resolve(true);
                    } catch (error) {
                        console.error('An error occurred while making the API request:', error.message);
                        return resolve(false);
                    }
                }

// Function to format video duration (convert seconds to HH:MM:SS format)
                function formatDuration(durationInSeconds) {
                    const hours = Math.floor(durationInSeconds / 3600);
                    const minutes = Math.floor((durationInSeconds % 3600) / 60);
                    const seconds = durationInSeconds % 60;

                    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
                }

// Call the function to search for videos
                await searchDailymotionVideos();


            })
        }
    }
}

export default {
    config: _.config,
    init: () => {

        return new _.dailymotionApi(_.config);
    }
}

/*

const i = new _.dailymotionApi(_.config)
i.prompt('xxx').then(console.log)*/
