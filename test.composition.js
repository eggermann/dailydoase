const words = [['medicine', 'en'],['wildlife', 'en']];
const scriptName = 'post-to-hugging.js'
import('./start.js').then(module =>
    module.default({words, model:{
            scriptName
        }}));
