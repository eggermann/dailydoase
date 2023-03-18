const wtf = require('wtf_wikipedia');


(async a => {


    const l =await wtf.fetch('mouse')
    console.log(l)
})()
