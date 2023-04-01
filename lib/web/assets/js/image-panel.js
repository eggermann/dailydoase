const _ = {
    mainElClass: '.c-panel__content'
};

export default {
    init() {
        const el = document.querySelector(_.mainElClass);

        el.addEventListener('click', (ev) => {

            return;
console.log('----',ev.srcElement)

            if (ev.srcElement instanceof HTMLImageElement) {
                alert('fg')
                return false;
            }

            if (ev.target.classList.contains('c-panel__content__info')) {
                ev.preventDefault();
                ev.target.classList.toggle("clicked");

                return false;
            }
        })
    }
}
