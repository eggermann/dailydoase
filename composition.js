/*const words = [['erotic', 'en'], ['pop', 'en'], ['animals', 'en']];//, elephant'photographie', 'phyloosivie',esoteric
const _staticPrompt = ',UHD ';//, elephant'photographie', 'phyloosivie',esoteric
const _options = ;//, elephant'photographie', 'phyloosivie',esoteric

https://stable-diffusion-art.com/prompt-guide/
*/

//----> hosting https://www.ni-sp.com/how-to-run-stable-diffusion-on-your-own-cloud-gpu-server/
//https://gist.github.com/thesephist/376afed2cbfce35d4b37d985abe6d0a1


import pkg from './modulePolyfill.js';

const {require, __dirname} = pkg;

const st = require('./lib/get-from-stable-diffusion/options.oak.json')

const allStatics = [];
for (let i in st) {
    st[i].forEach(line => {
        // console.log(line)
        if (line.indexOf('XX') != -1) {
            return;
        }
        const arrs = line.split(',');
        allStatics.push(arrs)
    })

}


const compo = {
    //promptFunktion:(streams, options)=>{},
    //circularLinksGetNext:()=>{
    //this is the cirular context },

    folderVersionString: 'stamp',// v-{cnt}-{folderVersionString} bear beer
    //  words: [[':YP', 'en']],['War', 'en'],
    words: [['anatomy', 'en'], ['war', 'en'], ['life style', 'en']],
    //  words: [['War', 'en'],['Art', 'en'],['Landscape', 'en']],
//    words: [[':YP', 'en']],,['Postage_stamp', 'en']
    //words: [['Robotics', 'en'],[':NewsStream', {startWord: ''}],['Humanities', 'en']],

    //  words: [['Excellence', 'en'], ['Honesty', 'en'], ['Loyalty', 'en'], ['Passion', 'en'], ['Courage', 'en']],
    //words: [[':NewsStream', {startWord: ''}]],

    //  ['Adolescence', 'en']  randomImageOrientations: [' background'],// allStatics,//,['spo-l,m t on ', ' background '],
    staticPrompt: ' (value), high quality used stamp',//['Style', 'en'],
    // randomImageOrientations: [' background', ' in the foreground '],
    // randomImageOrientations: [' background', ' spot on', ' together with ', ' act as '],
//    titts pixel  used stamp
    model: 'webUi',//'midjourney',//'webUi',//'huggin',// 'webUi',//'midjourney',
    info: ' pinup pixel used stamp',
    "negative_prompt": ' (deformed iris, deformed pupils, semi-realistic, cgi, 3d, render, sketch, cartoon, drawing, anime:1.4), text, close up, cropped, out of frame, worst quality, low quality, jpeg artifacts, ugly, duplicate, morbid, mutilated, extra fingers, mutated hands, poorly drawn hands, poorly drawn face, mutation, deformed, blurry, dehydrated, bad anatomy, bad proportions, extra limbs, cloned face, disfigured, gross proportions, malformed limbs, missing arms, missing legs, extra arms, extra legs, fused fingers, too many fingers, long neck'
,
    stableDiffusionOptions: {
        //  "sampler_name": "Heun",
        "restore_faces": true,
        steps: 24,//only webui
       // width: 320,
       // height: 208,
        /* self_attention:'yes',
       upscale:'yes'*/
    }
};
process.on('warning', e => console.warn(e.stack));
import('./start.js').then(module => module.default(compo));
