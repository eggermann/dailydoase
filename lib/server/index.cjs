const express = require("express");
const path = require("path");
const fs = require("fs");
const Handlebars = require("handlebars");
const bodyParser = require('body-parser');
var cors = require('cors');
const _ = require("./functions.cjs");
const app = express();
app.use(cors())
const router = express.Router();
const baseUrl = 'https://dailydoase.de';//https://eggman.uber.space/daily-doasis';         //->router

const port = 4000;

const __ = {dailymotionCnt: 0, youtubeCnt: 0, maxJsonFiles: 20000};


const routes = [
    {
        '/youtube': async (req, res) => {

            const folderPath = path.join(__dirname, '../../youtube')
            __.getNext();

            fs.readdir(folderPath, (err, files) => {
                if (err) {
                    console.error('Error reading folder:', err);
                    return res.status(500).send('Internal Server Error');
                }

                // Filter out non-files (e.g., directories)
                const fileStats = files
                    .map((file) => {
                        const filePath = path.join(folderPath, file);
                        const stats = fs.statSync(filePath);
                        return {file, stats};
                    })
                    .filter((item) => item.stats.isFile());

                // Sort files by modification time in descending order
                fileStats.sort((a, b) => b.stats.mtime - a.stats.mtime);

                if (fileStats.length === 0) {
                    return res.status(404).send('No files found in the folder');
                }


                const newestFile = fileStats[0].file;
                const oldestFile = fileStats[fileStats.length - 1].file;
                const pos = fileStats.length - 1 - ((__.youtubeCnt++) % fileStats.length);
                const actFile = fileStats[pos].file;
                const filePath = path.join(folderPath, actFile);

                // Send the newest file as a response
                res.download(filePath, (err) => {
                    if (err) {
                        console.error('Error sending file:', err);
                        return res.status(500).send('Internal Server Error');
                    }
                });
            });

        }
    },
    {
        '/dailymotion': async (req, res) => {

            const folderPath = path.join(__dirname, '../../dailymotion')

            fs.readdir(folderPath, (err, files) => {
                if (err) {
                    console.error('Error reading folder:', err);
                    return res.status(500).send('Internal Server Error');
                }

                // Filter out non-files (e.g., directories)
                const fileStats = files
                    .map((file) => {
                        const filePath = path.join(folderPath, file);
                        const stats = fs.statSync(filePath);
                        return {file, stats};
                    })
                    .filter((item) => item.stats.isFile());

                // Sort files by modification time in descending order
                fileStats.sort((a, b) => b.stats.mtime - a.stats.mtime);

                if (fileStats.length > __.maxJsonFiles) {
                    const delta = fileStats.length - __.maxJsonFiles
                    for (let i = 0; i <= delta; i++) {
                        const jsonFilm = fileStats.pop();

                        const deleteFile = folderPath+'/'+jsonFilm.file;
                        console.log(deleteFile);
                        fs.unlinkSync(deleteFile);
                        console.log('gelöscht: ', deleteFile)
                    }
                } else {
                    __.getNext();
                }


                if (fileStats.length === 0) {
                    return res.status(404).send('No files found in the folder');
                }

                const newestFile = fileStats[0].file;
                const oldestFile = fileStats[fileStats.length - 1].file;
                const pos = fileStats.length - 1 - ((__.dailymotionCnt++) % fileStats.length);
                const actFile = fileStats[pos].file;

                const filePath = path.join(folderPath, actFile);

                // Send the newest file as a response
                res.download(filePath, (err) => {
                    if (err) {
                        console.error('Error sending file:', err);
                        return res.status(500).send('Internal Server Error');
                    }
                });
            });
        }
    },
    {
        '/rnd': async (req, res) => {

            let folder = req.query.version;
            folder = folder || _.getRandomFolder();

            if (folder == 'newest') {
                //  folder =_.mostRecentFileOrFolder();
            }

//            console.log('----->',folder)
            const imageP = _.getRandomImage(folder);
            if (!imageP) {
                console.log('----->err no such img ')
                return;
            }
            console.log('----->rnd ', imageP)

            const image = await fs.promises.readFile(imageP, {encoding: 'base64'});
            const img = Buffer.from(image, 'base64');

            res.writeHead(200, {
                'Content-Type': 'image/png',
                'Content-Length': img.length
            });

            res.end(img)
        }
    },
    {
        '/': (req, res) => {
            res.set('content-type', 'text/html');
            const menu = _.createMenu(path.join(__dirname, './../../images'));

            const template = _.getHomeTemplate()
            const data = {menu, isHome: true}
            const result = '<!DOCTYPE html> ' + template(data);

            res.send(result);
        }
    },
    {
        '/img':
            async (req, res) => {
                //   console.log('polling ß----')
                const data = await _.mostRecentFileOrFolder();

                /// process.exit()
                if (false && data.json == (_.oldDatas && _.oldDatas.json)) {

                    const dataHistorical = await _.mostRecentFileOrFolder(_.cnt++);

                    res.json(dataHistorical);
                } else {
                    _.oldDatas = data;
                    res.json(data);
                }
            }
    },
    {
        '/daily-doasis':
            (req, res) => {
                res.redirect('https://dailydoase.de/')
            }
    },
    {
        '/v/:version/':
            (req, res) => {
                const indexHtml = fs.readFileSync(path.join(__dirname, '../web/dist/index-template.hbs'), 'utf-8');
                const template = Handlebars.compile(indexHtml);

                const actFolderName = req.params.version;
                if (actFolderName == 'newest') {

                }

                const autoplay = (req.query.autoplay != null) ? 1 : 0;


                const menu = _.createMenu(path.join(__dirname, './../../images'), actFolderName);
                const images = _.getAllFilesFromFolderForImages('/' + actFolderName);

                let infoJson = images[0].json;
                /*  const words = infoJson.words.reduce((acc, i) => {
                       return acc += ' <span>' + i[0] + '</span>';
                   }, '');

                   /*   try {
                          infoJson = require('/' + actFolderName + '/info.json');
                      } catch (err) {
                      }*/

                const data = {menu, images, pageClass: 'folder', autoplay, infoJson};
                const result = '<!DOCTYPE html> ' + template(data);

                res.send(result);
            }
    },
    {
        '/v/:version/:img/':
            async (req, res) => {
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
            }
    },
    {
        '/v/:version/:img/img':
            async (req, res) => {

                const images = await _.getFile('/' + req.params.version + '/' + req.params.img);
                const img = Buffer.from(images, 'base64');

                res.writeHead(200, {
                    'Content-Type': 'image/png',
                    'Content-Length': img.length
                });
                res.end(img);
            }
    }
]
module.exports.init = (getNext) => {

    app.use(express.static(path.join(__dirname, '../web/dist')));
    __.getNext = getNext;
    _.registerPartials(path.join(__dirname, './partials'));

    routes.forEach(r => {
        const route = Object.keys(r)[0];
        const meth = r[route]
        router.get(route, meth)
    })

    const prefix = '';//isOnserver ===- stage station
    app.use(prefix, router);
    app.listen(port, '0.0.0.0', () => {
        console.log(`http://0.0.0.0:${port}/`);
    });
}

//module.exports.init();