const {Image} = require("image-js");
const fs = require("fs");

const temp = require('temp'),
    util = require('util'),
    exec = require('child_process').exec;

// Automatically track and cleanup files at exit
temp.track();

// Fake data


const _ = {
    async execute(blabkImg) {//return 0 when all black

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
            console.log('isBlackImage --->true', !channelSum)
            return Promise.resolve(channelSum);//0 when all black
        } catch (e) {

           // console.log('isBlackImage --->', e, blabkImg)
            return Promise.resolve(false);
        }
    },
    isBlackImg: async (options) => {
        return new Promise((resolve, reject) => {
            temp.open({suffix: ".png"}, async (err, info) => {
              //  console.log('------>: -----------in temp');

                if (!err) {
                    fs.writeFileSync(info.fd, options.data, options.type);
                 //   console.log('------>: -----------iwrite on tmp');


                    fs.close(info.fd, function (err) {
                        if (err) {
                            reject(err)
                        }
                    });

                    const save = !await _.execute(info.path).catch(console.error);
                    resolve(save);
                } else {
                    console.log('selfmade')
                    reject(err);
                }
            });
        })
    }
}

module.exports = {
    isBlackImage: _.isBlackImg
};
