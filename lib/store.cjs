const fs = require("fs");
const path = require("path");
const functions = require("./store-function.cjs");
const { ensureDirectoryExists } = require("./helpers.cjs");

// The in-memory cache structure, e.g.:
// {
//   "folderName": [
//       {
//         "file": "someimage.png",
//         "ext": ".png",
//         "fullPath": "...",
//         "mtime": Date(),
//         "jsonPath": "..."
//       },
//       ...
//   ],
//   ...
// }
let _cache = Object.create(null);
let _totalFiles = 0;

// We'll store the base _imgPath here so we can use it in addFile, etc.

let _imgPath = null;
let _imageDir = null;

/**
 * Scans a folder (absolute path) for image files (.png).
 * Returns an array of file meta info objects.
 */
function scanFolderForImages(folderAbsolutePath) {
    const folderFiles = fs.readdirSync(folderAbsolutePath).filter((fileName) => {
        const fullPath = path.join(folderAbsolutePath, fileName);
        const stats = fs.lstatSync(fullPath);
        return stats.isFile() && fileName.toLowerCase().endsWith(".png");
    });

    return folderFiles.map((fileName) => {
        const fullPath = path.join(folderAbsolutePath, fileName);
        const stats = fs.lstatSync(fullPath);
        return {
            file: fileName,
            ext: path.extname(fileName),
            fullPath,
            url: fullPath.split(imageDir)[1],
            mtime: stats.mtime,
            jsonPath: fullPath.replace(".png", ".json"),
        };
    });
}

/**
 * Initialize the entire cache by scanning every subfolder of `_imgPath`
 */
async function initCache(imageDir = '../../GENERATIONS/images') {
    _cache = {}; // reset

    _imgPath = imageDir;
    const imgPath = path.join(__dirname, imageDir);
    ensureDirectoryExists(imgPath);

    const items = fs.readdirSync(imgPath, { withFileTypes: true });
    // subfolders only (skip files)

    const subfolders = items.filter((dirent) => dirent.isDirectory()).map((d) => d.name);

    if (subfolders.length !== 0) {
        subfolders.forEach((folderName) => {
            const folderAbsolutePath = path.join(_imgPath, folderName);
            const images = scanFolderForImages(folderAbsolutePath);

            if (images.length) {
                _cache[folderName] = images;
                _totalFiles += images.length;
            }
        });
    } else if (items.length) {
        //youtube...

        _totalFiles = items.length;
        _cache[imageDir]=items;
    }


}
/**
 * (Optional) Refresh entire cache if you expect many changes and
 * want to keep the directory listing up-to-date.
 */
function refreshCache() {
    if (!_imgPath) {
        throw new Error("refreshCache() called before initCache()!");
    }
    initCache(_imgPath);
}

/**
 * Retrieve the entire cache
 */
function getCache() {
    return _cache;
}

/**
 * Retrieve array of file metadata for a given folderName
 */
function getFolder(folderName) {
    return _cache[folderName] || [];
}

/**
 * Add a single file (e.g., "myImage.png") in a given folderName
 * to the in-memory _cache. Assumes the file already exists on disk.
 *
 * @param {string} folderName - e.g. "v-1__bak"
 * @param {string} fileName   - e.g. "myImage.png"
 */


function addFile(folderName, fileName) {
    if (!_imgPath) {
        throw new Error("addFile() called before initCache()!");
    }

    const folderAbsolutePath = path.join(_imgPath, folderName);
    const fileAbsolutePath = path.join(folderAbsolutePath, fileName);

    // Verify the file actually exists and is .png
    if (!fs.existsSync(fileAbsolutePath)) {
        console.warn(`addFile: File does not exist: ${fileAbsolutePath}`);
        return;
    }
    /* if (!fileName.toLowerCase().endsWith(".png")) {
         console.warn(`addFile: Not a PNG, skipping: ${fileName}`);
         return;
     }*/

    const stats = fs.lstatSync(fileAbsolutePath);
    if (!stats.isFile()) {
        console.warn(`addFile: Path is not a file, skipping: ${fileAbsolutePath}`);
        return;
    }

    // Make sure the folder is in _cache
    if (!_cache[folderName]) {
        _cache[folderName] = [];
    }

    // Remove any existing entry for fileName, in case we are overwriting
    _cache[folderName] = _cache[folderName].filter((item) => item.file !== fileName);

    // Insert the new metadata object
    _cache[folderName].push({
        file: fileName,
        ext: path.extname(fileName),
        fullPath: fileAbsolutePath,
        url: fullPath.split(imageDir)[1],
        mtime: stats.mtime,
        jsonPath: fileAbsolutePath.replace(".png", ".json"),
    });

    _totalFiles++;
    console.log(`addFile: Added "${fileName}" to folder "${folderName}" in _cache.`);
}


function shiftFile(folderName) {
    if (!_imgPath) {
        throw new Error("addFile() called before initCache()!");
    }

    const folderAbsolutePath = path.join(_imgPath, folderName);


    // Make sure the folder is in _cache
    if (!_cache[folderName]) {
        _cache[folderName] = [];
    }


    const item = _cache[folderName].shift();

    console.log(`addFile: shifted  "${item}"`);
    _totalFiles--;
    return item
    console.log(`addFile: Added "${fileName}" to folder "${folderName}" in _cache.`);
}

// Export the store API
module.exports = {
    initCache,
    refreshCache,
    getCache,
    getFolder,
    addFile,
    shiftFile,
    imgPath: _imgPath,
    totalFiles: () => _totalFiles,
};