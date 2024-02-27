export default {
    init() {
        const el = document.querySelector('.c-panel__list');
        if (!el) {//home;
            return
        }

        [...el.querySelectorAll('.c-panel__list__item')].forEach(actEl => {
            actEl.addEventListener('click', () => {
                const oldEl = el.querySelector('.active-image');
                oldEl && oldEl.classList.remove('active-image')
                actEl.classList.add('active-image');
            })
        })
        return;

        el.addEventListener('click', (ev) => {
            if (ev.srcElement instanceof HTMLImageElement) {
                //  alert('img')
                return false;
            }

            if (ev.target.classList.contains('c-panel__image')) {
                ev.preventDefault();
                ev.target.classList.toggle('clicked');

                return false;
            }

            if (ev.target.classList.contains('c-panel__content__info')) {
                ev.preventDefault();
                ev.target.classList.toggle("clicked");

                return false;
            }
        });
    }
}
