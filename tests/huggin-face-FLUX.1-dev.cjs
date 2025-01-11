const fs = require('fs');
const axios = require('axios');
const path = require('path');
require('dotenv').config();
const imageName = path.join(__dirname, 'FLUX.1-dev.jpeg'); // Path to save the image

(async () => {
    try {
        // Make the POST request to Hugging Face API
        let response = await axios.post(
            'https://api-inference.huggingface.co/models/black-forest-labs/FLUX.1-dev',
            {
                "inputs": "Cyberneticist, Operation (game) a battery-operated, board game , Horror fiction, Naturism (disambiguation), 4k"
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