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