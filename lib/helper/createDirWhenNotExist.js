import fs from 'fs-extra';

export default(dir, recursive = true) =>{

    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, {recursive});
        return true
    }
}