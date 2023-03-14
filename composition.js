/*const words = [['erotic', 'en'], ['pop', 'en'], ['animals', 'en']];//, elephant'photographie', 'phyloosivie',esoteric
const _staticPrompt = ',UHD ';//, elephant'photographie', 'phyloosivie',esoteric
const _options = ;//, elephant'photographie', 'phyloosivie',esoteric
*/

const compo = {
    //promptFunktion:(streams, options)=>{},
    //circularLinksGetNext:()=>{
    //this is the cirular context },
    folderVersionString: 'v2',// v-{cnt}-{folderVersionString} bear beer
    words: [['parish fair', 'en'], ['Punk', 'en'], ['Religion', 'en'], ['Medicine', 'en']],
    randomImageOrientations: ['spot on ', ' background '],
    staticPrompt: ', 4k',
    stableDiffusionOptions: {
        width: 512,
        height: 512,
        steps: 10
    }
}

require('./start')(compo);
