const store = require('../store.cjs');
const path = require('path')




const saveItemPath = path.resolve(__dirname, '../../GENERATIONS/');

(async () => {


    await store.initCache('images');//'../../GENERATIONS/images'
    console.log('saveItemPath',saveItemPath)

    const getNext = () => {
    }

    const model = {
        saveItemPath
    }

    require('./index.cjs').init(getNext, model);

})()
