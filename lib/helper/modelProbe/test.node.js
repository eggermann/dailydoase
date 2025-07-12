// test.node.js – Test chat with meta-llama/Llama-3.1-8B-Instruct, fallback to next available, then chat

import chatModelProbe from './chatModelProbe.js';

const TARGET_MODEL = 'meta-llama/Llama-3.1-8B-Instruct';
let chat = await chatModelProbe.init(TARGET_MODEL);

const parameters = {
   // max_new_tokens: 64,
    temperature: 0.1,
    top_p: 0.95
};

// Now chat with the selected model
try {
    const prompt = "create a erotic dirty image description";
    const response = await chat(prompt, parameters);


    console.log(`Model response: ${response}`);
} catch (err) {
    console.error('Error chatting with model:', err);
}

