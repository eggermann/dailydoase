const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

// Define the variables
const sessionCookieToken = 'your_token_here';
const prompt = "a picture of a dog with a sign saying 'Hello World'";
const aspectRatio = 'landscape';  // Can be "landscape", "portrait", or "square"
const outputDir = 'images';
const enableLogging = true;

// Function to run the Python script and get the image path
async function runPythonScript() {
    return new Promise((resolve, reject) => {
        const command = `python3 run_ideogram.py "${sessionCookieToken}" "${prompt}" "${aspectRatio}" "${outputDir}" ${enableLogging}`;
        exec(command, (error, stdout, stderr) => {
            if (error) {
                return reject(`Error executing script: ${error.message}`);
            }
            if (stderr) {
                return reject(`stderr: ${stderr}`);
            }
            resolve(stdout.trim()); // Return the image path
        });
    });
}

// Function to save the image
async function saveImage(imagePath, saveAs) {
    return new Promise((resolve, reject) => {
        const readStream = fs.createReadStream(imagePath);
        const writeStream = fs.createWriteStream(saveAs);

        readStream.on('error', reject);
        writeStream.on('error', reject);

        writeStream.on('finish', resolve);

        readStream.pipe(writeStream);
    });
}

// Main function to run the script and save the image
(async () => {
    try {
        const imagePath = await runPythonScript();
        console.log(`Generated image path: ${imagePath}`);

        const saveAs = path.join(__dirname, 'saved_image.png');
        await saveImage(imagePath, saveAs);

        console.log(`Image saved as: ${saveAs}`);
    } catch (error) {
        console.error(`Error: ${error}`);
    }
})();