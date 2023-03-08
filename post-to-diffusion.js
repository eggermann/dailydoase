const axios = require('axios');
const fs = require('fs-extra');
const sanitize = require("sanitize-filename");

const _imageDir = './images/v4';

function createDirWhenNotExist(dir, recursive = true) {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, {recursive});
        return true
    }
}

const incrementClientCall = async () => {
    return new Promise((resolve, reject) => {

        const fPath = './exemplar-cntr.txt'
        fs.writeFile(fPath, '1', {flag: 'wx'}, function (err) {
            if (err) {
                fs.readFile(fPath, 'utf-8', function (err, data) {
                    if (data) {
                        let dataInt = (parseInt(data));
                        dataInt++;
                        resolve(dataInt);

                        fs.writeFile(fPath, dataInt + ' ', function (err) {
                        })
                    }


                });
            } else {
                console.log("It's saved!");
            }
        })
    });
}


/*
*  .then(({ images }) => writeFileSync('path/to/image.png', images[0], 'base64'))
*
* */
//http://127.0.0.1:7860/docs#/default/img2imgapi_sdapi_v1_img2img_post

module.exports.prompt = async (prompt) => {

    const options = {
        width: 400,
        height: 360,
        steps: 10,
        prompt//: 'beinhalten beispielsweise die,Meerschweinchen , die Behandlung von'
    };

    return new Promise((resolve, reject) => {
        axios.post('http://localhost:7860/sdapi/v1/txt2img', options)
            .then(async function (response) {
                // handle success
                console.log('------>prompt: ', prompt);
                createDirWhenNotExist(_imageDir);
                const san = sanitize(prompt);//.trim().replaceAll(',,', ',')
                const name = sanitize(prompt) + '_' + response.data.images.length + '-' + await incrementClientCall();
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
