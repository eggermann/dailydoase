// Helper to save image and config JSON metadata
import fs from 'fs-extra';
import path from 'path';


export function getItemName() {
    return `${Date.now()}`;
}



const _colorLog = (str) => {
    console.log('\x1b[36m%s\x1b[0m', str); // Cyan color
}
/**
 * Save image and config JSON metadata.
 * @param {string} imageDir - Directory to save files.
 * @param {Buffer} imageBuffer - Image data.
 * @param {string} name - Base name for files.
 * @param {string} prompt - Prompt string.
 * @param {string} endpoint - Endpoint info.
 */
export async function saveJPG(filePath, name, { buffer: imageBuffer }) {
    const itemName = name ?? getItemName(name)
    const imageName = `${itemName}.jpeg`;
    const imgPath = path.join(filePath, imageName);
    await fs.writeFile(imgPath, imageBuffer);

    _colorLog(`[saveConfigJson] Using imageDir:` + filePath);
    _colorLog(`[saveConfigJson] Saving image as:` + imgPath);



    return { name: imageName, path: imgPath };
}


export async function saveJSON(filePath, name, { prompt, endpoint }) {
    const itemName = name ?? getItemName(name)
    const jsonPath = path.join(filePath, `${itemName}.json`);

    const metadata = {
        prompt,
        endpoint,
        timestamp: new Date().toISOString()
    };

    await fs.writeJson(jsonPath, metadata, { spaces: 2 });
    return { path: jsonPath, name: itemName };
}