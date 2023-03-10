const axios = require('axios');
const fs = require('fs-extra');
const sanitize = require('sanitize-filename');
const fileCounter = new (require('./incremental-call'))('./exemplar-cntr.txt');
const imageDirCounter = new (require('./incremental-call'))('./folder-cntr.txt');
const server = require('./server')
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
*  .then(({ images_bak }) => writeFileSync('path/to/image.png', images_bak[0], 'base64'))
*
* */
//http://127.0.0.1:7860/docs#/default/img2imgapi_sdapi_v1_img2img_post

module.exports.prompt = async (prompt, options, words) => {
    options.prompt = prompt;

    console.log('------>prompt: ', options);
    return new Promise((resolve, reject) => {
        axios.post('http://localhost:7860/sdapi/v1/txt2img', options)
            .then(async function (response) {

                createDirWhenNotExist(_imageDir);
                const san = sanitize(prompt);//.trim().replaceAll(',,', ',')
                const name =  response.data.images.length + '-'
                    + await fileCounter.increment();
             //   let n2 =name;// sanitize(name);
             //   if (n2.length > 20) n2 = n2.substring(0, 20);

                const imgPath = _imageDir + '/' + name + '.png';
                fs.writeFileSync(imgPath, response.data.images[0], 'base64')

                const jsonPath = _imageDir + '/' + name + '.json';
                const jsonObj = JSON.stringify({
                    options, words
                });

                fs.writeFileSync(jsonPath, jsonObj, 'utf-8')
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