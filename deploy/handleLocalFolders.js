const path = require("path");
const fs = require("fs");

var sanitize = require("sanitize-filename");
const recursive = require("recursive-readdir");
const _ = {
    flickName: async f => {
        const bName = path.basename(f);

        if (bName.length >= 30) {
            let shortName = (bName.substring(0, 24));
            shortName = sanitize(shortName.replace(/\,/g,'')) + Math.round(Math.random() * 100);
       //     console.log(shortName)

            try {
                const f2 = path.dirname(f) + '/' + shortName + '.png';

                console.log(f,'___',f2)

                await fs.promises.rename(f, f2);
                const fJSON = path.dirname(f) + '/' + shortName + '.json';
                const fJSONORG = path.dirname(f) + '/' + bName.replace('.png', '.json');
                console.log(fJSONORG,'___',fJSON)
                await fs.promises.rename(fJSONORG, fJSON);


            } catch (err) {

            }
        }
    },
    iterate: async (folder) => {
        return new Promise((resolve, reject) => {
            recursive(folder,["!*.png"]).then(async (files) => {
                    files.forEach(async (f) => {
                        await _.flickName(f);
                    })


                },
                function (error) {
                    console.error("something exploded", error);
                }
            )
        });
    },
}

module.exports = {};

_.iterate('../images');
//_.iterate('/Users/d.eggermann/semantic-api/images/v-12');