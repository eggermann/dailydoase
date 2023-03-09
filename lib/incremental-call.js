const fs = require("fs-extra");

const IncrementClientCall = class {
    constructor(filePath) {
        this.filePath=filePath;
    }

    async increment() {
        return new Promise((resolve, reject) => {

            const fPath =        this.filePath ;//'./exemplar-cntr.txt'
            fs.writeFile(fPath, '1', {flag: 'wx'}, function (err) {
                if (err) {
                    fs.readFile(fPath, 'utf-8', function (err, data) {
                        if (data) {
                            let dataInt = (parseInt(data));
                            dataInt++;
                            resolve(dataInt);

                            fs.writeFile(fPath, dataInt + ' ', function (err) {
                            })
                        }
                    });
                } else {
                    console.log("It's saved!",this.fileName);
                }
            })
        });
    };


};


module.exports = IncrementClientCall;