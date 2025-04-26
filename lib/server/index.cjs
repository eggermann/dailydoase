const express = require("express");
const path = require("path");
const fsPromises = require("fs").promises;
const fs = require("fs");
const Handlebars = require("handlebars");
const bodyParser = require("body-parser");
const cors = require("cors");
const store = require("../store.cjs");
const storeFunction = require("../store-function.cjs");
const _ = require("./functions.cjs");

const app = express();
const router = express.Router();

// Register Handlebars partials
const imagePartialPath = path.join(__dirname, "../web/image.hbs");
const imagePartial = fs.readFileSync(imagePartialPath, 'utf8');
Handlebars.registerPartial('image', imagePartial);

const baseUrl = "https://dailydoase.de";
const port = 4000;
const defaultMenuPath = path.join(__dirname, "../../GENERATIONS");

const __ = {dailymotionCnt: 0, youtubeCnt: 0, maxJsonFiles: 20};

app.use(cors());

/**
 * API Routes
 */
const routes = {
    "/youtube": async function(req, res) {
        const firstItem = await store.shiftFile(this.saveItemPath);
        return sendFile(res, firstItem);
    },
    
    "/dailymotion": function(req, res) {
        sendFile(res, req.app.locals.imageDir || "../../GENERATIONS/dailymotion");
    },
    
    "/rnd": async function(req, res) {
        try {
            const result = await storeFunction.getRandomItem();
            res.writeHead(200, {
                "Content-Type": "image/png",
                "Content-Length": Buffer.from(result.imageBase64.split(',')[1], 'base64').length
            });
            res.end(Buffer.from(result.imageBase64.split(',')[1], 'base64'));
        } catch (error) {
            res.status(500).send("Error fetching random image");
        }
    },
    
    "/": async (req, res) => {
        res.set("content-type", "text/html");
        // Get latest generation for home
        try {
            const menu = _.createMenu(defaultMenuPath);
            const latestImage = await storeFunction.newestFile();
            console.log('Latest image:', latestImage);
            
            const data = {
                menu,
                isHome: true,
                images: latestImage ? [latestImage] : undefined
            };
            res.send("<!DOCTYPE html> " + _.getHomeTemplate()(data));
        } catch (error) {
            console.error("Error getting home data:", error);
            const data = {menu: _.createMenu(defaultMenuPath), isHome: true};
            res.send("<!DOCTYPE html> " + _.getHomeTemplate()(data));
        }
    },
    
    "/img": async (req, res) => {
        const data = await storeFunction.newestFile();
        res.json(data);
    },
    
    "/daily-doasis": (req, res) => res.redirect("https://dailydoase.de/"),

    "/:model/:folderName/": async (req, res) => {
        try {
            const indexHtml = fs.readFileSync(path.join(__dirname, "../web/dist/index-template.hbs"), "utf-8");
            const template = Handlebars.compile(indexHtml);

            const actFolderName = path.join(req.params.folderName);
            const autoplay = req.query.autoplay ? 1 : 0;
            
            // Get images for folder
            const images = await storeFunction.getAllFilesFromFolderForImages(actFolderName);
      
            
            if (req.query.sort === "desc") {
                images.reverse();
            }
            
            const data = {
                menu: _.createMenu(defaultMenuPath, req.params.folderName),
                images,
                pageClass: "folder",
                autoplay,
                infoJson: images[0]?.json || {},
                frame: req.query.frame ? true : undefined,
            };

            res.send("<!DOCTYPE html> " + template(data));
        } catch (error) {
            console.error("Error handling folder request:", error);
            res.status(500).send("Internal Server Error");
        }
    },

    "/:model/:folderName/:file": async (req, res) => {
       // console.log("Request for file:", req.params.file);
        try {
            const generation = await storeFunction.getFile(req.params.folderName, req.params.file);
            
            if (path.extname(req.params.file) === ".json") {
                res.json({
                    name: generation.json.words?.map(i => i[0]).join("-") || "",
                    description: generation.json.prompt,
                    image: `${baseUrl}/v${generation.src}`
                });
            } else {
                const img = Buffer.from(generation.imageBase64.split(',')[1], 'base64');
                res.writeHead(200, {"Content-Type": "image/png", "Content-Length": img.length});
                res.end(img);
            }
        } catch (error) {
            console.error("Error handling file request:", error);
            res.status(500).send("Internal Server Error");
        }
    }
};

// Helper function to send files
async function sendFile(res, file) {
    try {
        let filePath = file.fullPath;
        if (!filePath) {
            filePath = path.join(file.parentPath, file.name);
        }

        res.download(filePath, (err) => {
            if (err) {
                console.error("Error sending file:", err);
                res.status(500).send("Internal Server Error while sending");
            }
        });
    } catch (error) {
        console.error("Error processing request:", error);
        res.status(500).send("Internal Server Error");
    }
}

/**
 * Initialize the application
 */
module.exports.init = (getNext = () => {}, config = {hello: "default"}) => {
    app.use(express.static(path.join(__dirname, "../web/dist")));
    __.getNext = getNext;

    // Bind and set up all routes
    Object.entries(routes).forEach(([route, handler]) => router.get(route, handler.bind(config)));

    app.use("", router);
    app.listen(port, "0.0.0.0", () => console.log(`Server running at http://0.0.0.0:${port}/`));
};