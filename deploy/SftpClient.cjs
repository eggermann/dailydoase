const Client = require("ssh2-sftp-client");

class SftpClient {
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
              //  console.log(`${new Date(file.modifyTime).toISOString()} PRE ${file.name}`);
            } else {
            //    console.log(`${new Date(file.modifyTime).toISOString()} ${file.size} ${file.name}`);
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

    async downloadFolder(remoteFolder, localFolder) {
        console.log(`Downloading ${remoteFolder} to ${localFolder} ...`);






        try {

            this.client.on('download', info => {

              console.log(`Listener: Download ${info.source}`);
            });




            let rslt = await this.client.downloadDir(remoteFolder, localFolder);
            return rslt;
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


module.exports = SftpClient;