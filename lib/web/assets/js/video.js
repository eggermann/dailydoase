// Autoplay videos when in view using IntersectionObserver
document.addEventListener("DOMContentLoaded", () => {
    const videos = document.querySelectorAll("video[autoplay][loading='lazy']");
    if (!("IntersectionObserver" in window)) {
        videos.forEach(v => {
            v.muted = true;
            v.load();
            v.play();
        });
        return;
    }
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.muted = true;
                entry.target.load();
                entry.target.play();
            } else {
                entry.target.pause();
            }
        });
    }, { threshold: 0.01 });
    videos.forEach(video => observer.observe(video));
});