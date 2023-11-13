const util = require('util');
const path = require('path');

const CircularLinks = class {
    constructor(startWord) {
        this.links = {};
        this.usedLinks = {};
        this.startWord = startWord;
        //check for shutdowned

        this.model = {}
    }

    loadFromCrash(dir) {
        const p = path.join(dir, this.startWord + '.json')

        try {
            const data = require(p);
            //   console.log(data);
            this.links = data.links;
            this.usedLinks = data.usedLinks;
            this.loadedFromCrash = true;
        } catch (e) {
        }
    }

    addUsedLink(el) {
        // console.log('ADD USED LINK ',el)

        const title = el.title;
        console.log('add used link: ', title)

        this.usedLinks[title] ?
            this.usedLinks[title].cnt++ :
            this.usedLinks[title] = {cnt: 1};
    }

    addLinks(freshLinks) {

        if (util.isArray(freshLinks)) {

            // from suggestion
            freshLinks.forEach((link) => {
                console.log('freshLink *** -->', link)
                this.links[link] ?
                    this.links[link].cnt++ :
                    this.links[link] = {
                        cnt: 1,
                        title: link
                    };
            });

        } else {

            Object.keys(freshLinks).forEach(key => {
                const newCircLink = freshLinks[key];

                this.links[key] ?
                    (() => {
                        this.links[key].cnt++;

                        if (!this.links[key].sentences) {
                            this.links[key].sentences = {
                                prev: [],
                                next: [],
                            }
                        }


                        this.links[key].sentences.prev = (this.links[key].sentences.prev
                            .concat(newCircLink.sentences.prev)).filter(i => i)
                        this.links[key].sentences.next = (this.links[key].sentences.next
                            .concat(newCircLink.sentences.next)).filter(i => i)
                    })() :
                    (() => {
                        if (this.usedLinks[key]) {
                            //--> return ;
                        }
                        // console.log('newCircLink', newCircLink)
                        this.links[key] = newCircLink;

                    })()
            });
        }
    }

    getNext() {
let highest=0,index=0,index2=0;
      for (const property in this.links) {

        const hCnt=this.links[property].cnt;

        if(hCnt>highest ){
          index2=index;
          highest=hCnt;
        }
  index++;
      }

        const elementKey = Object.keys(this.links)[index2]
        // console.log('next circular link call ++>'/*, JSON.stringify(nextEl, null, 2)*/);

        if (!elementKey) {
            return false;
        }

        const nextEl = JSON.parse(JSON.stringify(this.links[elementKey]));
        //   console.log('next circular link call ++>: ', firstElKey, this.links[firstElKey],Object.keys(this.links).length)
        delete this.links[elementKey];

        if (nextEl.cnt > 1) {
            nextEl.cnt--;
            this.links[elementKey] = nextEl;//repeat until 0 /inhibitoric
        } else {
            this.addUsedLink(nextEl);
        }
        //this.addUsedLink(nextEl);


        //  if(nextEl.cnt)

        // console.log('- this.links[firstElKey]-------', this.links[firstElKey])
        return nextEl;
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
