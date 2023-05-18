/*const words = [['erotic', 'en'], ['pop', 'en'], ['animals', 'en']];//, elephant'photographie', 'phyloosivie',esoteric
const _staticPrompt = ',UHD ';//, elephant'photographie', 'phyloosivie',esoteric
const _options = ;//, elephant'photographie', 'phyloosivie',esoteric

https://stable-diffusion-art.com/prompt-guide/
*/

//----> hosting https://www.ni-sp.com/how-to-run-stable-diffusion-on-your-own-cloud-gpu-server/
//https://gist.github.com/thesephist/376afed2cbfce35d4b37d985abe6d0a1

const st=require('./lib/get-from-stable-diffusion/options.oak.json')

const allStatics=[];
for(let i in st){
    st[i].forEach(line=>{
        console.log(line)
        if(line.indexOf('XX')!=-1){
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
    words: [['Humanity', 'en'], ['Sugar', 'en'], ['Violence', 'en'], ['Robotics', 'en']],
    randomImageOrientations:[' foreground ', ' background '],// allStatics,//,['spo-l,m t on ', ' background '],
    //staticPrompt: ', Romanesque',
    model: 'huggin',
    info: 'huggin, stable 2.1 no word magic ',
    stableDiffusionOptions: {
        steps:50
    }
};

require('./start')(compo);
