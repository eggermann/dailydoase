const pathConfig = require('./config.json');
const path = require("path");
const fs = require("fs");
const {Image} = require("image-js");

const recursive = require("recursive-readdir");
const _ = {
    getBlackImages: async (folder) => {


        const blackImages = [];

        return new Promise((resolve, reject) => {
            recursive(folder, ["!*.png"]).then(async (files) => {
                    const bImg = files.map(async i => {
                        const isB = await _.isBlackImg(i);
                        return isB;
                    })

                    Promise.all(bImg).then((isEmptyImagesBooleans) => {
                        const eImg = isEmptyImagesBooleans.map((isEmpty, index2) => {
                            if (!isEmpty) {
                                blackImages.push(files[index2]);
                            }
                        })

                        console.log('blackImages', blackImages)

                        return resolve(blackImages);
                    })


                },
                function (error) {
                    console.error("something exploded", error);
                }
            )
        });
    },
    isBlackImg: async (blabkImg) => {
// '/Users/d.eggermann/semantic-api/deploy/fresh-folders/s-96-v2/1-3573.png'
        //   const blabkImg = '/Users/d.eggermann/semantic-api/deploy/fresh-folders/s-96-v2/1-3573.png'
        //    '/Users/d.eggermann/semantic-api/deploy/fresh-folders/s-96-v2/1-3574.png';//

        return execute().catch(console.error);

        async function execute() {
            try {


                let image = await Image.load(blabkImg);


                const histogram = image.getHistograms({maxSlots: 16});
                let channelSum = 0;
                histogram.forEach((rgb, index) => {

                    for (let j = 1; j <= rgb.length - 1; j++) {
                        channelSum += histogram[index][j];

                    }
                });

                if (channelSum) {
                    //  console.log('no black image');

                } else {
                    //console.log('**** Black image *****');

                }

                return Promise.resolve(channelSum);
            } catch (e) {

                console.log('--->', e, blabkImg)
                return Promise.resolve(false);
            }
        }
    },
    deleteImages: (imagesToDelete) => {
        return Promise.all(imagesToDelete.map(async imgP => {
            return await Promise.all([imgP, imgP.replace('.png', '.json')].map((path) => {
                return fs.promises.unlink(path);
            }))
        }))
    },
    pruneEmptyImages: async (pathFresh = __dirname+'/fresh-folders') => {
        const imagesToDelete = await _.getBlackImages(pathFresh);

        await _.deleteImages(imagesToDelete);
    }
}

module.exports = {
    isBlackImg: _.isBlackImg,
    pruneEmptyImages: _.pruneEmptyImages,
};


//_.getBlackImages(pathConfig.downloadedImageFolder);