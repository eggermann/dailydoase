const util = require('util')

const CircularLinks = class {
    constructor() {
        this.links = {};
        this.usedLinks = {};

        this.model = {}
    }

    addUsedLink(link) {
        const title = link.link.title;
        this.usedLinks[title] ?
            this.usedLinks[title].cnt++ :
            this.usedLinks[title] = {cnt: 1};
    }

    addLinks(links) {
        if (util.isArray(links)) {
            // from suggestion
            links.reduce((acc, link) => {

                acc[link] ?
                    acc[link].cnt++ :
                    acc[link] = {
                        cnt: 1,
                        link: {
                            title: link
                        },
                        sentences: {
                            prev: [],
                            next: [],
                        }
                    };

                return acc;
            }, this.links);

        } else {


            Object.keys(links).forEach((key) => {
                const newCircLink = links[key];

                this.links[key] ?
                    (() => {
                        this.links[key].cnt++;

                        console.log('exist.... : ', newCircLink, this.links[key])

                        this.links[key].sentences.prev = this.links[key].sentences.prev.concat(newCircLink.sentences.prev)
                        this.links[key].sentences.next = this.links[key].sentences.next.concat(newCircLink.sentences.next)
                    })() :
                    (() => {
                        secureSentences(newCircLink);
                        console.log('newCircLink', newCircLink)
                        this.links[key] = {cnt: 1, link: newCircLink};

                    })
            });
        }
    }

    getNext() {
        const firstElKey = Object.keys(this.links)[0]
        console.log('getNext: ', firstElKey,Object.keys(this.links).length)
        if (!firstElKey) {
            return false;
        }

        const nextEl = JSON.parse(JSON.stringify(this.links[firstElKey]));
        delete this.links[firstElKey];


        if (nextEl.cnt > 1) {
            nextEl.cnt--;
            this.links[firstElKey] = nextEl;
        } else {
            this.addUsedLink(nextEl);
        }

        console.log('next circular link: ', nextEl.link.title, nextEl)

        //  if(nextEl.cnt)

        // console.log('- this.links[firstElKey]-------', this.links[firstElKey])
        return nextEl.link;
    }

    getNextClassic() {
        const firstElKey = Object.keys(this.links)[0]
        const nextEl = this.links[firstElKey];
        this.addUsedLink(nextEl);
        console.log('next circular link: ', nextEl.title)
        delete this.links[firstElKey];

        return nextEl.link.title;
    }
}

module.exports = CircularLinks;