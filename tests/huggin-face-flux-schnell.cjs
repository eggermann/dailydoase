const fs = require('fs');
const axios = require('axios');
const path = require('path');
require('dotenv').config();

const _token = process.env.HF_API_TOKEN; // Token from environment variable
const imageName = path.join(__dirname, 'flux-schnell.jpeg'); // Path to save the image
console.log(`Token: ${_token ? 'Loaded' : 'Missing'}`);

(async () => {
    try {
        console.log('Sending request to Hugging Face API...');

        // Make the POST request to Hugging Face API
        let response = await axios.post(
            'https://api-inference.huggingface.co/models/black-forest-labs/FLUX.1-dev',
            {
                "inputs": "Cyberneticist, Operation (game) a battery-operated, board game , Horror fiction, Naturism (disambiguation), 4k"
            },
            {
                headers: {
                    Authorization: `Bearer ${_token}`, // Add Bearer token properly
                    Accept: 'application/json',
                    'Content-Type': 'application/json'
                },
                responseType: 'arraybuffer' // This ensures the response is treated as binary data
            }
        );

        // Log the response details
        console.log('Response received from Hugging Face:');
        console.log(`Status: ${response.status} ${response.statusText}`);
        console.log('Headers:', response.headers);

        // Log data size
        console.log(`Data size: ${response.data.length} bytes`);

        // Convert response data to a buffer and save it as an image
        const buffer = Buffer.from(response.data, 'binary');
        fs.writeFileSync(imageName, buffer);
        console.log('Image saved successfully:', imageName);

    } catch (error) {
        // Enhanced error logging
        if (error.response) {
            console.error('Error response from Hugging Face API:');
            console.error(`Status: ${error.response.status} ${error.response.statusText}`);
            console.error('Headers:', error.response.headers);
            console.error('Data:', error.response.data);
        } else if (error.request) {
            console.error('No response received:', error.request);
        } else {
            console.error('Request setup error:', error.message);
        }
    }
})();