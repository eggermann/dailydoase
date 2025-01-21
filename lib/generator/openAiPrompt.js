// ---> https://www.geeksforgeeks.org/how-to-use-chatgpt-api-in-nodejs/
// ---> https://medium.com/codingthesmartway-com-blog/a-beginners-guide-to-integrating-chatgpt-with-node-js-9daf8557234



import OpenAI from 'openai';
console.log(process.env)

const openai = new OpenAI({
    apiKey:'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'// process.env.OPENAI_API_KEY, // defaults to process.env["OPENAI_API_KEY"]
});

export async function imageDescription(prompt) {
    const fullPrompt='a very short image description from fallowing input: '+prompt;

    const chatCompletion = await openai.chat.completions.create({
        messages: [{role: 'user', content: fullPrompt}],
        model: 'gpt-3.5-turbo',
    });


    console.log(chatCompletion.choices);
    return chatCompletion.choices[0].message.content;
}
export async function artworkDescription(prompt) {
    const fullPrompt='a very short artwork description from fallowing input: '+prompt;

    const chatCompletion = await openai.chat.completions.create({
        messages: [{role: 'user', content: fullPrompt}],
        model: 'gpt-3.5-turbo',
    });


    console.log(chatCompletion.choices);
    return chatCompletion.choices[0].message.content;
}

export async function midjDescription(prompt) {
    const fullPrompt='a image description in two sentence from fallowing input: '+prompt;

    const chatCompletion = await openai.chat.completions.create({
        messages: [{role: 'user', content: fullPrompt}],
        model: 'gpt-3.5-turbo',
    });


    console.log(chatCompletion.choices);
    return chatCompletion.choices[0].message.content;
}
//main();
(async()=>{
  //console.log(await main('mausz'));
})()
