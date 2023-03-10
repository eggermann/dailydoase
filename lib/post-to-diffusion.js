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

module.exports.prompt = async (prompt, options) => {
     prompt = sanitize(prompt);//.trim().replaceAll(',,', ',')

    const o=Object.assign({},options.stableDiffusionOptions,{prompt})
    console.log('------>: ', o);

    return new Promise((resolve, reject) => {
        axios.post('http://localhost:7860/sdapi/v1/txt2img', o)
            .then(async function (response) {


                const san = sanitize(prompt);//.trim().replaceAll(',,', ',')
                const name = response.data.images.length + '-'
                    + await fileCounter.increment();
                //   let n2 =name;// sanitize(name);
                //   if (n2.length > 20) n2 = n2.substring(0, 20);

                const dataPath = options.folderVersionString
                    ? _imageDir + '-' + options.folderVersionString : _imageDir;
                createDirWhenNotExist(dataPath);
                const imgPath = dataPath + '/' + name + '.png';
                fs.writeFileSync(imgPath, response.data.images[0], 'base64')

                const jsonPath = dataPath + '/' + name + '.json';
                options.prompt=prompt
                const jsonObj = JSON.stringify(options);

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