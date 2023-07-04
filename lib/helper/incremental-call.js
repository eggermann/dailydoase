import fs from 'fs-extra'

const IncrementClientCall = class {
    constructor(filePath) {
        this.filePath = filePath;
        this.int = 0;

        try {
            const data = fs.readFileSync(filePath, 'utf-8');
            if (data) {
                let dataInt = (parseInt(data));
                this.int = dataInt;
            };
        }catch (err){

            console.log(err)
        }

    }

    async increment(int = 1) {
        return new Promise((resolve, reject) => {

            const fPath = this.filePath;//'./exemplar-cntr.txt'
            fs.writeFile(fPath, '1', {flag: 'wx'}, function (err) {

                if (err) {
                    fs.readFile(fPath, 'utf-8', function (err2, data) {


                        if (data) {


                            let dataInt = (parseInt(data));
                            dataInt += int;
                            this.int = dataInt;
                            resolve(dataInt);

                            fs.writeFile(fPath, dataInt + ' ', function (err) {
                            })
                        }
                    });
                } else {
                    console.log("It's saved!", this.filePath);
                }
            })
        });
    };


};


export default IncrementClientCall;