export default {
    init() {
        const el = document.querySelector('.c-panel__list');
        if (!el) {//home;
            return
        }

        // Activate clicked panel item (fix selector to match markup)
        [...el.querySelectorAll('.c-panel__item')].forEach(actEl => {
            actEl.addEventListener('click', () => {
                const oldEl = el.querySelector('.active-image');
                oldEl && oldEl.classList.remove('active-image');
                actEl.classList.add('active-image');
            });
        });

        // Toggle expanded/collapsed prompt view on click
        [...document.querySelectorAll('.c-panel__item__infos')].forEach(infoEl => {
            infoEl.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                infoEl.classList.toggle('is-expanded');
            });
        });
    }
}
