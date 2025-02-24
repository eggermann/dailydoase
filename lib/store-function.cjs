const path = require("path");
const fs = require("fs");

const { isValidPartial, isOnServer } = require("./server/helpers.cjs");
const store = require("./store.cjs");


const _ = {
    getJSON(dir) {

        try {
            const p = path.join(store.imgPath, dir);
            return require(p, 'utf-8');
        } catch (e) {
            console.log('getJSON error-->', e)
            return {}
        }
    },
    async getFile(dir) {
        try {
            const p = path.join(store.imgPath, dir);
            return await fs.promises.readFile(p, { encoding: 'base64' });

        } catch (e) {
            console.log('getFile error-->', e)
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
    getRandomItem: () => {
        const cache = store.getCache()
        const keys = Object.keys(cache);

        const rndFolderKey = keys[Math.floor(Math.random() * keys.length)];

        const rndImg = cache[rndFolderKey][Math.floor(Math.random() * cache[rndFolderKey].length)];

        return rndImg.fullPath;

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
        })
    },
    async orderByRecent(files) {
        files.map((file) => ({ file, mtime: fs.lstatSync(path.join(dir, file)).mtime }))
            .sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
    },

    getMostRecentPNGFileOrFolder(dir, returnFiles, indexImage = 0) {
        const files = _.orderRecentFiles(dir, returnFiles);
        const sortedFiles = _.orderByRecent(files);

        indexImage %= sortedFiles.length;
        return sortedFiles.length ? sortedFiles[indexImage] : undefined;
    },

    async mostRecentItem() {
    store.getCache();

    },
    mostRecentFileOrFolder: async (indexImage) => {
        let contents = '', json = {};

        try {
            const folderName = _.getMostRecentPNGFileOrFolder(store.imgPath, false).file;
            // console.log('folderName*******', folderName);
            const newestPngFile =
                _.getMostRecentPNGFileOrFolder(path.join(store.imgPath + '/' + folderName), true, indexImage);


            const mrF = path.join(store.imgPath + '/' + folderName + '/' + newestPngFile.file);
            // console.log('newestPngFile*******', mrF);
            contents = await fs.promises.readFile(mrF, { encoding: 'base64' });

            const mrJSon = path.join(store.imgPath + '/' + folderName + '/' + newestPngFile.file).replace('.png', '.json');

            try {
                json = await fs.promises.readFile(mrJSon, { encoding: 'utf8' });

            } catch (err) {
                json = {};
            }


            return { imageBase64: contents, json };
        } catch (err) {
            return { err }
        }
    }
}

module.exports = _;