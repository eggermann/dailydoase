const express = require("express");
const path = require("path");
const fs = require("fs");

const _ = {
    orderRecentFiles(dir, returnFiles) {
        console.log(dir)
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
            const folderName = _.getMostRecentPNGFileOrFolder(__dirname + '/../images', false).file;
            console.log('folderName*******', folderName);
            const newestPngFile =
                _.getMostRecentPNGFileOrFolder(__dirname + '/../images/' + folderName, true, indexImage);

            console.log('newestPngFile*******', newestPngFile);
            const mrF = __dirname + '/../images/' + folderName + '/' + newestPngFile.file;
            console.log('newestPngFile*******', mrF);
            contents = await fs.promises.readFile(mrF, {encoding: 'base64'});

            const mrJSon = __dirname + '/../images/' + folderName + '/' + (newestPngFile.file).replace('.png', '.json');
            json = await fs.promises.readFile(mrJSon, {encoding: 'utf8'});
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
        app.use(`/`, express.static(path.join(__dirname, './web/dist')));

        app.get(`/img`, async (req, res) => {
            const data = await _.mostRecentFileOrFolder();
console.log('***************#####************')
            if (data.json == (_.oldDatas && _.oldDatas.json)) {
                console.log('same');
                const dataHistorical = await _.mostRecentFileOrFolder(_.cnt++);

                res.json(dataHistorical);
            } else {
                _.oldDatas=data
                res.json(data);
            }


        });

        /******             root                    ****/
        app.get(`/`, (req, res) => {
            res.set('content-type', 'text/html');
            res.sendFile(path.join(__dirname, '/web/dist/index.html'));
            //res.sendFile(path.join(__dirname, '/dist/index.html'));
        });

        app.listen(4000, '0.0.0.0', () => {
            console.log(`http://0.0.0.0:4000/`);
        });
    }
}

module.exports.init = () => {
    _.roots();
}
/*
_.roots();
_.mostRecentFileOrFolder();*/