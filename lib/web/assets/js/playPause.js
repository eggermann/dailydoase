import animateScrollTo from 'animated-scroll-to';

const _ = {
    timeout: 9000,
    playTimerId: 0,
    playPos: 1,
    sortedEl: null,
    showImg: (index) => {
        let ind = index % (_.sortedEls.length - 1);

        const cntrEl = document.querySelector('.c-aside__menu [aria-current] ~.image-cntr')

        const step = () => {
            const nextEl = _.sortedEls[ind];
            nextEl.classList.add('active');
            nextEl.classList.remove('display-none');


            if (_.lastEl) {
                _.lastEl.classList.remove('active')
            }
            _.contentEl.innerText = nextEl.getAttribute('title')
            const len = Object.keys(_.sortedEls).length;
            cntrEl.innerText = len + '/' + (len - index);

            _.lastEl = nextEl;
        }
        window.requestAnimationFrame(step);


    },
    setCounter(numb) {
        _.contentEl.innerText = nextEl.getAttribute('title')
    }
    , timerDelay: [4, 1, 2, 1, 3, 1, 2, 1, 3, 1, 1, 2, 1, 1],
    startPlay() {
        _.panelElement.classList.add('playing');
        _.showImg(_.playPos++);


        const fkt = () => {
            const timeout = _.timeout;// + (_.timerDelay[_.playPos % _.timerDelay.length] * (_.timeout / 2));
            _.playTimerId = setTimeout(() => {
                _.showImg(_.playPos++);
                fkt();
            }, timeout)
        }


        _.playTimerId = setTimeout(() => {
            _.showImg(_.playPos++);
            fkt()
        }, Math.round(_.timeout / 3))

    }
    ,
    stopPlay() {

        clearTimeout(_.playTimerId)
        _.panelElement.classList.remove('playing');
    }
}


export default {
    init() {
        const el = document.querySelector('#playPause');
        if (!el) return;
        _.panelElement = document.querySelector('.c-panel');
        _.contentEl = document.querySelector('.c-panel__content__info')
        const els = document.querySelectorAll('[data-mtime]');
        els.forEach(el => {


            el.addEventListener('transitionend', function (e) {

                if (!e.target.classList.contains('active')) {
                e.target.classList.add('display-none')
                    console.log('off')
                }
            })

            el.classList.add('display-none');
        })


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
