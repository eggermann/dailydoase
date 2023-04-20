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
    words: [['Cats', 'en'], ['Sex', 'en'], ['Combat', 'en'], ['Home_appliance', 'en']],
    randomImageOrientations: ['spot on ', ' background '],
   // staticPrompt: ', realistic photo',
    model:'midjourneyReplica',
    stableDiffusionOptions: {

    }
};

require('./start')(compo);
