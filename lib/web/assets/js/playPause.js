import animateScrollTo from 'animated-scroll-to';

const _ = {
    timeout: 100 * 8,
    playTimerId: 0,
    playPos: 0,
    sortedEl: null,
    showImg: (index) => {

        let ind = index;//% (_.sortedEls.length - 1);

        const menuEl = document.querySelector('.c-aside__menu [aria-current]')

        const cntrEl = document.querySelector('.c-aside__menu [aria-current] ~.image-cntr')

        const step = () => {
            if (ind >= _.sortedEls.length ) {

                const prevEl = document.querySelector('.c-aside__menu [aria-current]');
                let li = menuEl.closest('li'); // get reference by using closest
                const ulEl = li.closest('ul');

                let nodes = Array.from(ulEl.children); // get array
                let index = nodes.indexOf(li);

                const orderPos = index - 1;//-1 ist home folder
                let nextFolder = nodes[orderPos];

                if (orderPos == 2) {
                    nextFolder = nodes[nodes.length - 1];

                }


                const nextSrc = nextFolder.querySelector('a').href + '?autoplay';

                console.log('nextFolder', nextSrc);
                document.location.href = nextSrc;

                return;
            }

            const nextEl = _.sortedEls[ind];
            nextEl.classList.add('active');
            nextEl.classList.remove('display-none');
            animateScrollTo(nextEl, {speed: 0});

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
    },
    timerDelay: [ 1],
    startPlay() {
        if (_.toggleView.checked) {//play symbol
            _.toggleView.click();
        }

        _.panelElement.classList.add('playing');
        document.body.classList.add('playing');
        _.showImg(_.playPos++);

        const fkt = () => {
            const timeout = 10000;// (_.timerDelay[_.playPos % _.timerDelay.length] * (_.timeout * 4));
            _.playTimerId = setTimeout(() => {
                _.showImg(_.playPos++);
                fkt();
            }, timeout)
        }

        _.playTimerId = setTimeout(() => {
            _.showImg(_.playPos++);
            fkt()
        }, Math.round(_.timeout))
    },
    stopPlay() {

        clearTimeout(_.playTimerId)
        _.panelElement.classList.remove('playing');
        document.body.classList.remove('playing');
    }
}


export default {
    init(workType) {
        const el = document.querySelector('#playPause');
        if (!el) return;
        _.panelElement = document.querySelector('.c-panel');
        _.contentEl = document.querySelector('.c-panel__content__info');
        _.toggleView = document.querySelector('#toggleView');

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
            return parseFloat(b.dataset.mtime) - parseFloat(a.dataset.mtime);
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
