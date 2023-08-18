const util = require('util')

const onExit=()=>{
    process.stdin.resume();//so the program will not close instantly

    function exitHandler(options, exitCode) {





     if (options.cleanup) console.log('clean');
        if (exitCode || exitCode === 0) console.log(exitCode);  /* */
        if (options.exit) process.exit();
    }

//do something when app is closing
    process.on('exit', exitHandler.bind(null,{cleanup:true}));

//catches ctrl+c event
    process.on('SIGINT', exitHandler.bind(null, {exit:true}));

// catches "kill pid" (for example: nodemon restart)
    process.on('SIGUSR1', exitHandler.bind(null, {exit:true}));
    process.on('SIGUSR2', exitHandler.bind(null, {exit:true}));

//catches uncaught exceptions
    process.on('uncaughtException', exitHandler.bind(null, {exit:true}));
}

const CircularLinks = class {
    constructor() {
        onExit();
        //check for shutdowned

        this.links = {};
        this.usedLinks = {};

        this.model = {}
    }

    addUsedLink(el) {
       // console.log('ADD USED LINK ',el)

        const title = el.title;
        console.log('add used link: ',title)

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
        const firstElKey = Object.keys(this.links)[0]
       // console.log('next circular link call ++>'/*, JSON.stringify(nextEl, null, 2)*/);

        if (!firstElKey) {
            return false;
        }

        const nextEl = JSON.parse(JSON.stringify(this.links[firstElKey]));
     //   console.log('next circular link call ++>: ', firstElKey, this.links[firstElKey],Object.keys(this.links).length)
        delete this.links[firstElKey];

        if (nextEl.cnt > 1) {
            nextEl.cnt--;
            this.links[firstElKey] = nextEl;//repeat until 0 /inhibitoric
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