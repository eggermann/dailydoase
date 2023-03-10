const _ = {
    charSequenceCnt: 32,

    hasMultipleMeaning: obj => (!obj.content.length && Object.keys(obj.links).length),
    getContentString: (obj => {
        const startString = obj.extract ? obj.extract : '';

        return obj.content.reduce((acc, el) => {
            acc += el.content;
            return acc;
        }, startString).replace((/  |\r\n|\n|\r/gm), " ");
    }),
    getPositionByIndex: (string, subString, index) => {
        return string.split(subString, index).join(subString).length;
    },

    removeNotInTextExistings: (concatenatedContent, links) => {
        return links.filter(link => {
            const startPos = _.getPositionByIndex(concatenatedContent, link.text, link.cnt);//concatenatedContent.indexOf(link.text);
            link.startPos = startPos;

            return startPos != -1;
        })
    },

    shortPhrase(str, dir = -1) {
        const strLen = Math.min(str.length, _.charSequenceCnt);
        let shortPhrase = null;

        if (dir == -1) {
            shortPhrase = str.substring(str.length - strLen)
        } else {
            shortPhrase = str.substring(0, strLen)
        }

        if (shortPhrase.length >= 4) {
            const a = shortPhrase.split(' ');
            a.pop();
            a.shift();

            shortPhrase = a.join(' ');
        }

        return shortPhrase;
    },


    async init(title, lang) {
        await _.getArticle(title, lang);
        return;


        // const s = await _.searchArticle('dfsdf');
        // console.log(this.circularLinks)
        const nL = this.circularLinks.getNext();
        console.log('*********', nL.title)
        await _.getArticle(nL.title, lang);
        return

        let stop = 0;

        const b = async () => {

            if (stop++ <= 10) {
                const cLink = this.circularLinks.getNext();

                if (cLink) {
                    // console.log(stop, cLink, 'size:', Object.keys(this.circularLinks.links).length)
                    await _.getArticle(cLink.title, lang);
                    await b();
                } else {
                    console.log('no circular links rest')
                }
            } else {
                console.log('**** end *****')
            }

        }

        //  await b();


        //  console.log('++>', JSON.stringify(this.circularLinks, null, 2));
    }
}


module.exports = _;