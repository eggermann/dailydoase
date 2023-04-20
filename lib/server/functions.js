const path = require("path");
const fs = require("fs");
const os = require("os");
const routes = require("./index.js");
const handlebars = require("handlebars");
const imgPath = '/../../images';

const isValidPartial = (file) => {
    return path.extname(file) === ".hbs"
};

const isOnServer = () => {
    const userHomeDir = os.homedir();
    //console.log('on uberspace ------>', userHomeDir, '<-------', (userHomeDir.indexOf('eggman') != -1))
    return (userHomeDir.indexOf('eggman') != -1)
}

const _ = {
    getHomeTemplate: () => {
        let indexHtml = fs.readFileSync(path.join(__dirname, './../web/dist/index-template.hbs'), 'utf-8');
        _.registerPartials(path.join(__dirname,'./partials'));

        const homeTemplate = handlebars.compile(indexHtml);
        return homeTemplate;
    },
    registerPartials: (partialsFolder) => {
        console.log(partialsFolder,'partialsFolder')

        fs.readdirSync(partialsFolder)
            .filter(isValidPartial)
            .forEach(partial => {
                const ext = path.extname(partial);

                const fileFullPath = path.join(partialsFolder, partial)
                const data = fs.readFileSync(fileFullPath, 'utf-8')

                // Store as `"filename without extension": content`.
                handlebars.registerPartial(path.basename(partial, ext), data);
            })
    },
    getJSON(dir) {
        const p = __dirname + imgPath + dir;
        return require(p, 'utf-8');
    },
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
                href = href + dir + '/' + file2;
                let json = {name: file2}
                try {
                    const mrJSon = p + '/' + file2.replace('.png', '.json');
                    Object.assign(json, require(mrJSon));
                    const d = buffer[file2].mtime;
                    const mtime = Date.parse(d);
                    //   console.log(   json.mtime)

                    return {href, json, mtime}
                } catch (err) {
                    console.log('XXXX ', err);

                    return {href, json}
                }
            });

        return files;
    },
    createMenu(dir, actFolderName = "/") {
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
                    //->router     href = '/daily-doasis' + href;
                }//

                return {href: href + folder, name: folder, fileCnt, current};
            })

        let href = '/'
        if (isOnServer()) {
            // href = '/daily-doasis';        //->router
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
//            console.log('----->',imgPath )
            const folderName = _.getMostRecentPNGFileOrFolder(path.join(__dirname, imgPath), false).file;
            // console.log('folderName*******', folderName);
            const newestPngFile =
                _.getMostRecentPNGFileOrFolder(path.join(__dirname, imgPath + '/' + folderName), true, indexImage);

            // console.log('newestPngFile*******', newestPngFile);
            const mrF = path.join(__dirname, imgPath + '/' + folderName + '/' + newestPngFile.file);
            // console.log('newestPngFile*******', mrF);
            contents = await fs.promises.readFile(mrF, {encoding: 'base64'});

            const mrJSon = path.join(__dirname + imgPath + '/' + folderName + '/' + newestPngFile.file).replace('.png', '.json');

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
    cnt: 0
}

module.exports = _;