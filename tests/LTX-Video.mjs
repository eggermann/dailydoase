// Import necessary modules
import fetch from 'node-fetch';
import fs from 'fs';
import { Client } from '@gradio/client';
import dotenv from 'dotenv';

// Load environment variables from a .env file into process.env
dotenv.config();

// Retrieve the Hugging Face token from environment variables
const hf_token = process.env.HF_API_TOKEN;

const generateAndSaveVideo = async () => {
    try {
        // Ensure the Hugging Face token is available
        if (!hf_token) {
            throw new Error('Hugging Face token not found in environment variables. Please set HF_API_TOKEN in your .env file.');
        }

        // Connect to the Gradio client with authentication for LTX-Video
        const client = await Client.connect("Lightricks/LTX-Video", { hf_token });

        // View the API to confirm available endpoints and expected parameters
        const appInfo = await client.view_api();
        console.log('App Info:', JSON.stringify(appInfo, null, 2));

        // Define the input image as a URL-based object (optional)
        const exampleImage = {
            path: "https://dailydoase.de/v/249-HF-_1_2/1-386.png/img",
            url: "https://dailydoase.de/v/249-HF-_1_2/1-386.png/img",
            meta: {
                "_type": "gradio.FileData"
            },
            orig_name: "bus.png"
        };

        // Define other parameters for video generation
        const prompt = "A beautiful sunset over the mountains.";
        const height = 512; // Height of the video
        const width = 768;  // Width of the video
        const numFrames = 30; // Number of frames in the video
        const seed = 42; // Random seed for reproducibility

        // Use the client to generate a video with the given parameters
        const result = await client.predict("/generate_video", { 
            prompt: prompt,
            input_image: exampleImage, // Optional, can be removed if not using an image
            height: height,
            width: width,
            num_frames: numFrames,
            seed: seed,
        });

        console.log('Result:', JSON.stringify(result, null, 2));

        // Check if the result is successful
        if (!result || result.type !== 'data') {
            console.error('Result:', result);
            throw new Error('Prediction request failed. The server returned an error.');
        }

        // Extract video information from the result
        const resultDataArray = result.data;
        if (!Array.isArray(resultDataArray) || resultDataArray.length === 0) {
            throw new Error("No data was returned by the server.");
        }

        const videoData = resultDataArray[0]; // Access the first item in the data array

        if (!videoData || !videoData.video || !videoData.video.url) {
            throw new Error("No video URL was found in the server response.");
        }

        const videoUrl = videoData.video.url;

        // Fetch the video from the URL
        console.log('Fetching generated video from:', videoUrl);
        const videoResponse = await fetch(videoUrl);

        if (!videoResponse.ok) {
            throw new Error(`Failed to fetch video: ${videoResponse.statusText}`);
        }

        const videoBuffer = await videoResponse.arrayBuffer();

        // Save the video to the file system
        const videoFileName = 'generated_video.mp4';
        try {
            await fs.promises.writeFile(videoFileName, Buffer.from(videoBuffer));
            console.log(`Video saved as ${videoFileName}`);
        } catch (fileError) {
            throw new Error(`Failed to save video file: ${fileError.message}`);
        }

    } catch (error) {
        console.error("An error occurred:", error);
    }
};

// Run the function to generate and save the video
generateAndSaveVideo();