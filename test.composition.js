const words = [['medicine', 'en']];
const model = 'huggin'
import('./start.js').then(module =>
    module.default({words, model}));
