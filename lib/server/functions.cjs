const path = require("path");
const fs = require("fs");
const routes = require("./index.cjs");
const handlebars = require("handlebars");
const { isValidPartial, isOnServer } = require("./helpers.cjs");

const store = require("./store.cjs");
// Initialize the file-path cache at startup
// Using the same imgPath as in functions.cjs


// rest of your code ...
// e.g. app.use('/', routes);

// For demonstration, suppose you want to see your cache

const _ = {
    getImageTemplate(){

  // @TODO
        let indexHtml = fs.readFileSync(path.join(__dirname, './../web/dist/index-template.hbs'), 'utf-8');
        _.registerPartials(path.join(__dirname, './partials'));

        const homeTemplate = handlebars.compile(indexHtml);
        return homeTemplate;
    },
    getHomeTemplate: () => {
        let indexHtml = fs.readFileSync(path.join(__dirname, './../web/dist/index-template.hbs'), 'utf-8');
        _.registerPartials(path.join(__dirname, './partials'));

        const homeTemplate = handlebars.compile(indexHtml);
        return homeTemplate;
    },
    registerPartials: (partialsFolder) => {
       // console.log(partialsFolder, 'partialsFolder')

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

        try {
            const p = path.join( imgPath, dir);
            return require(p, 'utf-8');
        }catch (e){
            console.log('getJSON error-->',e)
            return {}
        }
    },
    async getFile(dir) {
        try {
            const p = path.join(imgPath, dir);
            return await fs.promises.readFile(p, {encoding: 'base64'});

        }catch (e){
            console.log('getFile error-->',e)
            return JSON.stringify(e)
        }
     },
    /**
     * Example function that fetches PNG files (and JSON metadata) from a folder
     * but uses the in-memory store instead of scanning the disk each time.
     *
     * @param {string} dir e.g. "/v-1__bak"
     * @returns {Array} array of objects like { href, json, mtime }
     */
    getAllFilesFromFolderForImages(dir = "v-1__bak") {
        // remove leading slash if present
        const folderName = dir.replace("/", "");
        // get metadata array from the store
        const cachedData = store.getFolder(folderName); // e.g. [ { file, fullPath, mtime, ... }, ...]

        // Transform each item to match your original usage
        return cachedData.map((metaObj) => {
            let href = "/v" + dir + "/" + metaObj.file;
            let json = { name: metaObj.file };

            // Optionally read the .json file if it exists
            try {
                // metaObj.jsonPath might be something like "/.../myImage.json"
                Object.assign(json, require(metaObj.jsonPath));
            } catch (err) {
                // no .json or failed to read
            }

            return {
                href,
                json,
                mtime: metaObj.mtime.getTime(),
            };
        });
    },
    getRandomImage: (folder) => {
        const folderP = folder;// path.join(p, folder);

        try {
            const images = fs.readdirSync(folderP).filter(file => {
                const lstat = fs.lstatSync(path.join(folderP, file));
                return (lstat.isFile() && file.indexOf('.png') != -1);
            })

            const rndImg = images[Math.floor(Math.random() * images.length)];
            return path.join(folderP, rndImg)
        } catch (err) {
            console.log('getRandomImage err ', err);

            return null;
        }

    },
    getRandomFolder: () => {
        let files = fs.readdirSync(imgPath).filter(file => {
            return fs.lstatSync(path.join(imgPath, file)).isDirectory()
        });

        return p + '/' + files[Math.floor(Math.random() * files.length - 1)];
    },
    /**
     * Create a "menu" of subfolders from the store
     */
    createMenu(dir, actFolderName = "/") {
        const allFolders = Object.keys(store.getCache()); // e.g. ["v-1__bak","v-2",...]

        // map them to your menu structure
        let menu = allFolders.map((folder) => {
            // each folder has array of images in store
            const fileCnt = store.getFolder(folder).length;
            const current = actFolderName === folder;
            // build href
            let href = "/v/" + folder;
            if (isOnServer()) {
                // if you have some special prefix on your server, handle it here
                // e.g.: href = "/daily-doasis" + href;
            }
            return { href, name: folder, fileCnt, current };
        });

        // add home link at top
        let homeHref = "/";
        if (isOnServer()) {
            // homeHref = "/daily-doasis"; // if needed
        }

        // only include folders with at least 1 file
        menu = menu.filter((i) => i.fileCnt >= 1);

        // prepend 'Home'
        menu = [{ href: homeHref, name: "Home", current: actFolderName == "/" }].concat(
            menu
        );

        return menu;
    },

    /**
     * Example function to add a new file to the store's cache
     * once the file is written to disk.
     */
    addNewFileToCache(folderName, fileName) {
        store.addFile(folderName, fileName);
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
            const folderName = _.getMostRecentPNGFileOrFolder(imgPath, false).file;
            // console.log('folderName*******', folderName);
            const newestPngFile =
                _.getMostRecentPNGFileOrFolder(path.join( imgPath + '/' + folderName), true, indexImage);


            const mrF = path.join( imgPath + '/' + folderName + '/' + newestPngFile.file);
            // console.log('newestPngFile*******', mrF);
            contents = await fs.promises.readFile(mrF, {encoding: 'base64'});

            const mrJSon = path.join( imgPath + '/' + folderName + '/' + newestPngFile.file).replace('.png', '.json');

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