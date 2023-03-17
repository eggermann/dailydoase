let model = null;

module.exports = {
    setVersion: (name) => {
        switch (name) {
            case 'huggin':
                model = require("./post-to-huggin");
                break;
            case 'webUi':
                model = require("./post-to-webUi.js");
                break;
        }

        return model;
    }
}