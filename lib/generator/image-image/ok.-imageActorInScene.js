
import { InferenceClient } from "@huggingface/inference";
import fs from "node:fs/promises";
import { fileFromPath } from "formdata-node/file-from-path";
import dotenv from "dotenv";
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import path from 'path';
dotenv.config();

async function main() {
  const token = process.env.HF_API_TOKEN;
  if (!token || typeof token !== "string") {
    throw new Error("HF_API_TOKEN environment variable is required and must be a string");
  }
  console.log("Token length:", token.length);

  // Instantiate correctly with token
  const hf = new InferenceClient(token);

  const model = "black-forest-labs/FLUX.1-Kontext-dev";
  const imagePath = path.join(__dirname, '..', 'test.datas/A.jpeg')
  const imageFile = await fileFromPath(imagePath);

  const result = await hf.imageToImage({
    model: model,
    inputs: imageFile,
    parameters: {
      prompt: "a scene of a woman and a panda fighting together on Mars as cinematic sci-fi art",
      guidance_scale: 2.5,
      num_inference_steps: 28,
      seed: 0,
      width: 1280,   // 16:9 aspect ratio width
      height: 720,   // 16:9 aspect ratio height
    },
  });

  const buffer = Buffer.from(await result.arrayBuffer());
  await fs.writeFile("A-edited.png", buffer);
  console.log("✅ Saved edited image as A-edited.png (16:9 aspect ratio)");
}

main().catch(err => {
  console.error("Error:", err);
  process.exit(1);
});