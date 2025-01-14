import getFromStableDiffusion from '../lib/get-from-stable-diffusion/index.js';

async function testHugging() {
    try {

        const modelConfig = {
            script: 'post-to-hugging.js',
            pollingTime: 4000,
            url: 'https://api-inference.huggingface.co/models/black-forest-labs/FLUX.1-schnell',//stabilityai/stable-diffusion-xl-base-1.0',//'https://api-inference.huggingface.co/models/fal/AuraFlow',//https://api-inference.huggingface.co/models/ByteDance/SDXL-Lightning',
        }

        const model = await getFromStableDiffusion.setVersion(modelConfig);

        if (!model) {
            console.error('Failed to initialize huggin model.');
            return;
        }

        const options = {
            prompt: {
                staticPrompt: ' internet, raw style',//' , as clown ',//, as shadow puppets ',//as vegetable toys',//['Style', 'en'],
                prePrompt: 'on twitter or instagram: ',
                negative_prompt: 'phone'
            },

            model: {
                url: 'https://api-inference.huggingface.co/models/black-forest-labs/FLUX.1-schnell',//stabilityai/stable-diffusion-xl-base-1.0',//'https://api-inference.huggingface.co/models/fal/AuraFlow',//https://api-inference.huggingface.co/models/ByteDance/SDXL-Lightning',
                num_inference_steps: 30,
            },

            //  model: 'https://api-inference.huggingface.co/models/stabilityai/stable-diffusion-xl-base-1.0'
        };

        const prompt = 'landscape with mountains and a lake';

        const result = await model.prompt(prompt, options.prompt);

        if (result) {
            console.log('Huggin test completed successfully.');
        } else {
            console.error('Huggin test failed.');
        }
    } catch (error) {
        console.error('Error during huggin test:', error);
    }
}

testHugging();
