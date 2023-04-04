const express = require("express");
const path = require("path");
const fs = require("fs");
const Handlebars = require("handlebars");
const _ = require("./functions.js");
const os = require("os");
const app = express();
const router = express.Router();
const baseUrl = 'https://dailydoase.de';//https://eggman.uber.space/daily-doasis';         //->router
const isOnServer = () => {
    const userHomeDir = os.homedir();x

    //console.log('on uberspace ------>', userHomeDir, '<-------', (userHomeDir.indexOf('eggman') != -1))

    return (userHomeDir.indexOf('eggman') != -1)
}

port = 4000;


module.exports.init = () => {
    app.use(express.static(path.join(__dirname, '../web/dist')));


    /******             root                    ****/


    router.get(`/`, (req, res) => {
        res.set('content-type', 'text/html');
        const menu = _.getAllFoldersForMEmu(path.join(__dirname, './../../images'));
        let indexHtml = fs.readFileSync(path.join(__dirname, './../web/dist/index-template.hbs'), 'utf-8');
        let template = Handlebars.compile(indexHtml);
        const data = {menu, isHome: true}
        const result = '<!DOCTYPE html> ' + template(data);

        res.send(result);
    });

    //polling from home
    router.get(`/img`, async (req, res) => {
        //   console.log('polling ß? ----')
        const data = await _.mostRecentFileOrFolder();

        /// process.exit()
        if (false && data.json == (_.oldDatas && _.oldDatas.json)) {

            const dataHistorical = await _.mostRecentFileOrFolder(_.cnt++);

            res.json(dataHistorical);
        } else {
            _.oldDatas = data
            res.json(data);
        }
    });

    router.get(`/v/:version/`, (req, res) => {
        const indexHtml = fs.readFileSync(path.join(__dirname, '../web/dist/index-template.hbs'), 'utf-8');
        const template = Handlebars.compile(indexHtml);

        const actFolderName = req.params.version;
        const menu = _.getAllFoldersForMEmu(path.join(__dirname, './../../images'), actFolderName);
        const images = _.getAllFilesFromFolderForImages('/' + actFolderName);

        const data = {menu, images, pageClass: 'folder'};
        const result = '<!DOCTYPE html> ' + template(data);

        res.send(result);
    })

    router.get(`/v/:version/:img/`, async (req, res) => {
        const url = '/' + req.params.version + '/' + req.params.img;
        const suffix = path.parse(req.params.img).ext;

        if (suffix == '.json') {
            //https://eggman.uber.space/daily-doasis/v/sd-73-v2/1-3491.png
            const json = _.getJSON(url)
            const imageUrl = '/v' + url.replace('.json', '.png');

            const wordsSentence = json.words.map(i => i[0]).join('-')

            const nftMeta = {
                "name": wordsSentence,
                "description": json.prompt,
                "image": baseUrl + imageUrl
            }

            res.json(nftMeta);
            return
        }

        const images = await _.getFile('/' + req.params.version + '/' + req.params.img);
        const img = Buffer.from(images, 'base64');

        res.writeHead(200, {
            'Content-Type': 'image/png',
            'Content-Length': img.length
        });
        res.end(img);
    })

    router.get(`/daily-doasis`, (req, res) => {
        res.redirect('https://dailydoase.de/')
    })


    const prefix='';//isOnserver ===- stage station
    app.use(prefix, router);
    app.listen(port, '0.0.0.0', () => {
        console.log(`http://0.0.0.0:${port}/`);
    });
}

//module.exports.init();