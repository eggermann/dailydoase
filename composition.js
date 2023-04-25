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
    folderVersionString: 'midjRep',// v-{cnt}-{folderVersionString} bear beer
    words: [['Fighting', 'en'], ['Animal', 'en'], ['Testing', 'en']],
   // randomImageOrientations: ['spot on ', ' background '],
   // staticPrompt: ', realistic photo',
    model:'midjourneyReplica',
    info:'using midjourny, and stabledifusion prompts, 16 len, next-title',
    stableDiffusionOptions: {

    }
};

require('./start')(compo);
