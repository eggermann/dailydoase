import animateScrollTo from 'animated-scroll-to';
import Masonry from "masonry-layout";
import bp2 from './utilitis/bp-2';
import debounce from './utilitis/debounce.js';

const _ = {
    msnry: null,
    setMasonary() {
        _.msnry && _.msnry.destroy();
        document.body.setAttribute('layout', 'masonary')

        const elem = document.querySelector('.c-panel__images');
        _.msnry = new Masonry(elem, {
            // options
            itemSelector: '.c-panel__image',
        });

// layout Masonry after each image loads

    },
    setLine() {
        _.msnry && _.msnry.destroy();
        document.body.setAttribute('layout', 'list');
        const el = document.querySelector('#playPause');
        el.click();

    },
    chooseBP() {
        _.isMobile = bp2.isIn();
        if (_.isMobile) {
            _.setLine();
        } else {
            _.setMasonary();
        }
    }
}


export default {
    init() {
        const el = document.querySelector('#toggleView');

        const fkt = debounce(() => {
            _.chooseBP();
        }, 600);

        window.addEventListener('resize', fkt);
        _.chooseBP();
        if (!el) return;

        el.addEventListener('click', () => {
            if (!el.checked) {//play symbol
                _.setLine();
                el.setAttribute('checked', 'true')
            } else {
                _.setMasonary();
                el.removeAttribute('checked')
            }
        })
    }
}
