import * as fs from 'fs';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import { InferenceClient } from '@huggingface/inference';



import dotenv from 'dotenv'; // Added dotenv for better environment variable loading


import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import path from 'path';

// Load environment variables from .env file.
// Adjust this path if your .env file is not in the parent directory.
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// --- Your specific image paths ---
const imgs = [
  '/Users/eggermann/Projekte/dailydoase/GENERATIONS/v_2-254-FLUX/1749243340776-flux.jpeg',
  '/Users/eggermann/Projekte/dailydoase/GENERATIONS/v_2-254-FLUX/1749243340949-flux.jpeg'
];
// ---------------------------------

const HF_TOKEN = process.env.HF_API_TOKEN || process.env.HF_TOKEN; // Check both for flexibility

if (!HF_TOKEN) {
    console.error("Error: Please set the HF_API_TOKEN or HF_TOKEN environment variable in your .env file.");
    process.exit(1);
}

const client = new InferenceClient(HF_TOKEN);

// Define the model ID for the FLF2V task
const MODEL_ID = 'Onekee/wan2.1';

/**
 * Generates a video from a start image, an end image, and a text prompt
 * using the Wan-AI/Wan2.1-FLF2V-14B-720P-Diffusers model via the callable client.
 *
 * @param {string} firstImagePath - Absolute path to the first image file.
 * @param {string} lastImagePath - Absolute path to the last image file.
 * @param {string} prompt - The text prompt to guide the video generation.
 * @param {object} [options] - Optional parameters for video generation.
 * @param {number} [options.height=720] - The desired height of the output video.
 * @param {number} [options.width=1280] - The desired width of the output video.
 * @param {number} [options.guidance_scale=5.5] - Controls adherence to the prompt.
 * @param {string} [options.negative_prompt="bad quality, blurry, disfigured, low resolution, artifacts"] - Negative prompt to avoid.
 * @returns {Promise<string>} - The path to the generated video file.
 */
async function generateVideoFromImages(
    firstImagePath,
    lastImagePath,
    prompt,
    options = {}
) {
    const {
        height = 720,
        width = 1280,
        guidance_scale = 5.5,
        negative_prompt = "bad quality, blurry, disfigured, low resolution, artifacts",
        // num_frames // Add this if the API supports it
    } = options;

    try {
        console.log(`Generating video for prompt: "${prompt}"...`);
        console.log(`From start image: ${firstImagePath}`);
        console.log(`To end image: ${lastImagePath}`);

        // Check if input image files exist
        if (!existsSync(firstImagePath)) {
            throw new Error(`First image file not found: ${firstImagePath}`);
        }
        if (!existsSync(lastImagePath)) {
            throw new Error(`Last image file not found: ${lastImagePath}`);
        }

        // Read images as Buffer to send as binary data
        const firstImageBuffer = readFileSync(firstImagePath);
        const lastImageBuffer = readFileSync(lastImagePath);

        console.log(`Sending request to Hugging Face Inference API for model ${MODEL_ID}...`);

        // *** IMPORTANT CHANGE HERE: Using the client as a callable function ***
        // This is the most general way to invoke an inference for any model
        // without a specific task function.
        const responseBlob = await client.request({
            model: MODEL_ID,
            inputs: {
                image: firstImageBuffer,      // 'image' for the first frame
                last_image: lastImageBuffer,  // 'last_image' for the last frame
                prompt: prompt,               // 'prompt' for the text guide
            },
            parameters: {
                height: height,
                width: width,
                guidance_scale: guidance_scale,
                negative_prompt: negative_prompt,
                // num_frames: num_frames, // Include if the API supports it
            },
            options: {
                wait_for_model: true, // Wait for model to load if it's not active
                use_cache: true,      // Use cached results if available
            }
        });

        console.log("Video generation request sent. Awaiting response...");

        // The API returns a Blob for video, typically an MP4
        const buffer = Buffer.from(await responseBlob.arrayBuffer());

        // Create an output directory if it doesn't exist
        const outputDir = path.join(__dirname, 'output_videos');
        if (!existsSync(outputDir)) {
            mkdirSync(outputDir, { recursive: true });
            console.log(`Created output directory: ${outputDir}`);
        }

        const outputFileName = `video_${Date.now()}.mp4`;
        const outputPath = path.join(outputDir, outputFileName);
        writeFileSync(outputPath, buffer);
        console.log(`Video saved to: ${outputPath}`);
        return outputPath;

    } catch (error) {
        console.error("Error during video generation:", error);
        // More robust error logging for fetch-like errors
        if (error.response) {
            console.error("API Response Status:", error.response.status);
            try {
                // Try to parse as text, as errors might not always be JSON
                const errorBody = await error.response.text();
                console.error("API Response Body:", errorBody);
            } catch (parseError) {
                console.error("Could not parse API response body as text:", parseError);
            }
        } else if (error.message && error.name) {
            // Log generic errors like network issues or non-API errors
            console.error(`Error Type: ${error.name}, Message: ${error.message}`);
        } else {
            console.error("An unexpected error occurred:", error);
        }
        throw error; // Re-throw to propagate the error
    }
}

// --- Actual Execution ---
(async () => {
    const firstImage = imgs[0];
    const lastImage = imgs[1];
    const videoPrompt = "A futuristic city at sunset, with flying cars and neon lights, transitioning from day to night.";

    try {
        const generatedVideoPath = await generateVideoFromImages(
            firstImage,
            lastImage,
            videoPrompt,
            {
                height: 720,
                width: 1280,
                guidance_scale: 6.0,
                negative_prompt: "blurry, low quality, distorted, bad aesthetics, artifacts"
            }
        );
        console.log(`Successfully generated video: ${generatedVideoPath}`);
    } catch (err) {
        console.error("Failed to generate video:", err);
    }
})();