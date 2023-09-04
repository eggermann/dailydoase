import fs from "fs-extra";
import axios from 'axios';
import PostTo from "./PostTo.js";
//dailymotion api key:4af7a55d78b923a254e3
const _ = {
    youtubeApiKey:"AIzaSyBsQHwb2ElNwnnu4M22n3MQ3TI-7RQJ8AY",
    config: {
        folderName: 'yt',
        folderNamePostfix: 'yt',
        pollingTime: 5000,
        description: 'call youtubeApi'
    },
    youtubeApi: class extends PostTo {
        constructor(config) {
            super(config);
//&videoCategoryId=

        }

        getQuery(q) {
            return `https://www.googleapis.com/youtube/v3/search?part=snippet&key=${_.youtubeApiKey}&safeSearch=none&videoCaption=none&videoDefinition=standard&videoEmbeddable=true&videoSyndicated=true&videoDimension=2d&type=video&maxResults=8&q=${q}`;
        }

        async prompt(prompt, options) {
            options = options ? options : {};

            let totalPrompt = this.addStaticPrompt(prompt, options);

            const o = Object.assign(
                {},
                options.stableDiffusionOptions,
                {prompt: totalPrompt}
            );

            const url = this.getQuery(totalPrompt);
            //return true;
            return new Promise(async (resolve, reject) => {


                try {
                    const response = await axios.get(url);

                    const titles = response.data.items.map((item) => {
                        console.log('-----------> ', item)
                    });
                }catch (e){
                    console.log(e)
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

const i = new _.youtubeApi(_.config)
i.prompt('xxx').then(console.log)
