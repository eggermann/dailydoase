/*const words = [['erotic', 'en'], ['pop', 'en'], ['animals', 'en']];//, elephant'photographie', 'phyloosivie',esoteric
const _staticPrompt = ',UHD ';//, elephant'photographie', 'phyloosivie',esoteric
const _options = ;//, elephant'photographie', 'phyloosivie',esoteric

https://stable-diffusion-art.com/prompt-guide/
*/

const compo = {
    //promptFunktion:(streams, options)=>{},
    //circularLinksGetNext:()=>{
    //this is the cirular context },
    folderVersionString: 'v2',// v-{cnt}-{folderVersionString} bear beer
    words: [['Art', 'en'], ['Erotic', 'en'], ['Hunger', 'en']],
    randomImageOrientations: ['spot on ', ' background with '],
    staticPrompt: ', highly detailed, sharp focus',
    stableDiffusionOptions: {
        width: 512,
        height: 512,
        steps: 10
    }
}

require('./start')(compo);
