const fetch = require('node-fetch');
const fs = require('fs');
const axios = require('axios');


const _token = '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';
var imageName = __dirname + '/huggin-file2.png';


(async () => {
    try {
        let result = await axios.post(
            'https://api-inference.huggingface.co/models/runwayml/stable-diffusion-v1-5',
            {"inputs": "Cyberneticist,  Operation (game) a battery-operated, board game , Horror fiction  ,Naturism (disambiguation), 4k"},
            {
                Authorization: _token,
                Accept: 'application/json',
                'Content-Type': 'application/json',
                responseType: 'arraybuffer',
            },
        );
        const buffer = Buffer.from(result.data);
        const a = fs.writeFileSync(imageName, buffer, "binary");

    } catch (error) {
        console.log(error);

    }

})()

return;


//https://huggingface.co/runwayml/stable-diffusion-v1-5

// https://huggingface.co/docs/api-inference/detailed_parameters
const _tokenXX = 'hf_sFPdewtIKKFwOxpLErwYmceZxbMHMSeCcZXXXXX';
const request = require('request');
request({
    url: 'https://api-inference.huggingface.co/models/runwayml/stable-diffusion-v1-5',
    headers: {
        "X-Token-Auth": 'Bearer ' + _token
    },
    data: {"inputs": "Astronaut riding a horse"}
}).pipe(fs.createWriteStream('filename.png'))

return


const instance = axios.create({
    baseURL: 'https://api-inference.huggingface.co/models/runwayml/stable-diffusion-v1-5',
    headers: {'Authorization': 'Bearer ' + _token},
    data: {"inputs": "Astronaut riding a horse"}
});

/*

axios.defaults.headers.common = {
    'Authorization': 'Bearer ' + _token
};*/
async function query(data) {
    //const url = 'https://api-inference.huggingface.co/models/runwayml/stable-diffusion-v1-5';
    await instance.post('/').then(async (response) => {


// console.log(response.data)
        var imageName = __dirname + '/huggin-file.png';


        fs.writeFileSync(imageName, response.data, 'base64', function (err) {
            if (err) throw err;
            console.log('It\'s saved!');
        });


        return
        fs.writeFile(dir + 'image.png', chunk, function (err) {
            if (err) throw err;
            console.log('It\'s saved!');
        });


        const a = fs.writeFileSync(imageName, response.data, "binary");
        console.log(a)
        // fs.writeFileSync(imageName, response.data, 'base64')

        return;

        //  var data = JSON.stringify(response.data);//.replace(/^data:image\/\w+;base64,/, "");
        var buf = Buffer.from(response.data);
        fs.writeFileSync(imageName, JSON.stringify(response.data), 'base64');

        return;


        await fs.promises.createWriteStream(imageName).write(response.data);
        return
        fs.writeFile(imageName, (response.data), 'base64', function (err) {
            console.log(err);
        });


    }).catch((response) => {
        console.log(response.response)
    })

    return;


    const config = {
        headers: {Authorization: `Bearer ${_token}`},
        data,
    };

    const bodyParameters = {};

    await axios.post(
        'https://api-inference.huggingface.co/models/runwayml/stable-diffusion-v1-5',

        config
    ).then((response) => {
        console.log(response)
        var imageName = __dirname + '/huggin-file.png';


        fs.writeFile(imageName, response, 'base64', function (err) {
            console.log(err);
        });
    }).catch((response) => {
        console.log(response.response)
    });

    ;


    const response = await fetch(
        "https://api-inference.huggingface.co/models/runwayml/stable-diffusion-v1-5",
        {
            headers: {Authorization: "Bearer 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"},
            method: "POST",
            body: JSON.stringify(data),
        }
    );


    const result = await response.blob();
    return result;
}

query({"inputs": "Astronaut riding a horse"}).then((response) => {
    process.exit();


    var img = JSON.stringify(response);//Buffer.from(response, 'base64');
    var imageName = __dirname + '/huggin-file.png';


    return;


    fs.writeFile(imageName, response, 'base64', function (err) {
        console.log(err);
    });

    return;

    var imageBuffer = response;
    var imageName = __dirname + '/huggin-file.png';

    fs.createWriteStream(imageName).write(imageBuffer);


    return
    fs.writeFile(__dirname + '/huggin-file.png', JSON.stringify(data), function (err) {
        console.log(err);
    });


});