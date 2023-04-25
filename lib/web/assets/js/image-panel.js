const _ = {
    mainElClass: '.c-panel__image'
};

export default {
    init() {
        const el = document.querySelector('.c-panel__images');
if(!el){//home;
    return }
        el.addEventListener('click', (ev) => {


            if (ev.srcElement instanceof HTMLImageElement) {
              //  alert('img')
                return false;
            }

            if (ev.target.classList.contains('c-panel__image')) {
                ev.preventDefault();
                ev.target.classList.toggle("clicked");

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
