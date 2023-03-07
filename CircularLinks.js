const util = require('util')


const CircularLinks = class {
    constructor() {
        this.links = {};
        this.usedLinks = {};

        this.model = {}
    }

    addUsedLink(link) {
        const linkKey = link.link.title;
        this.usedLinks[linkKey] ?
            this.usedLinks[linkKey].cnt++ :
            this.usedLinks[linkKey] = {cnt: 1};
    }

    addLinks(links) {
        if (util.isArray(links)) {
            links.reduce((acc, link) => {


                acc[link] ?
                    acc[link].cnt++ :
                    acc[link] = {
                        cnt: 1, link: {
                            title: link
                        }
                    };

                return acc;
            }, this.links);

        } else {

            Object.keys(links).reduce((acc, link) => {
                const key = links[link].title


            /*    if(this.usedLinks[key]){

                    return; //----> or map sentences
                }*/

                console.log(key, acc[key])
                acc[key] ?
                    (() => {
                        links[link].cnt++;
                        console.log('exist: ', link)
                        const sentences = acc[key].sentences;
                        link.sentences.prev = link.sentences.prev.concat(sentences.prev)
                        link.sentences.next = link.sentences.next.concat(sentences.next)


                    })() :

                    (()=>{
                        acc[key] = {cnt: 1, link: links[link]};


                    })


                return acc;
            }, this.links);


        }
    }

    getNext() {
        const firstElKey = Object.keys(this.links)[0]
        const nextEl = this.links[firstElKey];
        this.addUsedLink(nextEl);
        console.log('next circular link: ', nextEl.title)
        delete this.links[firstElKey];

        return nextEl.link.title;
    }
}

module.exports = CircularLinks;