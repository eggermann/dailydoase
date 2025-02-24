const path = require("path");
const fs = require("fs");
const routes = require("./index.cjs");
const handlebars = require("handlebars");
const {isValidPartial, isOnServer} = require("./helpers.cjs");

const store = require("../store.cjs");
const imgPath = store.imgPath;
// Initialize the file-path cache at startup
// Using the same imgPath as in functions.cjs


// rest of your code ...
// e.g. app.use('/', routes);

// For demonstration, suppose you want to see your cache

const _ = {
    getImageTemplate() {

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
            return {href, name: folder, fileCnt, current};
        });

        // add home link at top
        let homeHref = "/";
        if (isOnServer()) {
            // homeHref = "/daily-doasis"; // if needed
        }

        // only include folders with at least 1 file
        menu = menu.filter((i) => i.fileCnt >= 1);

        // prepend 'Home'
        menu = [{href: homeHref, name: "Home", current: actFolderName == "/"}].concat(
            menu
        );

        return menu;
    },
    oldDatas: null,
    webRootPath: '/',
    cnt: 0
}

module.exports = _;