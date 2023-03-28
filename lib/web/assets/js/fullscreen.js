

export default {
    init() {


        let fullscreen = document.querySelector(".c-panel");


        fullscreen.addEventListener("click", () => {
            if (!document.fullscreenElement) {
                fullscreen?.requestFullscreen();
            } else {
                document.exitFullscreen();
            }
        });


    }
}
