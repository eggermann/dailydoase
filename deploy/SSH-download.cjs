const fs = require('fs')
const path = require('path')
const {NodeSSH} = require('node-ssh')
require('dotenv').config()

const ssh = new NodeSSH()

// Parse SSH configuration from environment variable
let config;
try {
    const configStr = process.env.SSH_PRIVATE_CONFIG?.replace(/^['"]|['"]$/g, '') || '';
    if (!configStr) {
        throw new Error('SSH_PRIVATE_CONFIG is not set in .env file');
    }
    config = JSON.parse(configStr);
    if (!config.host || !config.username || !config.password) {
        throw new Error('SSH configuration is missing required fields (host, username, or password)');
    }
} catch (error) {
    console.error('Error parsing SSH configuration:', error.message);
    process.exit(1);
}

const remotePath = '/home/eggman/Projekte/dailyDoase/images'
const localPath = path.join(__dirname, '..', 'images')

// Ensure local directory exists
if (!fs.existsSync(localPath)) {
    fs.mkdirSync(localPath, { recursive: true })
}

const connectWithRetry = async () => {
    const maxRetries = 3;
    for (let i = 0; i < maxRetries; i++) {
        try {
            await ssh.connect(config);
            console.log('Connected to remote server');
            return true;
        } catch (error) {
            console.error(`Connection attempt ${i + 1} failed:`, error.message);
            if (i < maxRetries - 1) {
                console.log('Retrying in 5 seconds...');
                await new Promise(resolve => setTimeout(resolve, 5000));
            }
        }
    }
    return false;
};

const downloadFile = async (remoteFile, localFile, cleanFile) => {
    const maxRetries = 3;
    for (let i = 0; i < maxRetries; i++) {
        try {
            if (!ssh.isConnected()) {
                console.log('Reconnecting to server...');
                const connected = await connectWithRetry();
                if (!connected) {
                    throw new Error('Failed to reconnect');
                }
            }
            await ssh.getFile(localFile, remoteFile);
            return true;
        } catch (error) {
            console.error(`Download attempt ${i + 1} failed for ${cleanFile}:`, error.message);
            if (i < maxRetries - 1) {
                console.log('Retrying in 5 seconds...');
                await new Promise(resolve => setTimeout(resolve, 5000));
            }
        }
    }
    return false;
};

const downloadDir = async (remotePath, localPath) => {
    try {
        // Get list of files and their types in remote directory
        const result = await ssh.execCommand('find . -type f', { cwd: remotePath })
        const files = result.stdout.split('\n').filter(file => file && file !== '.' && file !== '..')

        console.log('Total files found:', files.length)
        let downloadCount = 0
        let skipCount = 0
        let failedCount = 0
        let lastSuccessfulFile = ''

        // Download each file
        for (const file of files) {
            try {
                // Remove leading ./ from file path if present
                const cleanFile = file.startsWith('./') ? file.slice(2) : file
                const remoteFile = path.join(remotePath, cleanFile)
                const localFile = path.join(localPath, cleanFile)

                // Skip if file already exists
                if (fs.existsSync(localFile)) {
                    console.log(`Skipping ${cleanFile} - already exists`)
                    skipCount++
                    continue
                }

                // Create directory structure if it doesn't exist
                const localDir = path.dirname(localFile)
                if (!fs.existsSync(localDir)) {
                    fs.mkdirSync(localDir, { recursive: true })
                }

                console.log(`Downloading ${cleanFile}...`)
                const success = await downloadFile(remoteFile, localFile, cleanFile)
                if (success) {
                    console.log(`Successfully downloaded ${cleanFile}`)
                    downloadCount++
                    lastSuccessfulFile = cleanFile
                } else {
                    console.error(`Failed to download ${cleanFile} after all retries`)
                    failedCount++
                }
            } catch (err) {
                console.error(`Error processing ${file}:`, err.message)
                failedCount++
                continue
            }
        }

        console.log(`\nDownload process completed:`)
        console.log(`- ${downloadCount} files downloaded`)
        console.log(`- ${skipCount} files skipped (already exist)`)
        console.log(`- ${failedCount} files failed`)
        console.log(`Last successful download: ${lastSuccessfulFile}`)
    } catch (error) {
        console.error('Download process failed:', error)
    }
}

// Connect and start download
ssh.connect(config)
    .then(() => {
        console.log('Connected to remote server')
        return downloadDir(remotePath, localPath)
    })
    .then(() => {
        console.log('Download completed')
        ssh.dispose()
    })
    .catch(error => {
        console.error('Connection failed:', error)
        ssh.dispose()
    })