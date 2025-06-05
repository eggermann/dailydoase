import fs from 'fs';

const IncrementClientCall = class {
    constructor(filePath) {

        this.filePath = filePath;
        this.int = 0;

        try {
            const data = fs.readFileSync(this.filePath, 'utf-8');
            if (data) {
                let dataInt = (parseInt(data));
                this.int = dataInt;
            }
        } catch (e) {
            console.log('no file yet', this.filePath)
        }
    }

    async increment(int = 1) {
        console.log(this.filePath)
        return new Promise((resolve, reject) => {
            fs.writeFile(this.filePath, '1', {flag: 'wx'}, (err) => {
                if (err) {//exist

                    fs.readFile(this.filePath, 'utf-8', (err2, data) => {
                        if (data) {
                            let dataInt = (parseInt(data));
                            dataInt += int;
                            fs.writeFile(this.filePath, dataInt.toString(), (err3) => {
                                if (err3) {
                                    reject(err3)
                                }
                                this.int = dataInt;
                                resolve(dataInt);
                            });
                        }
                    });
                } else {
                    this.int = 1;
                    resolve(1);
                }
            });
        });
    }
}

export default IncrementClientCall;
