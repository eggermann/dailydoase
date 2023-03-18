// sftp.js
//
// Use this sample code to connect to your SFTP To Go server and run some file operations using Node.js.
//
// 1) Paste this code into a new file (sftp.js)
//
// 2) Install dependencies
//   npm install ssh2-sftp-client@^8.0.0
//
// 3) Run the script
//   node sftp.js
//
// Compatible with Node.js >= v12
// Using ssh2-sftp-client v8.0.0

const configPath = process.env.HOME + '/Documents/config-data/eggman';
const config = require(configPath);
const destinationPath = 'Projekte/dailyDoase';
const fs = require('fs')

let Client = require('ssh2-sftp-client');



class SFTPClient {
    constructor() {
        this.client = new Client();
    }

    async connect(options) {
        console.log(`Connecting to ${options.host}:${options.port}`);
        try {
            await this.client.connect(options);
        } catch (err) {
            console.log('Failed to connect:', err);
        }
    }

    async disconnect() {
        await this.client.end();
    }

    async listFiles(remoteDir, fileGlob) {
        console.log(`Listing ${remoteDir} ...`);
        let fileObjects;
        try {
            fileObjects = await this.client.list(remoteDir, fileGlob);
        } catch (err) {
            console.log('Listing failed:', err);
        }

        const fileNames = [];

        for (const file of fileObjects) {
            if (file.type === 'd') {
                console.log(`${new Date(file.modifyTime).toISOString()} PRE ${file.name}`);
            } else {
                console.log(`${new Date(file.modifyTime).toISOString()} ${file.size} ${file.name}`);
            }

            fileNames.push(file.name);
        }

        return fileNames;
    }

    async uploadFile(localFile, remoteFile) {
        console.log(`Uploading ${localFile} to ${remoteFile} ...`);
        try {
            await this.client.put(localFile, remoteFile);
        } catch (err) {
            console.error('Uploading failed:', err);
        }
    }


    async uploadFolder(localFile, remoteFile) {
        console.log(`Uploading FOLDER ${localFile} to ${remoteFile}`);
        try {
            await this.client.uploadDir(localFile, remoteFile);
        } catch (err) {
            console.error(err);
        } finally {
            this.client.end();
        }
    }


    async downloadFile(remoteFile, localFile) {
        console.log(`Downloading ${remoteFile} to ${localFile} ...`);
        try {
            await this.client.get(remoteFile, localFile);
        } catch (err) {
            console.error('Downloading failed:', err);
        }
    }

    async deleteFile(remoteFile) {
        console.log(`Deleting ${remoteFile}`);
        try {
            await this.client.delete(remoteFile);
        } catch (err) {
            console.error('Deleting failed:', err);
        }
    }
}

(async () => {
    //const parsedURL = new URL(process.env.SFTPTOGO_URL);
    const port = 22;
    //const {host, username, password} = parsedURL;

    //* Open the connection
    const client = new SFTPClient();
    await client.connect({
        host: config.host,
        port,
        username: config.user,
        password: config.password
    });


    //* List working directory files
    await client.listFiles(destinationPath);

    const fileNames = ['composition.js', 'start.js', 'exemplar-cntr.txt', 'folder-cntr.txt', 'package.json'];


    const uploads = fileNames.map(async name => {
        return client.uploadFile(__dirname + '/' + name, destinationPath + '/' + name);
    });

    const folders = fs.readdirSync(__dirname + '/images')

    const uploadsFolder = folders.map(async name => {
        return Promise.resolve();

        const path = __dirname + '/images/' + name;
        console.log(path);

        return client.uploadFolder(path, destinationPath+ '/images/' + name);
    });


    await Promise.all(uploads)
    await Promise.all(uploadsFolder)


    return Promise.resolve();
})();
