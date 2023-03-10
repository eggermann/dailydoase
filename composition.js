/*const words = [['erotic', 'en'], ['pop', 'en'], ['animals', 'en']];//, elephant'photographie', 'phyloosivie',esoteric
const _staticPrompt = ',UHD ';//, elephant'photographie', 'phyloosivie',esoteric
const _options = ;//, elephant'photographie', 'phyloosivie',esoteric
*/

const compositionFairyTaleAndPolitics = {
    //promptFunktion:(streams, options)=>{},
    //circularLinksGetNext:()=>{
    //this is the cirular context },
    folderVersionString: 'v2',// v-{cnt}-{folderVersionString}
    words: [['fairytale', 'en'], ['politics', 'en'], ['vegetables', 'en']],
    //randomImageOrientations: ['spot on ', 'in background '],
    staticPrompt: ', UHD ',
    stableDiffusionOptions: {
        width: 512,
        height: 512,
        steps: 10
    }
}

require('./start')(compositionFairyTaleAndPolitics);
