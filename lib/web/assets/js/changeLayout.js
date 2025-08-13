import animateScrollTo from 'animated-scroll-to';
import Masonry from "masonry-layout";
import bp2 from './utilitis/bp-2.js';
import debounce from './utilitis/debounce.js';

const _ = {
    msnry: null,
    stopWhenPlaying() {
        const isPlaying = document.querySelector('.playing');

        if (isPlaying) {
            const el = document.querySelector('#playPause');
            el.click();
        }
    },
    setMasonary() {
        return ;
        _.msnry && _.msnry.destroy();

        document.body.setAttribute('layout', 'masonary')

        const elem = document.querySelector('.c-panel__images');
        _.msnry = new Masonry(elem, {
            fitWidth: true,
          //  columnWidth: 200,
            // gutter: 16,
            itemSelector: '.c-panel__image',
        });

// layout Masonry after each image loads

    },
    setLine() {
        _.msnry && _.msnry.destroy();
        document.body.setAttribute('layout', 'list');

    },
    chooseBP() {
        _.isMobile = bp2.isIn();

        if (_.isMobile) {
            _.toggleView.click();
        } else {
            _.setMasonary();
        }
    }
}


export default {
    init() {
        _.toggleView = document.querySelector('#toggleView');

        const fkt = debounce(() => {
            _.chooseBP();
        }, 600);

        window.addEventListener('resize', fkt);
        _.chooseBP();
        if (!_.toggleView) return;

        _.toggleView.addEventListener('click', () => {
            _.stopWhenPlaying();

            if (!_.toggleView.checked) {//play symbol
                _.setLine();
                _.toggleView.setAttribute('checked', 'true')
            } else {
                _.setMasonary();
                _.toggleView.removeAttribute('checked')
            }
        })
    }
}

// --- Show/hide prompts toggle ---
document.addEventListener('DOMContentLoaded', function () {
  const btn = document.querySelector('.c-aside__menu__button[data-act]');
  if (!btn) return;

  function updateBodyAttr() {
    const show = btn.getAttribute('data-act') === 'show';
    document.body.setAttribute('data-show-prompts', show ? 'true' : 'false');
    btn.textContent = show ? 'hide prompts' : 'show prompts';
  }

  btn.addEventListener('click', function () {
    const current = btn.getAttribute('data-act');
    btn.setAttribute('data-act', current === 'show' ? 'hide' : 'show');
    updateBodyAttr();
  });

  updateBodyAttr();
});
// --- End show/hide prompts toggle ---
