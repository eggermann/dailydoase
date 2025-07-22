const fs = require('fs');
const path = require('path');
const express = require('express');
const app = express();

/** Initialize the application */

// ... rest of your server code ...

app.get('/:model/:folderName/:file', (req, res) => {
    const { model, folderName, file } = req.params;
    const ext = path.extname(file).toLowerCase();

    // Assume generation is obtained here based on model, folderName, file
    const generation = getGeneration(model, folderName, file);

    if (!generation) {
        res.status(404).send("File not found");
        return;
    }

    if (ext === ".mp3" || ext === ".wav" || ext === ".ogg") {
        // Audio file
        const audioPath = generation.metadata.fullPath;
        if (fs.existsSync(audioPath)) {
            let contentType = "audio/mpeg";
            if (ext === ".wav") contentType = "audio/wav";
            if (ext === ".ogg") contentType = "audio/ogg";
            const streamMedia = require('../../lib/web/assets/main.js').streamMedia;
            streamMedia(req, res, audioPath, contentType);
        } else {
            res.status(404).send("Audio file not found");
        }
    } else {
        // other file handling...
    }
});
// Show audio durations on the client side
document.addEventListener("DOMContentLoaded", () => {
    const audioElements = document.querySelectorAll("audio");

    audioElements.forEach(audio => {
        // Create a span element for showing the duration
        const durationSpan = document.createElement("span");
        durationSpan.classList.add("audio-duration");
        durationSpan.textContent = "Loading...";

        // Insert duration span after the audio element
        audio.parentNode.insertBefore(durationSpan, audio.nextSibling);

        // Load metadata and get duration
        audio.addEventListener("loadedmetadata", () => {
            const duration = audio.duration;
            if (!isNaN(duration)) {
                const minutes = Math.floor(duration / 60);
                const seconds = Math.floor(duration % 60).toString().padStart(2, '0');
                durationSpan.textContent = `${minutes}:${seconds}`;
            } else {
                durationSpan.textContent = "Unknown";
            }
        });

        // Manually trigger loading if not already started
        if (audio.preload === "metadata") {
            audio.load();
        }
    });
});