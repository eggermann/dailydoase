// magicPrompt.js
import fetch from 'node-fetch';
import chalk from 'chalk';
import dotenv from 'dotenv';
dotenv.config();

const buildPromptXXX = (systemMsg, userInput) => {
    const systemPrompt = `${systemMsg}
### Instruction:
    You are a master *Dichter* — a poet who can conjure meaning from chaos. 
    When I supply you with a list of RANDOM WORDS, follow these five immutable rules:
    
    1. **Savor** each word: write a quick sensory or emotional association next to it (one phrase each).
    2. **Detect patterns**: notice any rhythms, echoes, or contrasts among the words; let this guide the poem’s meter or free-verse flow.
    3. **Compose** a multi-stanza poem that weaves the words (in any order) into a coherent feeling, story, or question.  
       - You may inflect or repeat words, but every original word must appear at least once.
    4. **Metamorphose** ONE word near the climax — change its part of speech or turn it into an unexpected concept (e.g., noun→verb, verb→color).
    5. **Title** the poem with the word that changed the most.
    
    Write boldly, honor randomness, but keep the final poem under 24 lines.
    
    ### Input:
    ${userInput}
    
    ### Response:`;

    return systemPrompt;
};

const defaultSystemMessage = `You are a LLM giving your secret poem about : `;

// Configure models and defaults
export const MODEL_REGISTRY = {
    DEFAULT:      'succinctly/text2image-prompt-generator',
    MAGIC_PROMPT: 'Gustavosta/MagicPrompt-Stable-Diffusion',
    FLAN_T5:      'google/flan-t5-large',
    SWITCH_TRANSFORMER: 'google/switch-base-8',
    FLAN_T5_BASE: 'google/flan-t5-small'
};

export default async function magicPrompt(prompt, data = {}) {
    // Validate prompt is a non-empty string
    if (!prompt || typeof prompt !== 'string') {
        console.error(chalk.red('Invalid prompt passed to magicPrompt:'), prompt);
        return false;
    }
    // Pick your model; you can also override via HF_MODEL env var
    const model = 'mistralai/Mistral-Nemo-Instruct-2407';// process.env.HF_MODEL || MODEL_REGISTRY.FLAN_T5_BASE;
    console.log(chalk.green(`Initializing model: ${model}`));

    const controller = new AbortController();
    const { signal } = controller;

    try {
        // Use Novita's OpenAI‐style chat endpoint
        const chatUrl = 'https://router.huggingface.co/novita/v3/openai/chat/completions';
        const chatPayload = {
            provider: 'novita',
            model,  // e.g. "deepseek-ai/DeepSeek-V3-0324"
            messages: [
             //   { role: 'system', content: buildPromptXXX(defaultSystemMessage, prompt) },
                { role: 'user',   content: prompt }
            ],
            parameters: {
                max_length:  data.max_length   || 150,
                temperature: data.temperature  || 0.9,
                top_k:       data.top_k        || 50
            }
        };

        console.log(chalk.blue('Chat payload:', JSON.stringify(chatPayload)));
   
        const response = await fetch(chatUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.HF_API_TOKEN}`,
                'Content-Type':  'application/json'
            },
            body:    JSON.stringify(chatPayload),
            signal
        });

        if (!response.ok) {
            // error‐handling moved verbatim from your original code
            let errorBody, errorText;
            try {
                errorText = await response.text();
                errorBody = JSON.parse(errorText);
            } catch {
                errorBody = null;
            }
            if (errorBody) {
                let errorMsg = errorBody && typeof errorBody === 'object'
                    ? JSON.stringify(errorBody)
                    : (errorBody?.error || errorBody);
                console.error(chalk.red(`API Error [${response.status}]:`, errorMsg));
                if (errorBody.estimated_time) {
                    console.log(chalk.yellow(`Model load ETA: ${errorBody.estimated_time}s`));
                }
            } else {
                console.error(chalk.red(`API Error [${response.status}]:`, errorText));
            }
                process.exit(0);
            return false;
        }

        const result = await response.json();
        // For chat‐complete we expect an array with choices
        const generatedText = Array.isArray(result.choices)
            ? result.choices[0]?.message?.content
            : result.choices?.[0]?.message?.content || '';

        console.log(chalk.green('Generated Prompt:', generatedText));
            process.exit(0);
        return generatedText;

    } catch (err) {
        if (err.name === 'AbortError') {
            console.log(chalk.yellow('Request aborted'));
        } else {
            console.error(chalk.red('Processing Error:', err));
        }
        return false;
    } finally {
        // clean up handlers
        process.removeListener('SIGINT',  () => controller.abort());
        process.removeListener('SIGTERM', () => controller.abort());
    }
}