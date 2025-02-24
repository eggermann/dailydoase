//import getSortedFiles from '../utils/file-utils.js';
const express = require("express");
const path = require("path");
const fs = require('fs').promises;
const Handlebars = require("handlebars");
const bodyParser = require("body-parser");
const store = require("../store.cjs");

const storeFunction = ('./store-function.cjs');
const cors = require("cors");
const app = express();
app.use(cors());

const _ = require("./functions.cjs");

const router = express.Router();
const baseUrl = "https://dailydoase.de";
const port = 4000;
const __ = { dailymotionCnt: 0, youtubeCnt: 0, maxJsonFiles: 20 };


async function ensureDirectoryExists(folderPath) {
    try {
        await fs.mkdir(folderPath, { recursive: true }); // Creates the folder if it doesn't exist
    } catch (err) {
        console.error(`Error ensuring folder exists: ${folderPath}`, err);
    }
}

/*
app.get("/debug-cache", (req, res) => {
    const data = store.getCache();
    res.json(data);
});*/

const routes = [
    {
        "/youtube": async function (req, res) {
            // Resolve the folder path dynamically
         //   await __.getNext(); // External function call (assuming it updates some state)

            const folderPath = this.imageDir || '../../GENERATIONS/youtube'
            const file = store.shiftFile(folderPath);


            // Send the file to the client
            const filePath = path.join (file.parentPath,file.name)
            console.log('filePath--',filePath)

            return res.download(filePath , (err) => {
                if (err) {
                    console.error("Error sending file:", err);
                    return res.status(500).send("Internal Server Error");
                }
            });
            /*
                        } catch (error) {
                            console.error("Error in /youtube route:", error);
                            return res.status(500).send(error.message); // Send the error message for debugging
                        }*/
        }
    },
    {
        "/dailymotion": async (req, res) => {
            const folderPath = path.join(__dirname, "../../dailymotion");
            _.ensureDirectoryExists(folderPath);
            fs.readdir(folderPath, (err, files) => {
                if (err) {
                    console.error("Error reading folder:", err);
                    return res.status(500).send("Internal Server Error");
                }
                const fileStats = files
                    .map((file) => {
                        const filePath = path.join(folderPath, file);
                        let stats = null;
                        try {
                            stats = fs.statSync(filePath);
                        } catch (e) {
                        }
                        return { file, stats };
                    })
                    .filter((item) => item.stats && item.stats.isFile());
                fileStats.sort((a, b) => b.stats.mtime - a.stats.mtime);
                if (fileStats.length > __.maxJsonFiles) {
                    const delta = fileStats.length - __.maxJsonFiles;
                    for (let i = 0; i <= delta; i++) {
                        const jsonFilm = fileStats.pop();
                        const deleteFile = folderPath + "/" + jsonFilm.file;
                        console.log(deleteFile);
                        fs.unlinkSync(deleteFile);
                        console.log("gelöscht: ", deleteFile);
                    }
                } else {
                    __.getNext();
                }
                if (fileStats.length === 0) {
                    return res.status(404).send("No files found in the folder");
                }
                const pos = fileStats.length - 1 - ((__.dailymotionCnt++) % fileStats.length);
                const actFile = fileStats[pos].file;
                const filePath = path.join(folderPath, actFile);
                res.download(filePath, (err) => {
                    if (err) {
                        console.error("Error sending file:", err);
                        return res.status(500).send("Internal Server Error");
                    }
                });
            });
        },
    },
    {
        "/rnd": async (req, res) => {
            const absolutPath = storeFunction.getRandomItem();


            const image = await fs.promises.readFile(absolutPath, { encoding: "base64" });
            const img = Buffer.from(image, "base64");
            res.writeHead(200, {
                "Content-Type": "image/png",
                "Content-Length": img.length,
            });
            res.end(img);
        },
    },
    {
        "/": (req, res) => {
            res.set("content-type", "text/html");
            const menu = _.createMenu();
            const template = _.getHomeTemplate();
            const data = { menu, isHome: true };
            const result = "<!DOCTYPE html> " + template(data);
            res.send(result);
        },
    },
    {
        "/img": async (req, res) => {
            const data = await storeFunction.mostRecentFileOrFolder();
            if (false && data.json == (_.oldDatas && _.oldDatas.json)) {
                const dataHistorical = await _.mostRecentFileOrFolder(_.cnt++);
                res.json(dataHistorical);
            } else {
                _.oldDatas = data;
                res.json(data);
            }
        },
    },
    {
        "/daily-doasis": (req, res) => {
            res.redirect("https://dailydoase.de/");
        },
    },
    {
        "/v/:version/": (req, res) => {
            const indexHtml = fs.readFile(path.join(__dirname, "../web/dist/index-template.hbs"), "utf-8");
            const template = Handlebars.compile(indexHtml);
            const actFolderName = req.params.version;
            if (actFolderName === "newest") {
            }
            const autoplay = req.query.autoplay != null ? 1 : 0;
            const menu = _.createMenu(path.join(__dirname, "./../../images"), actFolderName);
            let images = store.getAllFilesFromFolderForImages("/" + actFolderName);
            let infoJson = images[0].json;

            if (req.query.sort == "desc") {
                images = images.reverse();
            }

            const data = { menu, images, pageClass: "folder", autoplay, infoJson };
            if (typeof req.query.frame == "string") {
                data.frame = true;
            }
            const result = "<!DOCTYPE html> " + template(data);
            res.send(result);
        },
    },
    {
        "/v/:version/:img/": async (req, res) => {
            const url = "/" + req.params.version + "/" + req.params.img;
            const suffix = path.parse(req.params.img).ext;
            if (suffix == ".json") {
                const json = storeFunction.getJSON(url);
                const imageUrl = "/v" + url.replace(".json", ".png");
                const wordsSentence = json.words.map((i) => i[0]).join("-");
                const nftMeta = {
                    name: wordsSentence,
                    description: json.prompt,
                    image: baseUrl + imageUrl,
                };
                res.json(nftMeta);
                return;
            }
            const images = await storeFunction.getFile("/" + req.params.version + "/" + req.params.img);
            const img = Buffer.from(images, "base64");
            res.writeHead(200, {
                "Content-Type": "image/png",
                "Content-Length": img.length,
            });
            res.end(img);
        },
    },
    {
        "/v/:version/:img/img": async (req, res) => {
            const images = await _.getFile("/" + req.params.version + "/" + req.params.img);
            const img = Buffer.from(images, "base64");
            res.writeHead(200, {
                "Content-Type": "image/png",
                "Content-Length": img.length,
            });
            res.end(img);
        },
    },
];

module.exports.init = (getNext = () => {
}, model = { hello: 'wol' }) => {


    app.use(express.static(path.join(__dirname, "../web/dist")));
    __.getNext = getNext;
    _.registerPartials(path.join(__dirname, "./partials"));

    routes.forEach((r) => {
        const route = Object.keys(r)[0];
        const meth = r[route].bind(model); // Bind the route handler to the model
        router.get(route, meth);
    });

    app.use("", router);
    app.listen(port, "0.0.0.0", () => {
        console.log(`http://0.0.0.0:${port}/`);
    });
};
