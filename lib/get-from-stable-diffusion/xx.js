const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const port = 3000; // Change this to your desired port

// Define the route to send the newest file
app.get('/sendNewestFile', (req, res) => {
    const folderPath = './your-folder'; // Replace with the path to your folder

    // Read the files in the folder
    fs.readdir(folderPath, (err, files) => {
        if (err) {
            console.error('Error reading folder:', err);
            return res.status(500).send('Internal Server Error');
        }

        // Filter out non-files (e.g., directories)
        const fileStats = files
            .map((file) => {
                const filePath = path.join(folderPath, file);
                const stats = fs.statSync(filePath);
                return { file, stats };
            })
            .filter((item) => item.stats.isFile());

        // Sort files by modification time in descending order
        fileStats.sort((a, b) => b.stats.mtime - a.stats.mtime);

        if (fileStats.length === 0) {
            return res.status(404).send('No files found in the folder');
        }

        const newestFile = fileStats[0].file;
        const filePath = path.join(folderPath, newestFile);

        // Send the newest file as a response
        res.download(filePath, (err) => {
            if (err) {
                console.error('Error sending file:', err);
                return res.status(500).send('Internal Server Error');
            }
        });
    });
});

app.listen(port, () => {
    console.log(`Server is listening on port ${port}`);
});
