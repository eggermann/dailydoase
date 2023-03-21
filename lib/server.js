const express = require("express");
const path = require("path");
const fs = require("fs");
const Handlebars = require('handlebars');
const os = require("os");
const imgPath = '/../images';
const port = 4000;
const isOnServer = () => {
    const userHomeDir = os.homedir();

    //console.log('on uberspace ------>', userHomeDir, '<-------', (userHomeDir.indexOf('eggman') != -1))

    return (userHomeDir.indexOf('eggman') != -1)
}

const _ = {
    async getFile(dir) {
        const p = __dirname + imgPath + dir;
        return await fs.promises.readFile(p, {encoding: 'base64'});
    },
    getAllFilesFromFolderForImages(dir = 'v-1__bak') {
        const p = __dirname + imgPath + dir;

        const buffer = {}
        let files = fs.readdirSync(p)
            .filter(file => {
                if (file.indexOf('.png') == -1) {
                    return null;
                }

                const lstat = fs.lstatSync(path.join(p, file));
                buffer[file] = lstat;
                const isFile = lstat.isFile();
                return isFile;
            }).map((file2) => {
                let href = '/v'
                if (isOnServer()) {
                    href = '/daily-doasis' + href;
                }
                href = href + dir + '/' + file2;

                try {
                    const mrJSon = p + '/' + file2.replace('.png', '.json');
                    let json = require(mrJSon, {encoding: 'utf8'});
                    const d = buffer[file2].mtime;
                    const mtime = Date.parse(d);
                    //   console.log(   json.mtime)

                    return {href, json, mtime}
                } catch (err) {
                    console.log('XXXX ', err);

                    return {href, json: {}}
                }
            });

        return files;
    },
    getAllFoldersForMEmu(dir, actFolderName = "/") {
        let files = fs.readdirSync(dir).filter(file => {

            const lstat = fs.lstatSync(path.join(dir, file));
            const isFile = lstat.isFile();
            return !isFile;
        }).map((file) => ({folder: file, mtime: fs.lstatSync(path.join(dir, file)).mtime}))
            .sort((a, b) => b.mtime.getTime() - a.mtime.getTime())
            .map((file) => {

                const folder = file.folder
                const fileCnt = fs.readdirSync(path.join(dir, folder)).length / 2;
                //    console.log(actFolderName, folder)
                let current = false;
                if (actFolderName == folder) {
                    current = true;
                }

                let href = '/v/'
                if (isOnServer()) {
                    href = '/daily-doasis' + href;
                }//

                return {href: href + folder, name: folder, fileCnt, current};
            })

        let href = '/'
        if (isOnServer()) {
            href = '/daily-doasis';
        }//
        files = [{href, name: 'Home', current: (actFolderName == '/')}].concat(files);
        return files;
    },

    orderRecentFiles(dir, returnFiles) {

        return fs.readdirSync(dir).filter(file => {

            const lstat = fs.lstatSync(path.join(dir, file));
            const isFile = lstat.isFile();

            if (returnFiles) {
                if (isFile) {

                    if (file.indexOf('.png') != -1) {

                        return true;
                    }

                    return false;
                }
                return false;
            } else {
                return !isFile;
            }
        }).map((file) => ({file, mtime: fs.lstatSync(path.join(dir, file)).mtime}))
            .sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
    },
    getMostRecentPNGFileOrFolder(dir, returnFiles, indexImage = 0) {
        const files = _.orderRecentFiles(dir, returnFiles);

        indexImage %= files.length;
        return files.length ? files[indexImage] : undefined;
    },
    mostRecentFileOrFolder: async (indexImage) => {
        let contents = '', json = {};

        try {
            const folderName = _.getMostRecentPNGFileOrFolder(__dirname + imgPath, false).file;
            //  console.log('folderName*******', folderName);
            const newestPngFile =
                _.getMostRecentPNGFileOrFolder(__dirname + '/../images/' + folderName, true, indexImage);

            // console.log('newestPngFile*******', newestPngFile);
            const mrF = __dirname + '/../images/' + folderName + '/' + newestPngFile.file;
            // console.log('newestPngFile*******', mrF);
            contents = await fs.promises.readFile(mrF, {encoding: 'base64'});

            const mrJSon = __dirname + '/../images/' + folderName + '/' + (newestPngFile.file).replace('.png', '.json');

            try {
                json = await fs.promises.readFile(mrJSon, {encoding: 'utf8'});

            } catch (err) {
                json = {};
            }


            return {imageBase64: contents, json};
        } catch (err) {
            return {err}
        }
    },
    oldDatas: null,
    webRootPath: '/',
    cnt: 0,


    roots() {
        const app = express();
        app.use(express.static(path.join(__dirname, './web/dist')));
        app.get(`/img`, async (req, res) => {

            const data = await _.mostRecentFileOrFolder();


            if (false && data.json == (_.oldDatas && _.oldDatas.json)) {
                console.log('same');
                const dataHistorical = await _.mostRecentFileOrFolder(_.cnt++);

                res.json(dataHistorical);
            } else {

                _.oldDatas = data

                res.json(data);
            }
        });

        /******             root                    ****/


        app.get(`/`, (req, res) => {
            res.set('content-type', 'text/html');
            const menu = _.getAllFoldersForMEmu(path.join(__dirname, './../images'));
            let indexHtml = fs.readFileSync(path.join(__dirname, '/web/dist/index-template.hbs'), 'utf-8');
            let template = Handlebars.compile(indexHtml);
            const data = {menu, isHome: true}
            const result = '<!DOCTYPE html> ' + template(data);

            res.send(result);
        });

        app.get(`/v/:version/`, (req, res) => {
            indexHtml = fs.readFileSync(path.join(__dirname, '/web/dist/index-template.hbs'), 'utf-8');
            template = Handlebars.compile(indexHtml);


            const actFolderName = req.params.version;
            const menu = _.getAllFoldersForMEmu(path.join(__dirname, './../images'), actFolderName);
            const images = _.getAllFilesFromFolderForImages('/' + actFolderName);

            const data = {menu, images, pageClass: 'folder'};
            const result = '<!DOCTYPE html> ' + template(data);

            res.send(result);
        })

        app.get(`/v/:version/:img/`, async (req, res) => {
            const images = await _.getFile('/' + req.params.version + '/' + req.params.img);
            const img = Buffer.from(images, 'base64');

            res.writeHead(200, {
                'Content-Type': 'image/png',
                'Content-Length': img.length
            });
            res.end(img);
        })

        app.listen(port, '0.0.0.0', () => {
            console.log(`http://0.0.0.0:${port}/`);
        });
    }
}

module.exports.init = () => {

}
_.roots();
//_.roots();
//_.mostRecentFileOrFolder();