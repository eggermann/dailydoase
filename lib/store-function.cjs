const path = require("path");
const fs = require("fs");
const { isValidPartial, isOnServer } = require("./server/helpers.cjs");
const store = require("./store.cjs");

const _ = {
    async getJSON(dir) {
        try {
            const p = path.join(await store.imgPath(), dir);
            const data = await fs.promises.readFile(p, "utf-8");
            return JSON.parse(data);
        } catch (e) {
            console.error("getJSON error:", e);
            return {};
        }
    },

    async getFile(dir) {
        try {
            const p = path.join(await store.imgPath(), dir);
            return await fs.promises.readFile(p, { encoding: "base64" });
        } catch (e) {
            console.error("getFile error:", e);
            return JSON.stringify(e);
        }
    },

    getAllFilesFromFolderForImages(dir = "v-1__bak") {
        const folderName = dir.replace("/", "");
        const cachedData = store.getFolder(folderName);

        return cachedData.map((metaObj) => {
            let href = `/v${dir}/${metaObj.file}`;
            let json = { name: metaObj.file };

            try {
                const jsonPath = metaObj.jsonPath;
                if (fs.existsSync(jsonPath)) {
                    json = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
                }
            } catch (err) {
                console.warn(`Error reading JSON metadata for ${metaObj.file}:`, err);
            }

            return { href, json, mtime: metaObj.mtime.getTime() };
        });
    },

    getRandomItem() {
        const cache = store.getCache();
        const keys = Object.keys(cache);
        if (!keys.length) return null;

        const rndFolderKey = keys[Math.floor(Math.random() * keys.length)];
        const rndImg = cache[rndFolderKey][Math.floor(Math.random() * cache[rndFolderKey].length)];

        return rndImg.fullPath;
    },

    addNewFileToCache(folderName, fileName) {
        store.addFile(folderName, fileName);
    },

    /**
     * Finds the most recently modified file or folder in a directory.
     */
    getNewestFileOrFolder(dir, returnFiles) {
        const files = fs.readdirSync(dir)
            .filter((file) => {
                const lstat = fs.lstatSync(path.join(dir, file));
                return returnFiles ? lstat.isFile() && file.endsWith(".png") : lstat.isDirectory();
            })
            .map((file) => ({
                file,
                mtime: fs.lstatSync(path.join(dir, file)).mtime.getTime(),
            }));

        if (!files.length) return null;

        return files.reduce((latest, current) => (current.mtime > latest.mtime ? current : latest));
    },

    async mostRecentFileOrFolder(indexImage = 0) {
        try {
            const imgPath = await store.imgPath();

            // Find the most recent folder
            const folder = _.getNewestFileOrFolder(imgPath, false);
            if (!folder) throw new Error("No folders found.");

            // Find all PNG files inside that folder
            const folderPath = path.join(imgPath, folder.file);
            const pngFiles = fs.readdirSync(folderPath)
                .filter(file => file.endsWith(".png"))
                .map(file => ({
                    file,
                    mtime: fs.lstatSync(path.join(folderPath, file)).mtime.getTime(),
                }));

            if (!pngFiles.length) throw new Error("No PNG files found in folder.");

            // Ensure indexImage wraps around if it's out of range
            const selectedImage = pngFiles[indexImage % pngFiles.length];

            const fullImgPath = path.join(folderPath, selectedImage.file);
            const jsonPath = fullImgPath.replace(".png", ".json");

            const imageBase64 = await fs.promises.readFile(fullImgPath, { encoding: "base64" });
            let json = {};

            if (fs.existsSync(jsonPath)) {
                json = JSON.parse(await fs.promises.readFile(jsonPath, "utf8"));
            }

            return { imageBase64, json };
        } catch (err) {
            console.error("mostRecentFileOrFolder error:", err);
            return { error: err.message };
        }
    },
};

module.exports = _;