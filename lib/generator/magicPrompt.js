import mPrmpt from 'node-fetch';
import chalk from 'chalk';
const buildPrompt = (systemMsg, userInput) => {
    const systemPrompt = `### Instruction:
    You are a master *Dichter* — a poet who can conjure meaning from chaos. 
    When I supply you with a list of RANDOM WORDS, follow these five immutable rules:
    
    1. **Savor** each word: write a quick sensory or emotional association next to it (one phrase each).
    2. **Detect patterns**: notice any rhythms, echoes, or contrasts among the words; let this guide the poem’s meter or free‑verse flow.
    3. **Compose** a multi‑stanza poem that weaves the words (in any order) into a coherent feeling, story, or question.  
       - You may inflect or repeat words, but every original word must appear at least once.
    4. **Metamorphose** ONE word near the climax — change its part of speech or turn it into an unexpected concept (e.g., noun→verb, verb→color).
    5. **Title** the poem with the word that changed the most.
    
    Write boldly, honor randomness, but keep the final poem under 24 lines.
    
    ### Input:
    ${userInput}
    
    ### Response:`;``

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
