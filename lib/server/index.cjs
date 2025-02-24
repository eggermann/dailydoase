// Import dependencies
const express = require("express");
const path = require("path");
const fs = require("fs").promises;
const Handlebars = require("handlebars");
const bodyParser = require("body-parser");
const cors = require("cors");
const store = require("../store.cjs");
const storeFunction = require("../store-function.cjs");
const _ = require("./functions.cjs");

const app = express();
const router = express.Router();

const baseUrl = "https://dailydoase.de";
const port = 4000;
const __ = { dailymotionCnt: 0, youtubeCnt: 0, maxJsonFiles: 20 };

app.use(cors());

/**
 * Ensures the specified directory exists, creating it if necessary.
 */
async function ensureDirectoryExists(folderPath) {
    try {
        await fs.mkdir(folderPath, { recursive: true });
    } catch (err) {
        console.error(`Error ensuring folder exists: ${folderPath}`, err);
    }
}

/**
 * Generic function to handle file downloads.
 */
async function sendFile(res, folderPath) {
    try {
        const file = store.shiftFile(folderPath);
        if (!file) return res.status(404).send("No files available");

        const filePath = path.join(file.parentPath, file.name);
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
 * API Routes
 */
const routes = {
    "/youtube": (req, res) => sendFile(res, req.app.locals.imageDir || "../../GENERATIONS/youtube"),
    "/dailymotion": (req, res) => sendFile(res, req.app.locals.imageDir || "../../GENERATIONS/dailymotion"),
    "/rnd": async (req, res) => {
        try {
            const absolutPath = storeFunction.getRandomItem();
            const image = await fs.readFile(absolutPath, { encoding: "base64" });
            const img = Buffer.from(image, "base64");
            res.writeHead(200, { "Content-Type": "image/png", "Content-Length": img.length });
            res.end(img);
        } catch (error) {
            res.status(500).send("Error fetching random image");
        }
    },
    "/": (req, res) => {
        res.set("content-type", "text/html");
        const data = { menu: _.createMenu(), isHome: true };
        res.send("<!DOCTYPE html> " + _.getHomeTemplate()(data));
    },
    "/img": async (req, res) => {
        const data = await storeFunction.mostRecentFileOrFolder();
        res.json(data);
    },
    "/daily-doasis": (req, res) => res.redirect("https://dailydoase.de/"),
    "/v/:version/": async (req, res) => {
        const indexHtml = await fs.readFile(path.join(__dirname, "../web/dist/index-template.hbs"), "utf-8");
        const template = Handlebars.compile(indexHtml);
        const actFolderName = req.params.version;
        const autoplay = req.query.autoplay ? 1 : 0;
        let images = storeFunction.getAllFilesFromFolderForImages("/" + actFolderName);



        if (req.query.sort === "desc") images.reverse();
        const data = {
            menu: _.createMenu(path.join(__dirname, "../../images"), actFolderName),
            images,
            pageClass: "folder",
            autoplay,
            infoJson: images[0]?.json || {},
            frame: req.query.frame ? true : undefined,
        };
        res.send("<!DOCTYPE html> " + template(data));
    },
    "/v/:version/:img/": async (req, res) => {
        const url = `/${req.params.version}/${req.params.img}`;
        const suffix = path.extname(req.params.img);
        if (suffix === ".json") {
            const json = storeFunction.getJSON(url);
            res.json({
                name: json.words.map((i) => i[0]).join("-"),
                description: json.prompt,
                image: `${baseUrl}/v${url.replace(".json", ".png")}`,
            });
        } else {
            const images = await storeFunction.getFile(url);
            const img = Buffer.from(images, "base64");
            res.writeHead(200, { "Content-Type": "image/png", "Content-Length": img.length });
            res.end(img);
        }
    },
    "/v/:version/:img/img": async (req, res) => {
        const images = await _.getFile(`/${req.params.version}/${req.params.img}`);
        const img = Buffer.from(images, "base64");
        res.writeHead(200, { "Content-Type": "image/png", "Content-Length": img.length });
        res.end(img);
    },
};

/**
 * Initialize the application
 */
module.exports.init = (getNext = () => {}, model = { hello: "wol" }) => {
    app.use(express.static(path.join(__dirname, "../web/dist")));
    __.getNext = getNext;
    _.registerPartials(path.join(__dirname, "./partials"));

    // Bind and set up all routes
    Object.entries(routes).forEach(([route, handler]) => router.get(route, handler.bind(model)));

    app.use("", router);
    app.listen(port, "0.0.0.0", () => console.log(`Server running at http://0.0.0.0:${port}/`));
};