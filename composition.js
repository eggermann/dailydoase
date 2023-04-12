/*const words = [['erotic', 'en'], ['pop', 'en'], ['animals', 'en']];//, elephant'photographie', 'phyloosivie',esoteric
const _staticPrompt = ',UHD ';//, elephant'photographie', 'phyloosivie',esoteric
const _options = ;//, elephant'photographie', 'phyloosivie',esoteric

https://stable-diffusion-art.com/prompt-guide/
*/

//----> hosting https://www.ni-sp.com/how-to-run-stable-diffusion-on-your-own-cloud-gpu-server/

const compo = {
    //promptFunktion:(streams, options)=>{},
    //circularLinksGetNext:()=>{
    //this is the cirular context },
    folderVersionString: 'v2',// v-{cnt}-{folderVersionString} bear beer
    words: [['Mysticism', 'en'], ['Naturalness', 'en'], ['Medicine', 'en'], ['Wuxing_(Chinese_philosophy)', 'en']],
    randomImageOrientations: ['spot on ', ' background '],
   /// staticPrompt: ', 4k, UHD',
    stableDiffusionOptions: {
        width: 512,
        height: 512,
        steps: 10
    }
};

require('./start')(compo);
