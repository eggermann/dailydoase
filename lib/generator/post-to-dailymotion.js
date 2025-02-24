import axios from 'axios';
import fs from 'fs-extra';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import createFileName from './createFileName.js'; // Assuming this utility is available
import PostTo from './PostTo.js'; // Assuming PostTo is a base class
import store from '../store.js'; // Assuming store is a shared module for file tracking

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from .env file
dotenv.config();

// Retrieve API credentials from environment variables
const _DM_API_KEY = process.env.DM_API_KEY;
const _DM_API_SECRET = process.env.DM_API_SECRET;

if (!_DM_API_KEY || !_DM_API_SECRET) {
    throw new Error("Dailymotion API key or secret is not set. Check your .env file.");
}

// Define the core configuration and class structure
const _ = {
    config: {
        folderName: 'dailymotion',
        description: 'call Dailymotion API',
    },
    filmControl: {
        dailymotion: new Set(), // Tracks seen video URLs to avoid duplicates
    },
    DailymotionAPI: class extends PostTo {
        constructor(config) {
            super(config);
            // Merge default config with provided config
            this.config = { ..._.config, ...config };
            // Set folder name dynamically if 'words' is provided, else use default
            this.config.folderName = this.config.words ? createFileName(this.config) : this.config.folderName;
            // Define the directory for saving metadata
            this.imageDir = path.join(__dirname, '../../GENERATIONS/dailymotion');
            // Initialize the store cache for this directory
            store.initCache(this.imageDir);
        }

        /**
         * Constructs the Dailymotion API query URL with API key
         * @param {string} q - Search query
         * @returns {string} - API URL
         */
        getQuery(q) {
            q = encodeURIComponent(q);
            const limit = 10; // Fetch 10 videos to find up to 3 new ones
            return `https://api.dailymotion.com/videos?fields=id,title,url,owner.screenname,created_time,thumbnail_url,duration,allow_embed&search=${q}&limit=${limit}&api_key=${_DM_API_KEY}`;
        }

        /**
         * Fetches videos from Dailymotion and saves metadata for up to 3 new videos
         * @param {string} prompt - Search term
         * @param {object} options - Additional options (optional)
         * @returns {Promise<boolean>} - Success or failure
         */
        async prompt(prompt, options = {}) {
            const fileLimit = 10; // Maximum number of files before stopping
            if (store.totalFiles() > fileLimit) {
                console.log('Enough items in buffer:', store.totalFiles());
                return false;
            }

            try {
                const totalPrompt = this.addStaticPrompt(prompt, options); // Assuming addStaticPrompt is inherited
                const jsonPath = this.imageDir;
                await fs.ensureDir(jsonPath); // Ensure the directory exists

                const url = this.getQuery(totalPrompt);
                console.log('Fetching URL:', url);

                // Include the API secret in headers for authentication (if required by Dailymotion)
                const response = await axios.get(url, {
                    headers: {
                        'Authorization': `Bearer ${_DM_API_SECRET}`, // Adjust based on Dailymotion's auth requirements
                    },
                });
                console.log('API Response:', response.data);

                const videos = response.data.list;
                if (!videos || videos.length === 0) {
                    // If no results, remove the first word and retry
                    const arr = prompt.split(' ');
                    arr.shift();
                    const newPrompt = arr.join(' ');
                    if (!newPrompt) return true; // Return true if prompt is empty
                    return await this.prompt(newPrompt, options);
                }

                let newVideos = 0;
                for (const [index, item] of videos.entries()) {
                    if (newVideos >= 3) break; // Limit to 3 new videos
                    // Skip if video is a duplicate or from "wikivideos"
                    if (_.filmControl.dailymotion.has(item.url) || item['owner.screenname'] === "wikivideos") {
                        continue;
                    }
                    _.filmControl.dailymotion.add(item.url); // Mark as seen

                    // Process video metadata
                    item.link = item.url;
                    item.time = item.duration;
                    item.user = item['owner.screenname'];
                    const date = new Date(item.created_time * 1000); // Dailymotion uses Unix timestamp in seconds
                    const formattedDate =
                        date.getFullYear() + '-' +
                        String(date.getMonth() + 1).padStart(2, '0') + '-' +
                        String(date.getDate()).padStart(2, '0');
                    item.publishedAt = formattedDate;

                    // Save metadata to a JSON file
                    const name = `dm-${Date.now()}-${index}.json`;
                    const jsonObj = JSON.stringify(item, null, 2);
                    await fs.writeFile(path.join(jsonPath, name), jsonObj, 'utf-8');
                    store.addFile(jsonPath, name); // Update store
                    console.log(`Saved metadata: ${name}`);
                    newVideos++;
                }

                if (newVideos === 0) {
                    // If no new videos, retry with modified prompt
                    const arr = prompt.split(' ');
                    arr.shift();
                    const newPrompt = arr.join(' ');
                    if (!newPrompt) return true;
                    return await this.prompt(newPrompt, options);
                }

                return true;
            } catch (error) {
                if (error.response) {
                    console.error('API Error Response:', {
                        status: error.response.status,
                        data: error.response.data,
                    });
                } else if (error.request) {
                    console.error('No response received:', error.request);
                } else {
                    console.error('Unexpected error:', error.message);
                }
                return false;
            }
        }
    },
};

// Export the API with an init method
export default {
    config: _.config, // Expose default config
    init: (config) => new _.DailymotionAPI(config), // Initialize with provided config
};


const i = new _.DailymotionAPI(
    {words: [['Robotics', 'en']]
    });
i.prompt('xxx').then(async (result) => {
    console.log(result);

});