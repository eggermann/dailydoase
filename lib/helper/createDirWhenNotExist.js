const fs = require("fs-extra");

module.exports=(dir, recursive = true) =>{

    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, {recursive});
        return true
    }
}