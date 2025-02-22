/*const words = [['erotic', 'en'], ['pop', 'en'], ['animals', 'en']];//, elephant'photographie', 'phyloosivie',esoteric
const _staticPrompt = ',UHD ';//, elephant'photographie', 'phyloosivie',esoteric
const _options = ;//, elephant'photographie', 'phyloosivie',esoteric

https://stable-diffusion-art.com/prompt-guide/
*/

//----> hosting https://www.ni-sp.com/how-to-run-stable-diffusion-on-your-own-cloud-gpu-server/
//https://gist.github.com/thesephist/376afed2cbfce35d4b37d985abe6d0a1


import pkg from './modulePolyfill.js';

const {require, __dirname} = pkg;

//const st = require('./lib/get-from-stable-diffusion/trash/options.oak.json')

const allStatics = [];
/*for (let i in st) {
    st[i].forEach(line => {
        // console.log(line)
        if (line.indexOf('XX') != -1) {
            return;
        }
        const arrs = line.split(',');
        allStatics.push(arrs)
    })

}
*/

const compo = {
    //  words: [[':YP', 'en']],['War', 'en'],
    // words: [['Nature', 'en'] ,['Art', 'en'], ['Ocean', 'en'], ['Mensch', 'de']],
    //  words: [['War', 'en'],['Art', 'en'],['Landscape', 'en']],
//    words: [[':YP', 'en']],,['Postage_stamp', 'en']
    //words: [['Robotics', 'en'],[':NewsStream', {startWord: ''}],['Humanities', 'en']],
    words: [['Robotics', 'en']],

    //  words: [['Excellence', 'en'], ['Honesty', 'en'], ['Loyalty', 'en'], ['Passion', 'en'], ['Courage', 'en']],
// words: [[':NewsStream', {startWord: ''}]],

    //  ['Adolescence', 'en']  randomImageOrientations: [' background'],// allStatics,//,['spo-l,m t on ', ' background '],

    prompt: {
        staticPrompt: ' internet, raw style',//' , as clown ',//, as shadow puppets ',//as vegetable toys',//['Style', 'en'],
        prePrompt: 'on twitter ot instagram: ',
        negative_prompt: 'phone'
    },
    // randomImageOrientations: [' background', ' in the foreground '],
    // randomImageOrientations: [' background', ' spot on', ' together with ', ' act as '],
//    titts pixel  used stampeee
    // model: 'huggin',//'youtube',//'huggin',// 'webUi',//'midjourney',
    //modelUrl:'https://api-inference.huggingface.co/models/playgroundai/playground-v2.5-1024px-aesthetic',//https://api-inference.huggingface.co/models/ByteDance/SDXL-Lightning',
    //info: ' pinup pixel used stamp',

    model__HugginX: {
        url: 'https://api-inference.huggingface.co/models/black-forest-labs/FLUX.1-schnell',//stabilityai/stable-diffusion-xl-base-1.0',//'https://api-inference.huggingface.co/models/fal/AuraFlow',//https://api-inference.huggingface.co/models/ByteDance/SDXL-Lightning',
        scriptName: 'post-to-hugging.js',
    },

    model: {
        scriptName: 'post-to-youtube.js',
    }

};



process.on('warning', e => console.warn(e.stack));
import('./start.js').then(module => module.default(compo));
