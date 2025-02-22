const words = [['wildlife', 'en']];
const scriptName = 'post-to-youtube.js'
import('./start.js').then(module =>
    module.default({words, model:{
            scriptName
        }}));
