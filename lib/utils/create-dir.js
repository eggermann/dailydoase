import fs from 'fs-extra';

const createDirWhenNotExist = (path) => {
    if (!fs.existsSync(path)) {
        fs.mkdirSync(path, {recursive: true});
        return true;
    }
    return false;
}

export default createDirWhenNotExist;
