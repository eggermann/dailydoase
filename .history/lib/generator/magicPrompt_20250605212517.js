//https://huggingface.co/Gustavosta/MagicPrompt-Stable-Diffusion?text=background++Fairy+tale+%28disambiguation%29%2CScram+%28disambiguation%29%2CEmergency+%28disambiguation%29%2CTraditional+story

import mPrmpt from 'node-fetch';
import chalk from 'chalk';

export default async (data = {"inputs": "background  Fairy tale (disambiguation),Scram (disambiguation),Emergency (disambiguation),Traditional story"}) => {
    try {
        async function query(prompt) {

            let kind = null;
            if (true) {
                kind = {
                    model: 'https://api-inference.huggingface.co/models/succinctly/text2image-prompt-generator',
                    body: JSON.stringify({inputs: prompt})
                }
            } else {
                kind = {
                    body: JSON.stringify(prompt),
                    model: 'https://api-inference.huggingface.co/models/Gustavosta/MagicPrompt-Stable-Diffusion'
                }
            }

            const response = await fetch(
                //         ,
                kind.model,
                {
                    headers: {Authorization: "Bearer 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"},
                    method: "POST",
                    body: kind.body
                }
            );
            const result = await response.json();
            return result;
        }


        const response = await query(data);
        console.log(chalk.green(JSON.stringify(response)))
        if (response.error) {

        }

        return response && !response.error && response[0].generated_text;
    } catch (err) {
        console.log('magic err', err)
        return false;
    }
}

//module.exports();