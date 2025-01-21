import fs from "fs-extra";
import axios from 'axios';
import PostTo from "./PostTo.js";
import path from 'path';

function durationToSeconds(durationString) {
    // Regular expression to match the parts of the duration string
    const regex = /PT(\d+H)?(\d+M)?(\d+S)?/;
    const matches = durationString.match(regex);

    // Extract hours, minutes, and seconds from the matches
    const hours = parseInt(matches[1]) || 0;
    const minutes = parseInt(matches[2]) || 0;
    const seconds = parseInt(matches[3]) || 0;

    // Calculate the total duration in seconds
    const totalSeconds = hours * 3600 + minutes * 60 + seconds;

    return totalSeconds;
}

//dailymotion api key:4af7a55d78b923a254e3
const _ = {
    youtubeApiKey: "AIzaSyBsQHwb2ElNwnnu4M22n3MQ3TI-7RQJ8AY",
    config: {
        folderName: 'yt',
        folderNamePostfix: 'yt',
        pollingTime:  null,
        description: 'call youtubeApi'
    },
    youtubeApi: class extends PostTo {
        constructor(config) {
            super(config);
//&videoCategoryId=

        }

        getQuery(q) {
            q = encodeURIComponent(q);
            console.log('q', q)
            return `https://www.googleapis.com/youtube/v3/search?part=snippet&key=${_.youtubeApiKey}&safeSearch=none&videoCaption=none&videoDefinition=standard&videoEmbeddable=true&videoSyndicated=true&videoDimension=2d&type=video&maxResults=3&q=${q}`;
        }

        async prompt(prompt, options) {
            options = options ? options : {};
            const jsonPath = path.join(this.imageDir, '/../../youtube/');

            let totalPrompt = this.addStaticPrompt(prompt, options);

            const o = Object.assign(
                {},
                options.stableDiffusionOptions,
                {prompt: totalPrompt}
            );
          //  totalPrompt=totalPrompt.replace(',','')

            const url = this.getQuery(totalPrompt);
            //return true;
            console.log(url)
            return new Promise(async (resolve, reject) => {
                try {
                    const name = 'yt-' + (await this.fileCounter.increment());

//https://blog.hubspot.com/website/how-to-get-youtube-api-key
                    const response = await axios.get(url);
                    console.log('response.data ', response.data)


                    response.data.items.map(async (item, index) => {
                        console.log('response.data.items item',item)

                        const id = item.id.videoId;
                        item.link = "https://www.youtube.com/watch?v=" + id;
                        const responseDetailUrl = `https://www.googleapis.com/youtube/v3/videos?part=contentDetails&id=${id}&key=${_.youtubeApiKey}`;

                        try {
                            const responseDetails = await axios.get(responseDetailUrl);

                            if (responseDetails.data.items.length == 0) {
                                return resolve(false);
                            }
                            const data = responseDetails.data.items[0].contentDetails;
                            this.handleNewSerie(jsonPath, null);

                            this.youtubePath = jsonPath;
                            if (data.duration == 'P0D') {
                                return resolve(false);
                            }

                            const seconds = durationToSeconds(data.duration);
                          //  console.log(seconds); // Output: 71
                            item.time = seconds;
                            const jsonObj = JSON.stringify(Object.assign(item, data));
                            fs.writeFileSync(jsonPath + name + '-' + index + '.json', jsonObj, 'utf-8');

                            //console.log('hallelulioss-----')


                        }catch (e){
                            console.log('check err ' ,e);
                            return resolve(false);
                        }



                    });



                    resolve(true);
                } catch (e) {
                    console.log('check err ' ,url);
                    return resolve(false);
                }
            })
        }
    }
}

export default {
    config: _.config,
    init: () => {
        return new _.youtubeApi(_.config);
    }
}
/*
const i = new _.youtubeApi(_.config)
i.prompt('xxx').then(console.log)*/
