import animateScrollTo from 'animated-scroll-to';

const _ = {
    timeout:9000,
    playTimerId: 0,
    playPos: 0,
    sortedEl: null,
    showImg: (index) => {
        if (_.lastEl) {
            _.lastEl.classList.remove('active')
        }
        const nextEl = _.sortedEls[index];
        nextEl.classList.add('active');

        _.contentEl.innerText = nextEl.getAttribute('title')
        const cntrEl  = document.querySelector('.c-aside__menu [aria-current] ~.image-cntr')
        const len=Object.keys(_.sortedEls).length;
        cntrEl.innerText =len + '/'+(len - index);

        _.lastEl = nextEl;
    },
    setCounter(numb) {
        _.contentEl.innerText = nextEl.getAttribute('title')
    }
    ,
    startPlay() {
        animateScrollTo(document.querySelector('.c-panel'))
        _.panelElement.classList.add('playing');
        _.showImg(0);

        _.playTimerId = setInterval(() => {
            _.showImg(_.playPos++);
        }, _.timeout)

    }
    ,
    stopPlay() {

        clearTimeout(_.playTimerId)
        _.panelElement.classList.remove('playing');
    }
}


export default {
    init() {
        const el = document.querySelector('#playpause');
        if (!el) return;
        _.panelElement = document.querySelector('.c-panel');
        _.contentEl = document.querySelector('.c-panel__content__info')
        const els = document.querySelectorAll('[data-mtime]');

        _.sortedEls = [...els].sort((a, b) => {
            return b.dataset.mtime - a.dataset.mtime;
        })

        el.addEventListener('click', () => {
            if (!el.checked) {//play symbol
                _.startPlay();
                el.setAttribute('checked', 'true')
            } else {
                _.stopPlay();
                el.removeAttribute('checked')

            }

        })
    }
}
