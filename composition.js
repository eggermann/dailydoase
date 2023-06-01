/*const words = [['erotic', 'en'], ['pop', 'en'], ['animals', 'en']];//, elephant'photographie', 'phyloosivie',esoteric
const _staticPrompt = ',UHD ';//, elephant'photographie', 'phyloosivie',esoteric
const _options = ;//, elephant'photographie', 'phyloosivie',esoteric

https://stable-diffusion-art.com/prompt-guide/
*/

//----> hosting https://www.ni-sp.com/how-to-run-stable-diffusion-on-your-own-cloud-gpu-server/
//https://gist.github.com/thesephist/376afed2cbfce35d4b37d985abe6d0a1

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
    folderVersionString: 'v-',// v-{cnt}-{folderVersionString} bear beer
    //words: [['Daydream', 'en'], ['Food', 'en'], ['Commercial', 'en']],
    words: [['Style', 'en'],[':NewsStream', {startWord:''}],['Adolescence', 'en']],
 //  ['Adolescence', 'en']  randomImageOrientations: [' background'],// allStatics,//,['spo-l,m t on ', ' background '],
  //  staticPrompt: ', realistic image',
    randomImageOrientations: [' background',' foreground'],
    model: 'webUi',
    info: 'webUi, stable mit news',
    stableDiffusionOptions: {
        steps: 12,//only webui
        // width: 1280,
        // height: 720,
        /* self_attention:'yes',
       upscale:'yes'*/
    }
};

require('./start')(compo);
