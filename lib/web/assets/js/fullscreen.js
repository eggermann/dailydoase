import animateScrollTo from 'animated-scroll-to';


export default {
    init() {


        let fullscreen = document.querySelector(".c-panel");
        fullscreen.addEventListener("click", (ev) => {

            if (!document.fullscreenElement) {
                fullscreen.requestFullscreen()
                    .then(() => {
                        animateScrollTo(ev.srcElement, {speed: 500})
                        if (ev.srcElement instanceof HTMLImageElement) {
                        }
                    });
            } else {
                const id = window.location.hash.replace('#', '');
                const el = document.getElementById(id);

                document.exitFullscreen()
                animateScrollTo(el, {speed: 500});
            }


        });


    }
}
