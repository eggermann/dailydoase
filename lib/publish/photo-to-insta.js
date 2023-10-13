import {IgApiClient} from 'instagram-private-api';
import https from 'https';
import fs from 'fs';
import axios from 'axios'


/* tslint:disable:no-console */
import 'dotenv/config';
import readline from 'readline';

const filePath = './savedTOINsta.txt'; // Replace with the path to your file
const publishListFilePath = './publish-list.txt'; // Replace with the path to your file

//console.log(process.env.IG_USERNAME, process.env.IG_PROXY,process.env.IG_PASSWORD);
const _ = {
    igApiClient: null,
    creteFile(p) {
        if (!fs.existsSync(p)) {
            // If the file doesn't exist, create it
            fs.writeFileSync(p, '');
            console.log(`File '${p}' created.`);
        }
    },

    async saveToPublishFile(url) {
        const fileContents = fs.readFileSync(publishListFilePath, 'utf8');

        if (!fileContents.includes(url) /*|| false*/) {
            try {
                fs.appendFileSync(filePath, url + '\n');
            } catch (e) {
                console.log(e)
            }

        } else {
            console.log('Line already exists in the file: ' + publishListFilePath);
        }

    },
    async postToInstaFromPublishFile() {
// Read the file contents
        const fileContents = fs.readFileSync(publishListFilePath, 'utf8');

// Split the contents into lines
        const lines = fileContents.split('\n');

// Get the first line
        const firstLine = lines[0];

// Delete the first line by removing it from the array
        lines.shift();

// Join the remaining lines back into a single string
        const modifiedContents = lines.join('\n');

// Write the modified contents back to the file
        fs.writeFileSync(publishListFilePath, modifiedContents, 'utf8');

        console.log('First line:', firstLine);

        _.postTOInsta(firstLine)
    },
    async postTOInsta(url) {
        const fileContents = fs.readFileSync(filePath, 'utf8');

        if (!fileContents.includes(url) /*|| false*/) {
            let description = '';

            try {
                const responseJson = await axios(url)
                const json = url.replace('.png/img', '.json')
                // getting random square image from internet as a Buffer
                const response = await axios(json)
                description = response.data.description;
                console.log(description)

            } catch (e) {
                console.log(e);

            }

            try {
                const regex = /\/v\/([^/]+)/;

// Use the match() method to extract the folder
                const match = url.match(regex);
                let folder = '';
                if (match) {
                    folder = match[1];

                }

                // getting random square image from internet as a Buffer
                const response = await axios(url, {responseType: 'arraybuffer'})

                const publishResult = await _.igApiClient.publish.photo({
                    file: response.data, // image buffer, you also can specify image from your disk using fs
                    caption: `\n ${description} 🌴  https://dailydoase.de/v/${folder} \nstablediffusion 1.5`, // nice caption (optional)
                });
                //     console.log(publishResult);
                fs.appendFileSync(filePath, url + '\n');
            } catch (e) {
                console.log(e)
            }

        } else {
            console.log('Line already exists in the file: ' + url);
        }

        return;
    }
}

export default async function init() {
    _.creteFile(filePath);
    _.creteFile(publishListFilePath);

    _.igApiClient = new IgApiClient();
    _.igApiClient.state.generateDevice(process.env.IG_USERNAME);
    // ig.state.proxyUrl = process.env.IG_PROXY;
    _.auth = await _.igApiClient.account.login(process.env.IG_USERNAME, process.env.IG_PASSWORD);
    //  console.log(JSON.stringify(auth));ig.publish

//https://dailydoase.de/v/192-HF-/1-1097.png/img
    //https://dailydoase.de/v/195-HF-/1-2967.png/img
    //198-HF-/1-7346.png/img
//    https://dailydoase.de/v/198-HF-/1-12829.png/img
    //https://dailydoase.de/v/170-HF-/1-19257.png/img
    //https://dailydoase.de/v/170-HF-/1-18912.png/img
    //https://dailydoase.de/v/170-HF-/1-19856.png/img
    //https://dailydoase.de/v/169-HF-/1-17140.png/img
    //https://dailydoase.de/v/170-HF-/1-19938.png/img
    //https://dailydoase.de/v/169-HF-/1-17202.png/img
    //https://dailydoase.de/v/198-HF-/1-12829.png/img
    //https://dailydoase.de/v/198-HF-/1-14397.png/img
    //   https://dailydoase.de/v/198-HF-/1-14436.png/img


//https://dailydoase.de/v/177-HF-/1-20498.png/img
    const folder = '198-HF-', file = '1-14436'
    const url = `https://dailydoase.de/v/${folder}/${file}.png/img`

    _.postTOInsta(url);
    // _.postToInstaFromPublishFile();

}

export const saveToPublishFile = _.saveToPublishFile;
init();