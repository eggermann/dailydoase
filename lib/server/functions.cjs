const path = require("path");
const fs = require("fs");
const routes = require("./index.cjs");
const handlebars = require("handlebars");

const { isValidPartial, isOnServer } = require("./helpers.cjs");


const store = require("../store.cjs");
const imgPath = store.imgPath;
// Initialize the file-path cache at startup
// Using the same imgPath as in functions.cjs


const partialsFolder = path.join(__dirname, "../web/partials");

fs.readdirSync(partialsFolder)
    .filter(isValidPartial)
    .forEach(partial => {
        const ext = path.extname(partial);

        const fileFullPath = path.join(partialsFolder, partial)
        const data = fs.readFileSync(fileFullPath, 'utf-8')

        // Store as `"filename without extension": content`.
        handlebars.registerPartial(path.basename(partial, ext), data);
  })

// Register Handlebars helpers
handlebars.registerHelper('eq', function(a, b) {
    return a === b;
});
/**
 * Register a Handlebars partial by name and filename.
 * @param {string} partialName - The name to register the partial as.
 * @param {string} fileName - The .hbs file name (relative to ../web/).
 */

const _ = {
    getImageTemplate() {

        let indexHtml = fs.readFileSync(path.join(__dirname, './../web/dist/index-template.hbs'), 'utf-8');


        const homeTemplate = handlebars.compile(indexHtml);
        return homeTemplate;
    },
    getHomeTemplate: () => {
        
        
        let indexHtml = fs.readFileSync(path.join(__dirname, './../web/dist/index-template.hbs'), 'utf-8');
    
        const homeTemplate = handlebars.compile(indexHtml);
        return homeTemplate;
    },

    /**
     * Create a "menu" of subfolders from the store
     */
    createMenu(dir, actFolderName = "/") {
        // Get cache or initialize it if not present
        const cache = store.getCache() || {};
        const allFolders = Object.keys(cache);

        // map them to your menu structure
        let menu = allFolders.map((folder) => {
            // each folder has array of images in store
            const fileCnt = store.getFolder(folder).length;
            const current = actFolderName === folder;
            
            // build src (same as href)
            let src = "/v/" + folder;
            if (isOnServer()) {
                // if you have some special prefix on your server, handle it here
                // e.g.: src = "/daily-doasis" + src;
            }
            
            return {
                src,            // Use src instead of href
                href: src,      // Keep href for backward compatibility
                name: folder,
                fileCnt,
                current
            };
        });

        // add home link at top
        let homePath = "/";
        if (isOnServer()) {
            // homePath = "/daily-doasis"; // if needed
        }

        // only include folders with at least 1 file
        menu = menu.filter((i) => i.fileCnt >= 1);

        // reverse order to show newest first if there are items
        if (menu.length > 0) {
            menu = menu.reverse();
        }

        // prepend 'Home'
        menu = [{
            src: homePath,
            href: homePath,
            name: "Home",
            current: actFolderName == "/"
        }].concat(menu);

        return menu;
    },
    oldDatas: null,
    webRootPath: '/',
    cnt: 0
}

module.exports = _;
module.exports.handlebars = handlebars;