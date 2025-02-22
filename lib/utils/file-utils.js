import fs from "fs-extra";
import path from 'path';

async function getSortedFiles(folderPath) {
    const files = await fs.readdir(folderPath);
    if (!files.length) {
        throw new Error("No files found in the folder");
    }

    // Retrieve file stats and filter out non-files
    const fileStats = await Promise.all(
        files.map(async (file) => {
            const filePath = path.join(folderPath, file);
            try {
                const stats = await fs.stat(filePath);
                return stats.isFile() ? {file, mtime: stats.mtime} : null;
            } catch (err) {
                console.warn(`Skipping file ${file}:`, err.message);
                return null;
            }
        })
    );

    // Remove null entries (invalid or non-file items)
    const validFiles = fileStats.filter(Boolean);
    if (!validFiles.length) {
        throw new Error("No valid files found in the folder");
    }

    // Sort files by last modified date (most recent first)
    validFiles.sort((a, b) => b.mtime - a.mtime);
    return validFiles;
}

export default getSortedFiles;