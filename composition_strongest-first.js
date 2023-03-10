/*const words = [['erotic', 'en'], ['pop', 'en'], ['animals', 'en']];//, elephant'photographie', 'phyloosivie',esoteric
const _staticPrompt = ',UHD ';//, elephant'photographie', 'phyloosivie',esoteric
const _options = ;//, elephant'photographie', 'phyloosivie',esoteric
*/

const compo = {
    //promptFunktion:(streams, options)=>{},
    circularLinksGetNext: function () {

        let highest = {cnt: -1},
            key = 0;

        for (let i in this.links) {
            const el = this.links[i];
            if (highest.cnt < el.cnt) {
                highest = el;
                key = i;
            }
        }

     //   console.log(index,highest)
     //   process.exit();


        const nextEl = JSON.parse(JSON.stringify(this.links[key]));
        delete this.links[key];

        /*if (nextEl.cnt > 1) {
            nextEl.cnt--;
            this.links[firstElKey] = nextEl;
        } else {
            this.addUsedLink(nextEl);
        }
*/

        console.log('++>', JSON.stringify(nextEl, null, 2));
       // process.exit();

        //  if(nextEl.cnt)

        // console.log('- this.links[firstElKey]-------', this.links[firstElKey])
        return nextEl;
    },
    //this is the cirular context },
    folderVersionString: 'v2',// v-{cnt}-{folderVersionString}
    words: [['psycholgie', 'en'],['fairytale', 'en'], ['politics', 'en'], ['erotic', 'en'], ['psychology', 'en']],
    //randomImageOrientations: ['spot on ', 'in background '],
    staticPrompt: ', UHD , realistic photo',
    stableDiffusionOptions: {
        width: 512,
        height: 512,
        steps: 10
    }
}

require('./start')(compo);
