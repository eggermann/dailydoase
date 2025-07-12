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

        console.log(`Hugging Face token loaded: ${hf_token ? 'Yes (token present)' : 'No (token absent)'}`);
        console.log("Attempting to connect to Gradio client for Lightricks/LTX-Video...");

        // Connect to the Gradio client with authentication for LTX-Video
        // Added a Promise.race to implement a timeout for the connection
        const client = await Promise.race([
            Client.connect("Lightricks/LTX-Video", { hf_token }),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Gradio client connection timed out after 30 seconds. This might indicate network issues or the space being unresponsive.')), 30000))
        ]);

        console.log("Successfully connected to Gradio client.");

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
        // Changed prompt to a sample text as an empty prompt might cause issues
        const prompt = "A horse running in a field.";
        const height = 512; // Height of the video
        const width = 768;  // Width of the video
        const numFrames = 30; // Number of frames in the video
        const seed = 42; // Random seed for reproducibility

        console.log("Attempting to generate video...");
        // Use the client to generate a video with the given parameters
        const result = await client.predict("/generate_video", {
            prompt: prompt,
            input_image: exampleImage, // Optional, can be removed if not using an image
            height: height,
            width: width,
            num_frames: numFrames,
            seed: seed,
        });
        console.log("Video generation prediction complete.");


        console.log('Result:', JSON.stringify(result, null, 2));

        // Check if the result is successful and in the expected format
        if (!result || result.type !== 'data' || !Array.isArray(result.data) || result.data.length === 0) {
            console.error('Result:', result);
            throw new Error('Prediction request failed or returned unexpected data format. The server returned an error.');
        }

        // Extract video information from the result
        const videoData = result.data[0]; // Access the first item in the data array

        if (!videoData || !videoData.video || !videoData.video.url) {
            throw new Error("No video URL was found in the server response or the response structure is incorrect.");
        }

        const videoUrl = videoData.video.url;

        // Fetch the video from the URL
        console.log('Fetching generated video from:', videoUrl);
        const videoResponse = await fetch(videoUrl);

        if (!videoResponse.ok) {
            throw new Error(`Failed to fetch video from ${videoUrl}: ${videoResponse.statusText}`);
        }

        const videoBuffer = await videoResponse.arrayBuffer();

        // Save the video to the file system
        const videoFileName = 'generated_video.mp4';
        try {
            await fs.promises.writeFile(videoFileName, Buffer.from(videoBuffer));
            console.log(`Video saved as ${videoFileName}`);
        } catch (fileError) {
            throw new Error(`Failed to save video file ${videoFileName}: ${fileError.message}`);
        }

    } catch (error) {
        console.error("An error occurred:", error.message);
        // Log the full error object for more detailed debugging
        console.error("Full error details:", error);
    }
};

// Run the function to generate and save the video
generateAndSaveVideo();
