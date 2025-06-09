const fs = require("fs");
const path = require("path");

const JSON_EXTENSION = ".json";
const PNG_EXTENSION = ".png";

/**
 * Get file stats with symbolic link resolution
 */
function getFileStats(fullPath) {
    try {
        const lstat = fs.lstatSync(fullPath);
        if (lstat.isSymbolicLink()) {
            try {
                const linkTarget = fs.readlinkSync(fullPath);
                const realPath = path.resolve(path.dirname(fullPath), linkTarget);
                const targetStats = fs.statSync(realPath);
                return {
                    stats: targetStats,
                    resolvedPath: realPath,
                    isSymlink: true,
                    linkTarget
                };
            } catch (linkError) {
                console.warn(`Broken symlink at ${fullPath}:`, linkError);
                throw linkError;
            }
        }
        return {
            stats: lstat,
            resolvedPath: fullPath,
            isSymlink: false
        };
    } catch (error) {
        console.error(`Error getting file stats for ${fullPath}:`, error);
        throw error;
    }
}

/**
 * Create file metadata object
 */
function createFileMetadata(fileName, basePath, stats, resolvedPath) {
    // Get the immediate parent directory name
    const folderName = path.basename(path.dirname(resolvedPath));
    
    // Create URL relative to the GENERATIONS directory
    const url = path.join(folderName, fileName).replace(/^\/+/, ''); // Remove leading slashes
    
    // Replace the file extension with .json for jsonPath
    const jsonPath = resolvedPath.replace(path.extname(fileName), JSON_EXTENSION);

    return {
        file: fileName,
        ext: path.extname(fileName),
        fullPath: resolvedPath,
        folderName,
        url,
        mtime: stats.mtime,
        jsonPath,
    };
}

/**
 * Get generation data from a file
 */
async function getGeneration(fileMetadata, includeImageData = false) {
    try {
        let result = {
            src: `/${fileMetadata.url.replace(/^\/+/, '')}`,
            json: { name: fileMetadata.file },
            metadata: {
                file: fileMetadata.file,
                ext: fileMetadata.ext,
                fullPath: fileMetadata.fullPath,
                folderName: fileMetadata.folderName,
                url: fileMetadata.url,
                mtime: fileMetadata.mtime,
                jsonPath: fileMetadata.jsonPath,
                fileName: path.basename(fileMetadata.fullPath)
            }
        };

        // Read JSON metadata if it exists
        if (fileMetadata.jsonPath && fs.existsSync(fileMetadata.jsonPath)) {
            try {
                result.json = JSON.parse(await fs.promises.readFile(fileMetadata.jsonPath, "utf-8"));
            } catch (err) {
                console.warn(`Error reading JSON metadata for ${fileMetadata.jsonPath}:`, err);
            }
        }

        // Only include base64 image data if specifically requested
        if (includeImageData) {
            const imageBuffer = await fs.promises.readFile(fileMetadata.fullPath);
            result.imageBase64 = 'data:image/png;base64,' + imageBuffer.toString('base64');
        }
//console.log(`TODO--passJSON-directly maybe back to flatDB-Generation data for ${fileMetadata.file}:`, result);


        return result;
    } catch (err) {
        console.error(`Error getting generation data for ${fileMetadata.file}:`, err);
        throw err;
    }
}

module.exports = {
    getFileStats,
    createFileMetadata,
    getGeneration,
    JSON_EXTENSION,
    PNG_EXTENSION
};