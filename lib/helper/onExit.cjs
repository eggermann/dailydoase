const path = require('path');
const fs = require('fs');


const folderName = 'XXX_crashed-file';

const _ = {
    dir: path.join(__dirname, folderName),
    saveCircularLinks(cL) {
        if (Object.keys(cL.links).length) {
            const obj = {
                links: cL.links,
                usedLinks: cL.usedLinks
            }

            const serialised = JSON.stringify(obj);
            try {
                const p = path.join(_.dir, cL.startWord + '.json')
                fs.writeFileSync(p, serialised, 'utf-8');

            } catch (err) {
                console.log(err)
            }
        }
    },
    exitHandler(options, exitCode) {
        _.streams.forEach(i => {
            _.saveCircularLinks(i.circularLinks);
        });

        if (options.cleanup) console.log('clean');
        if (exitCode || exitCode === 0) console.log('exitCode----->', exitCode);  /* */

        if (options.exit) {
            console.log('exit::: ', options)
            process.exit();
        }
    }
}
module.exports = (streams) => {
    _.streams = streams;
    process.stdin.resume();//so the program will not close instantly

    console.log('+++++++++++++')
//do something when app is closing
    //  process.on('exit', _.exitHandler.bind(null, {cleanup: true}));
//catches ctrl+c event
    process.on('SIGINT', _.exitHandler.bind(null, {exit: true}));

// catches "kill pid" (for example: nodemon restart)
    process.on('SIGUSR1', _.exitHandler.bind(null, {exit: true}));
    process.on('SIGUSR2', _.exitHandler.bind(null, {exit: true}));

//catches uncaught exceptions
    process.on('uncaughtException', _.exitHandler.bind(null, {exit: true}));

    try {
        //try make dir, when exist load datas
        fs.mkdirSync(_.dir);
    } catch (err) {
        //load vars
        try {
            streams.map(async s => {
                await s.circularLinks.loadFromCrash(_.dir);
            })
        } catch (e) {
        }
//        fs.rmdirSync(dir, {recursive: true});
    }
}
