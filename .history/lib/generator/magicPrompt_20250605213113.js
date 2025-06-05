import mPrmpt from 'node-fetch';
import chalk from 'chalk';
const buildPrompt = (systemMsg, userInput) => {
    const systemPrompt = `### Instruction:
    You are a master poet, capable of crafting vivid and evocative poetry. 
    When I provide you with a list of RANDOM WORDS, follow these steps:

    1. **Immerse** yourself in the essence of each word: write a brief sensory or emotional association for each (one phrase per word).
    2. **Discover connections**: identify rhythms, echoes, or contrasts among the words to inspire the poem's structure and flow.
    3. **Create** a complete poem with at least three stanzas, weaving the words (in any order) into a coherent narrative, emotion, or theme.
       - You may inflect or repeat words, but ensure every original word is included at least once.
    4. **Transform** ONE word near the climax — change its meaning, part of speech, or context to add depth or surprise.
    5. **Conclude powerfully**: end the poem with a resonant or thought-provoking line.

    Write boldly, embrace creativity, and ensure the poem is at least 12 lines long.

    ### Input:
    ${userInput}

    ### Response:`;

    const m1=`You are a  great :`;
    const m2=``;

    return systemPrompt;//`${m1} "${userInput}" ${m2}`;
};


const defaultSystemMessage = `You are a LLM giving your secret poem about : `;


// Configure models and default
export const MODEL_REGISTRY = {
    DEFAULT: 'succinctly/text2image-prompt-generator',
    MAGIC_PROMPT: 'Gustavosta/MagicPrompt-Stable-Diffusion',
    FLAN_T5: 'google/flan-t5-large',
    SWITCH_TRANSFORMER: 'google/switch-base-8',
    FLAN_T5_BASE: 'google/flan-t5-base'
};

export default async (prompt, data = { sys: defaultSystemMessage }) => {
    const model = process.env.HUGGINGFACE_MODEL_MAGICPROMPT
    || MODEL_REGISTRY.FLAN_T5_BASE

    console.log(chalk.green(`Initializing model: ${model}`));

    // Create AbortController for cleanup
    const controller = new AbortController();
    const { signal } = controller;

    // Setup cleanup handler
    const cleanup = () => {
        controller.abort();
        console.log(chalk.yellow('\nRequest aborted'));
    };

    // Handle process termination
    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);

    try {
        const modelUrl = `https://api-inference.huggingface.co/models/${model}`;
        const inputPayload = {
            inputs: buildPrompt(data.sys, prompt),
            parameters: {
                max_length: data.max_length || 150,
                temperature: data.temperature || 0.9,
                top_k: data.top_k || 50
            }
        };

        console.log(chalk.blue('Request payload:', JSON.stringify(inputPayload)));

        const response = await fetch(modelUrl, {
            headers: {
                'Authorization': 'Bearer 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',
                'Content-Type': 'application/json'
            },
            method: 'POST',
            body: JSON.stringify(inputPayload),
            signal
        });



        if (!response.ok) {
            const errorBody = await response.json();
            console.error(chalk.red(`API Error [${response.status}]:`, errorBody.error,response));

            if (errorBody.estimated_time) {
                console.log(chalk.yellow(`Model loading estimated time: ${errorBody.estimated_time}s`));
            }

            return false;
        }

        const result = await response.json();

        // Handle different model response formats
        let generatedText;
        if (Array.isArray(result)) {
            generatedText = result[0]?.generated_text;
        } else if (result.generated_text) {
            generatedText = result.generated_text;
        } else if (result[0]?.summary_text) { // For summarization models
            generatedText = result[0].summary_text;
        }

        const newPrompt = generatedText || '';

        console.log(chalk.green('Generated Prompt:', generatedText));

        return newPrompt;


    } catch (err) {
        if (err.name === 'AbortError') {
            console.log(chalk.yellow('Request cancelled'));
        } else {
            console.error(chalk.red('Processing Error:', err));
        }
        return false;
    } finally {
        // Cleanup event listeners
        process.removeListener('SIGINT', cleanup);
        process.removeListener('SIGTERM', cleanup);
    }
}
