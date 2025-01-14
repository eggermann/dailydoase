import getFromStableDiffusion from '../lib/get-from-stable-diffusion/index.js';
import { config as hugginConfig } from '../lib/get-from-stable-diffusion/post-to-huggin.js';

async function testHuggin() {
    try {
        const model = await getFromStableDiffusion.setVersion('huggin');

        if (!model) {
            console.error('Failed to initialize huggin model.');
            return;
        }

        const options = {
            prePrompt: 'A beautiful ',
            staticPrompt: ', 4k, high quality',
            negative_prompt: 'blurry, low quality',
            num_inference_steps: 30,
            model: 'https://api-inference.huggingface.co/models/stabilityai/stable-diffusion-xl-base-1.0'
        };

        const prompt = 'landscape with mountains and a lake';

        const result = await model.prompt(prompt, options);

        if (result) {
            console.log('Huggin test completed successfully.');
        } else {
            console.error('Huggin test failed.');
        }
    } catch (error) {
        console.error('Error during huggin test:', error);
    }
}

testHuggin();
