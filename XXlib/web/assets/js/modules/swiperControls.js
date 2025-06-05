export function createKeyboardHandler(swiper, toggleSlideshow) {
    return function handleKeyPress(event) {
        if (!swiper) return;

        switch (event.key) {
            case ' ':
                event.preventDefault();
                if (swiper.autoplay.running) {
                    swiper.autoplay.stop();
                } else {
                    swiper.autoplay.start();
                }
                break;
            case 'Escape':
                event.preventDefault();
                toggleSlideshow();
                break;
            case 'ArrowLeft':
                event.preventDefault();
                swiper.slidePrev();
                break;
            case 'ArrowRight':
                event.preventDefault();
                swiper.slideNext();
                break;
        }
    };
}

export function attachControlHandlers(playPauseBtn, label, toggleSlideshow) {
    // Handle click events
    const handleClick = (event) => {
        event.preventDefault();
        event.stopPropagation();
        toggleSlideshow();
    };

    // Reset checkbox state
    playPauseBtn.checked = false;

    // Remove any existing event listeners
    const newBtn = playPauseBtn.cloneNode(true);
    playPauseBtn.parentNode.replaceChild(newBtn, playPauseBtn);

    // Add fresh event listeners
    newBtn.addEventListener('click', handleClick);
    if (label) {
        const newLabel = label.cloneNode(true);
        label.parentNode.replaceChild(newLabel, label);
        newLabel.addEventListener('click', handleClick);
    }

    return { button: newBtn, handleClick };
}

export function handleAutoplayParameter(toggleSlideshow) {
    if (window.location.search.includes('autoplay')) {
        setTimeout(() => {
            toggleSlideshow();
        }, 1000);
    }
}

// Event cleanup helper
export function cleanupEvents(keyboardHandler, clickHandler, button, label) {
    if (keyboardHandler) {
        document.removeEventListener('keydown', keyboardHandler);
    }
    if (clickHandler) {
        button?.removeEventListener('click', clickHandler);
        label?.removeEventListener('click', clickHandler);
    }
}