const fs = require('fs');
const axios = require('axios');
const path = require('path');
require('dotenv').config();
const imageName = path.join(__dirname, 'stable-diffusion-3.5-large.jpeg'); // Path to save the image

(async () => {
    try {
        // Make the POST request to Hugging Face API
        let response = await axios.post(
            'https://api-inference.huggingface.co/models/stabilityai/stable-diffusion-3.5-large',
            {
                "inputs": "cats dreaming from boobs"
            },
            {
                headers: {
                    Authorization: `Bearer ${process.env.HF_API_TOKEN}`, // Add Bearer token properly
                    Accept: 'application/json',
                    'Content-Type': 'application/json'
                },
                responseType: 'arraybuffer' // This ensures the response is treated as binary data
            }
        );

        // Convert response data to a buffer and save it as an image
        const buffer = Buffer.from(response.data, 'binary');
        fs.writeFileSync(imageName, buffer);
        console.log('Image saved successfully:', imageName);

    } catch (error) {
        // Log detailed error information
        console.error('Error fetching or saving the image:', error.response ? error.response.data : error.message);
    }
})();