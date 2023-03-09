const axios = require('axios');
const fs = require('fs-extra');
const sanitize = require('sanitize-filename');
const fileCounter = new (require('./incremental-call'))('./exemplar-cntr.txt');
const imageDirCounter = new (require('./incremental-call'))('./folder-cntr.txt');

let _imageDir = '';
(async () => {
    _imageDir = './images/v-' + await imageDirCounter.increment();
})()

function createDirWhenNotExist(dir, recursive = true) {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, {recursive});
        return true
    }
}


/*
*  .then(({ images }) => writeFileSync('path/to/image.png', images[0], 'base64'))
*
* */
//http://127.0.0.1:7860/docs#/default/img2imgapi_sdapi_v1_img2img_post

module.exports.prompt = async (prompt,options = {
    width: 512,
    height: 512,
    steps: 10,
    prompt//: 'beinhalten beispielsweise die,Meerschweinchen , die Behandlung von'
}) => {
    console.log('------>prompt: ', options);
return;

    return new Promise((resolve, reject) => {
        axios.post('http://localhost:7860/sdapi/v1/txt2img', options)
            .then(async function (response) {
                // handle success

                createDirWhenNotExist(_imageDir);
                const san = sanitize(prompt);//.trim().replaceAll(',,', ',')
                const name = prompt + '_' + response.data.images.length + '-'
                    + await fileCounter.increment();
                const imgPath = _imageDir + '/' + name + '.png';

                fs.writeFileSync(imgPath, response.data.images[0], 'base64')
            })
            .catch(function (error) {
                // handle error
                console.log(error);
            })
            .finally(function () {
                // always executed
                resolve()
            });
    })
};
