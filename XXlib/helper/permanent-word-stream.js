const _ = {
    actFilm: (() => {
        let actFilm = null;

        try {
            actFilm = require(__dirname + '/actFilm.json');
        } catch (e) {
            actFilm = {};
        }

        return actFilm;
    })(),


}
module.exports = {};