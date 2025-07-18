import axios from 'axios';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const apiKey = process.env.HF_API_TOKEN; // Your Hugging Face API key
const modelName = 'Lightricks/LTX-Video'; // Model name

async function generateVideo(prompt, height, width, numFrames, seed) {
    const url = `https://api-inference.huggingface.co/models/${modelName}`;

    const headers = {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
    };

    const data = {
        inputs: prompt,
        parameters: {
            height: height,
            width: width,
            num_frames: numFrames,
            seed: seed
        }
    };

    try {
        const response = await axios.post(url, data, { headers, responseType: 'arraybuffer' });
        if (response.status === 200) {
            const outputPath = 'generated_video.mp4';
            fs.writeFileSync(outputPath, response.data);
            console.log(`Video successfully generated and saved to ${outputPath}`);
        } else {
            console.error(`Unexpected response status: ${response.status}`);
        }
    } catch (error) {
console.error('Error generating video:', error.message);

        if (error.response && error.response.data) {
            // Convert Buffer to string
            const errorData = error.response.data.toString('utf-8');
            try {
                // Attempt to parse as JSON
                const errorJson = JSON.parse(errorData);
                console.error('Error generating video:', errorJson);
            } catch (parseError) {
                // If parsing fails, log the raw string
                console.error('Error generating video:', errorData);
            }
        } else {
            console.error('Error generating video:', error.message);
        }
    }
}

// Example usage
const prompt = "1006,Sleuth (Australian TV channel),Translation (biology) , as vegetable toys"; // Adjust this prompt as needed

//const prompt = "tests/LTX-Video-2.mjs"; // Adjust this prompt as needed
const height = 512; // Ensure this is a multiple of 32
const width = 768; // Ensure this is a multiple of 32
const numFrames = 257; // Must be in the form of 8n + 1 (e.g., 257)
const seed = 42; // Random seed for reproducibility

generateVideo(prompt, height, width, numFrames, seed);
