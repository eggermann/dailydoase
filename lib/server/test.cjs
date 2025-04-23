const store = require('../store.cjs');
const path = require('path')




const saveItemPath = path.resolve(__dirname, '../../GENERATIONS/images');

(async () => {
    console.log('Starting initialization with path:', saveItemPath);
    const result = store.initCache(saveItemPath);
    console.log('Store initialization completed');

    const getNext = () => {
    }

    const model = {
        saveItemPath
    }

    require('./index.cjs').init(getNext, model);
})().catch(error => {
    console.error('Error during initialization:', error);
});
