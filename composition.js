/*const words = [['erotic', 'en'], ['pop', 'en'], ['animals', 'en']];//, elephant'photographie', 'phyloosivie',esoteric
const _staticPrompt = ',UHD ';//, elephant'photographie', 'phyloosivie',esoteric
const _options = ;//, elephant'photographie', 'phyloosivie',esoteric

https://stable-diffusion-art.com/prompt-guide/
*/

//----> hosting https://www.ni-sp.com/how-to-run-stable-diffusion-on-your-own-cloud-gpu-server/
//https://gist.github.com/thesephist/376afed2cbfce35d4b37d985abe6d0a1
import pkg  from './modulePolyfill.js';
const {require,__dirname} = pkg;

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
    folderVersionString: 'v-SG161222-frRedlich',// v-{cnt}-{folderVersionString} bear beer
    words: [['Excellence', 'en'], ['Honesty', 'en'], ['Loyalty', 'en'], ['Passion', 'en'], ['Courage', 'en']],
    //words: [['Robotics', 'en'],[':NewsStream', {startWord: ''}],['Humanities', 'en']],
    //words: [[':NewsStream', {startWord: ''}]],

    //  ['Adolescence', 'en']  randomImageOrientations: [' background'],// allStatics,//,['spo-l,m t on ', ' background '],
    staticPrompt: '',//['Style', 'en'],
    randomImageOrientations: [' background', ' in the foreground '],
    model: 'midjourney',
    info: 'midjourney, fr stable mit news,SG161222/Realistic_Vision_V1.4',
    stableDiffusionOptions: {
        // "sampler_name": "Heun",
        "restore_faces": true,
        steps: 14,//only webui
        // width: 1280,
        // height: 720,
        /* self_attention:'yes',
       upscale:'yes'*/
    }
};
process.on('warning', e => console.warn(e.stack));
import('./start.js').then(module=>module.default(compo));
