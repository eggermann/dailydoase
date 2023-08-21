const wikiParser = require('./wiki-parse-fkt.cjs');
const CircularLinks = require('./CircularLinks.cjs');
const WordStream = require('./WordStream.cjs');
const _ = {};
_bufferSize = 6;//comments
const {io} = require("socket.io-client");

class commentStream extends WordStream {
    constructor(options) {
        super()
        this.options = options;
        this.pageCnt = 0;
        this.circularLinks = new CircularLinks(':YP');
        this.startWord = options.startWord;
        this.isYP = true;
        this.isGrabbing = false;
        this.wellSortedLinks = {};
    }


    async check(comments) {


     Object.keys(comments).forEach(newsKey => {
            const comment = comments[newsKey]
//console.log('fresh: ',comment)

            const prevDeltaString = wikiParser.shortPhrase(comment.title, -1);
            comments[comment.title].sentences.prev.push(prevDeltaString)

            const nextDeltaString = wikiParser.shortPhrase(comment.title, 1);
            comments[comment.title].sentences.next.push(nextDeltaString)

        });

/*
        for (let i = 0; i < Object.keys(comments).length - 1; i = i + 2) {
            const comment = comments[Object.keys(comments)[i]]
            const comment2 = comments[Object.keys(comments)[i+ 1] ]

            const prevDeltaString = wikiParser.shortPhrase(comment.title, -1);
            comments[comment.title].sentences.prev.push(prevDeltaString)

            const nextDeltaString = wikiParser.shortPhrase(comment2.title, 1);
            comments[comment2.title].sentences.next.push(nextDeltaString)

        }*/
        // console.log('comments', comments);

        this.circularLinks.addLinks(comments)
        //   console.log(' -->this.circularLinks.links ', this.circularLinks.links)


    }


    async getComment() {
        console.log('getComment --- this.isGrabbing: ' + this.isGrabbing)

        if (this.isGrabbing) {
            return false;
        }

        this.isGrabbing = !this.isGrabbing;

        return new Promise((resolve, reject) => {



            const timerId = setInterval(async () => {

                if (Object.keys(this.wellSortedLinks).length > _bufferSize) {
                    clearInterval(timerId);
                    await this.check(this.wellSortedLinks);
                    this.isGrabbing = !this.isGrabbing;
                    this.wellSortedLinks = {};
                    return resolve();

                } else {
                    console.log('getComment -YP:-- this.isGrabbing: ' + this.isGrabbing)



                    _.socket.send(JSON.stringify({    // send a message to the server
                        type: "get-next",
                        content: []
                    }));
                }

            }, 1200);
        },(e)=>{
            console.log('----< ',e)
        })
    }

    async start() {
        _.socket = null;

        if (true) {
            _.socket = io.connect('https://eggman2.uber.space', {path: '/work-with-text-yp/socket.io'});

        } else {
            _.socket = io();//

        }
        _.socket.addEventListener("message", async (data) => {
            const packet = JSON.parse(data);

            /*received {
type: 'get-next',
content: {
comment: 'Im only 18 and I have that body. Anyone?',
commentLength: 134
}
}
*/
//console.log('mm',packet)
            if (packet.type === 'get-next') {
                const content = packet.content;

                const title = content.comment;

                const wellSortedLinks = this.wellSortedLinks;
                wellSortedLinks[title] ?
                    wellSortedLinks[title].cnt++ :
                    wellSortedLinks[title] = {
                        cnt: 1,
                        title,
                        sentences: {prev: [], next: []}
                    };

                //        console.log(wellSortedLinks[title].cnt, packet, Object.keys(wellSortedLinks).length)


            }
        });

        await this.getComment();
    }


    async getNext() {

        console.log(' ');
        console.log(' ');
        console.log('Object.keys(this.circularLinks.links).length', Object.keys(this.circularLinks.links).length, 'Object.keys(this.circularLinks.usedLinks).length :', Object.keys(this.circularLinks.usedLinks).length)
        console.log(' ');
        console.log(' ');
        if (Object.keys(this.circularLinks.links).length <= 20
            //  && Object.keys(this.circularLinks.usedLinks).length >= 1
        ) {//>= erste ist ursprungslink
            //not async
            const it = async () => {
                const nextLinkTitle = Object.keys(this.circularLinks.usedLinks)[1];//   const firstElKey = Object.keys(this.links)[0]//this.circularLinks.getNext().title
                const nextLink = this.circularLinks.usedLinks[nextLinkTitle];

                if (nextLink) {
                    delete this.circularLinks.usedLinks[nextLinkTitle];

                    console.log('reloaded ************************************')
                    await this.getComment();

                }
            }
            await it();
        }

        return await this.circularLinks.getNext();
    }
}


module.exports = commentStream;