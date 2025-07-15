const store = require('../store.cjs');
const path = require('path');

const saveItemPath ='/Volumes/deg-late-24/dailly-doase-filesave/dailydoase-images';//'/Users/eggermann/Projekte/dailydoase/tests/tests/GENERATIONS';
//'/Users/eggermann/Projekte/dailydoase/tests/tests/GENERATIONS';//'/Users/eggermann/Projekte/dailydoase/GENERATIONS';///Volumes/deg-late-24/dailly-doase-filesave/dailydoase-images';// '/Users/eggermann/Projekte/dailydoase/tests/GENERATIONS';//path.resolve(__dirname, '../../GENERATIONS');

(async () => {

    const result = store.initCache(saveItemPath);
    console.log('Store initialization completed');

    const getNext = () => {
        // Get next item logic here if needed
    }

    const model = {
        saveItemPath
    }

    require('./index.cjs').init(getNext, model);
})().catch(error => {
    console.error('Error during initialization:', error);
});
