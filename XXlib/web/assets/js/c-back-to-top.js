import animateScrollTo from 'animated-scroll-to';
import debounce from '../utilities/debounce';
import focusable from 'focusable';
import LazyLoad from 'vanilla-lazyload';


let _sign = -1;

export default () => {
    const el = document.querySelector('.js_backToTop');
    if (!el) {
        return;
    }

    el.onclick = () => {
        return;

        if(['xs', 'sm'].includes(frBreakpoints.getCurrentViewport())) {
            animateScrollTo(0);
        } else {
            const el = document.querySelector(focusable);
            animateScrollTo(el).then(()=>{
                el.focus();
            });
        }
    };

    const fkt = debounce(() => {
        const vh = Math.max(document.documentElement.clientHeight || 0, window.innerHeight || 0);
        const newSign = (vh <= window.scrollY) ? 0 : 1;

        if (newSign !== _sign) {

            if (newSign) {
                el.style.display = 'none';
            } else {
                el.style.display = 'block';
            }
        }

        _sign = newSign;
    });

    window.addEventListener('scroll', fkt, true);
}
