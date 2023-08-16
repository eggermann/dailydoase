import fs from 'fs-extra'
import {fileURLToPath} from "url";
import path from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const IncrementClientCall = class {
    constructor(filePath) {

        this.filePath =filePath;
        this.int = 0;

        try {
            const data = fs.readFileSync(this.filePath, 'utf-8');
            if (data) {
                let dataInt = (parseInt(data));
                this.int = dataInt;
            }
            ;
        } catch (err) {

            //  console.log(err)
        }
    }

    async increment(int = 1) {
        return new Promise((resolve, reject) => {

            fs.writeFile(this.filePath, '1', {flag: 'wx'}, (err) => {

                if (err) {//exist
                    fs.readFile(this.filePath, 'utf-8', (err2, data) => {

                        if (data) {

                            let dataInt = (parseInt(data));
                            dataInt += int;
                            this.int = dataInt;
                            resolve(dataInt);

                            fs.writeFile(this.filePath, dataInt + ' ', function (err) {
                            })
                        }
                    });
                } else {
                    console.log("It's saved!", this.filePath);
                    resolve(1);
                }
            })
        });
    };
};


export default IncrementClientCall;