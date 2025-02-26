const store = require('../store.cjs');
const path = require('path')


const saveItemPath = path.resolve(__dirname, '../../GENERATIONS/youtube');

(async () => {

    await store.initCache(saveItemPath);//'../../GENERATIONS/youtube'
    console.log('saveItemPath',saveItemPath)

    const getNext = () => {
    }

    const model = {
        saveItemPath
    }

    require('./index.cjs').init(getNext, model);

})()
