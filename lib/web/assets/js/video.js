// Lazy-load and autoplay videos when in view using IntersectionObserver
// Strategy:
//  - Do not set the real src in markup. Use data-src + preload="none" instead.
//  - When an element becomes visible, move data-src -> src, then load() and play().
//  - When it leaves, pause it. Swallow play() AbortError warnings caused by rapid toggling.

document.addEventListener("DOMContentLoaded", () => {
    const videos = document.querySelectorAll("video[preload='none'][data-src]");

    // Fallback for older browsers without IntersectionObserver
    if (!("IntersectionObserver" in window)) {
        videos.forEach(v => {
            if (!v.src && v.dataset.src) v.src = v.dataset.src;
            v.muted = true;
            v.load();
            const p = v.play();
            if (p && typeof p.catch === "function") p.catch(() => {});
        });
        return;
    }

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            const v = entry.target;
            if (entry.isIntersecting) {
                if (!v.src && v.dataset.src) {
                    // Prefer setting the video element src directly (no <source> required)
                    v.src = v.dataset.src;
                } else if (!v.currentSrc) {
                    // If the markup used <source data-src>, upgrade it
                    const s = v.querySelector("source[data-src]");
                    if (s && !s.src) s.src = s.dataset.src;
                }
                v.muted = true; // autoplay policy
                v.load();
                const p = v.play();
                if (p && typeof p.catch === "function") {
                    // Ignore AbortError when play() is interrupted by a pause()
                    p.catch(() => {});
                }
            } else {
                if (!v.paused) v.pause();
            }
        });
    }, { root: null, rootMargin: "200px 0px", threshold: 0.25 });

    videos.forEach(video => observer.observe(video));
});