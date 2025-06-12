import nlp from 'compromise'

const _ = {
    shiftCnt: 0,
    streams:0,
    rnd_cnt: 0,
    filterEmptys: arr => arr.filter(i => i && i.length > 1),
    getVerbs: (phrase) => {


        //  phrase='Somebody once told me the world is gonna roll me';

        // nlp('Somebody once told me the world is gonna roll me').verbs().out('array')
        const verbs = nlp(phrase).verbs().toInfinitive().out('array');
        // const adjectives = nlp(phrase).verbs().adverbs().out('array');
        const adjectives = nlp(phrase).adjectives().out('array');
        // console.log(t,  nlp(phrase).verbs().out('array');
        console.log(chalk.blue(verbs));
        console.log(chalk.red(adjectives));
        return {
            verbs: _.filterEmptys(verbs),
            adjectives: _.filterEmptys(adjectives)
        };

    },
}

async function mixNewsWithGroq(n1, n2) {
    //  const n1Text = n1.description, n2Text = n2.description;
    const n1Text = JSON.stringify(n1), n2Text = JSON.stringify(n2);

    const prompt = `a detailed real only prompt for a image machine mixed from -->
    ${n1Text},${n2Text}.  pure prompt for direct use on inference,only value: the value :
`;

    const chatCompletion = await groq.chat.completions.create({
        messages: [{ role: 'user', content: prompt }],
        model: 'mixtral-8x7b-32768',
    });
    const text = chatCompletion.choices[0].message.content

    console.log('textfrom GROQ----->', chalk.blue(text));
    return text
}




export default {
    async default(streams, options) {

        let allIn = [];

        let mains = '';

        const meaningRotatingStreams = [];

//console.log('-------> start word mixing <----------', streams.length, streams);


        for (let i = 0; i < streams.length; i++) {
            meaningRotatingStreams.push(streams[(Math.round(_.shiftCnt + (Math.random() * 10))) % streams.length])//pickt unterschiedlichmal streams
        }

        _.shiftCnt++
      //  console.log('-------> start word mixing <----------')
        let prompts = meaningRotatingStreams.map(async (i, index) => {
            console.log('STREAM-', index);

            //todo create prompt for "word in stream eg newsstream

            const link = await i.getNext();

            const prev = link.sentences && link.sentences.prev.shift() || '';
            const title = link.title;
            const next = link.sentences && link.sentences.next.shift() || '';
            console.log('++++++next : ', next, '++++++title : ', title, '++++++prev : ', prev)

            if (i.isYP) {
                let verbs = '';

                try {
                    verbs = _.getVerbs(next);
                } catch (err) {
                }

                //-->   i.getArticle(link.title);
                let allIn2 = [];
                //   allIn2 = allIn2.concat(verbs.adjectives, prev, verbs.verbs)
                //        allIn2 = allIn2.concat(title)
                allIn2 = allIn2.concat(title, next)
                // allIn2 = allIn2.concat(verbs.adjectives, prev, verbs.verbs)

                return _.filterEmptys(allIn2).join(' ');
            } else if (i.isNews) {

                const n1 = link;
                const n2 = await i.getNext();
                //     console.log('----------',n1,n2);


                n1.prompt = await mixNewsWithGroq(n1, n2)

                return n1;
            } else {
                let verbs = '';

                try {
                    verbs = _.getVerbs(next);
                } catch (err) {
                }

                //-->   i.getArticle(link.title);
                let allIn2 = [];
                //   allIn2 = allIn2.concat(verbs.adjectives, prev, verbs.verbs)
                allIn2 = allIn2.concat(next, title)
                // allIn2 = allIn2.concat(verbs.adjectives, prev, verbs.verbs)

                return _.filterEmptys(allIn2).join(' ');
            }
        })

        prompts = await Promise.all(prompts);

        ///NOT FOE ALLL   TODO  console.log(prompt)
        //   .join(',');
        //        allIn = _.filterEmptys(allIn);// randomImageOrientations :['spot on ', 'in background ']

        //      console.log('---->',prompt)
        //  process.exit();
        if (options.randomImageOrientations) {
            prompts.forEach((i, index) => {

                const pos = Math.floor(Math.random() * (prompts.length + 1) * prompts.length);
                if (prompts[pos]) {
                    const randomPos = Math.floor(Math.random() * options.randomImageOrientations.length);
                    prompts[pos] = options.randomImageOrientations[randomPos] + ' ' + prompts[pos];
                }
            })
            /* options.randomImageOrientations.forEach((i, index) => {

                const pos = Math.floor(Math.random() * (prompt.length + 1));
                if (prompt[pos]) {
                    prompt[pos] = i + ' ' + prompt[pos];
                }

            })*/
        }

        //shuffleArray(prompt);
        //   prompt = prompt.join(`[${mains}] `);
        let prompt = prompts.join(` `);


        // shuffleArray(prompt);

        // prompt += allIn.join(',');
        //>-const shuffledArr = array => array.sort(() => 0.5 - Math.random());
      
    
        prompt = nlp(prompt).text();
        return prompt;
    },
}