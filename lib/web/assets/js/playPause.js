const _ = {
    playTimerId: 0,
    playPos: 0,
    sortedEl: null,
    showImg: (index) => {
        if (_.lastEl) {
            _.lastEl.classList.remove('active')
        }
        const nextEl = _.sortedEls[index];
        nextEl.classList.add('active');
        console.log('contentEl', _.contentEl)
        _.contentEl.innerText = nextEl.getAttribute('title')

        _.lastEl = nextEl;
    },
    startPlay() {

        _.panelElement.classList.add('playing');
        _.showImg(0);

        _.playTimerId = setInterval(() => {
            _.showImg(_.playPos++);
        }, 4000)

    },
    stopPlay() {

        clearTimeout(_.playTimerId)
        _.panelElement.classList.remove('playing');
    }
}


export default {
    init() {
        const el = document.querySelector('#playpause');
        _.panelElement = document.querySelector('.c-panel');
        _.contentEl = document.querySelector('.c-panel__content__info')
        const els = document.querySelectorAll('[data-mtime]');

        _.sortedEls = [...els].sort((a, b) => {
            return b.dataset.mtime - a.dataset.mtime;
        })


        let fullscreen = document.querySelector(".c-panel");


        fullscreen.addEventListener("click", () => {
            if (!document.fullscreenElement) {
                fullscreen?.requestFullscreen();
            } else {
                document.exitFullscreen();
            }
        });


        el.addEventListener('click', () => {
            if (!el.checked) {//play symbol
                _.startPlay();
            } else {
                _.stopPlay();
            }

        })
    }
}
