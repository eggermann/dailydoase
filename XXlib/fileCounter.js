import fs from 'fs-extra';
import { fileURLToPath } from "url";
import path from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class IncrementClientCall {
    constructor(filePath) {
        this.filePath = filePath;
        this.int = 0;

        // Load initial value from the file, if it exists
        try {
            const data = fs.readFileSync(this.filePath, 'utf-8');
            if (data) {
                this.int = parseInt(data, 10) || 0;
            }
        } catch (err) {
            // Ignore errors, as the file might not exist
        }
    }

    async deleteFile() {
        try {
            await fs.unlink(this.filePath);
        } catch (err) {
            console.error(`Error deleting file: ${err.message}`);
        }
    }

    async increment(incrementValue = 1) {
        try {
            // Check if the file exists
            if (await fs.pathExists(this.filePath)) {
                // Read the current value
                const data = await fs.readFile(this.filePath, 'utf-8');
                const currentValue = parseInt(data, 10) || 0;

                // Update the value
                const newValue = currentValue + incrementValue;
                this.int = newValue;

                // Write the new value to the file
                await fs.writeFile(this.filePath, newValue.toString());
                return newValue;
            } else {
                // File does not exist, create it with the initial value
                await fs.writeFile(this.filePath, incrementValue.toString(), { flag: 'wx' });
                this.int = incrementValue;
                return incrementValue;
            }
        } catch (err) {
            console.error(`Error during increment operation: ${err.message}`);
            throw err;
        }
    }
}

export default IncrementClientCall;