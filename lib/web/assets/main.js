import axios from 'axios';

import aos from './js/aos';
import playPause from './js/playPause';
import 'aos/dist/aos.css'; // You can also use <link> for styles
import animateScrollTo from 'animated-scroll-to';
const env=process.env.NODE_ENV;
console.log('++',env);

const _ = {
    urlPrefix:env=='development'?'':'daily-doasis',
    setImage: (q) => {
        if (_.q === q) {
            console.log('same')
        }

        _.q = q;
        _.mainElBG.setAttribute('src', 'data:image/png;base64, ' + q.imageBase64)// =''.backgroundImage = `url('${q.thumbnail}')`//  "url('"+ thumbnail+')";

        const info = JSON.parse(JSON.stringify(q));
        const o = JSON.parse(JSON.stringify(info)).json
        const p = JSON.parse(JSON.stringify(o));

        const obj = JSON.parse(p);
        const prompt = obj.prompt;

        const oInfo = document.querySelector('.c-panel__content__info');
        oInfo && oInfo.remove();

        const infEl = document.createElement('div');
        infEl.classList.add('c-panel__content__info');

        const pEl = document.createElement('p');
        const text = document.createTextNode(prompt);
        pEl.appendChild(text);

        infEl.appendChild(pEl);
        _.mainPC.appendChild(infEl)
    },
    polling: () => {
console.log(_.urlPrefix+'/img')
        axios.get(_.urlPrefix+'/img')
            .then(function (response) {
                const q = response.data;
                _.setImage(q);
            })
            .catch(function (error) {
                // handle error
                console.log(error);
            })
            .finally(function () {
                // always executed
            });
    },
    scrollToMenuPosInSubFolder() {
        if (!_.isHome) {
       document.querySelector('.c-aside__menu [aria-current]').focus()
         /*  ;

            _.mainAside.*/
        }
    }
};
document.addEventListener('DOMContentLoaded', async () => {
    _.isHome = document.querySelector("body.home");

    aos.init();
    playPause.init();
    _.mainPC = document.querySelector(".c-panel__content");
    _.mainElBG = document.querySelector(".c-panel__bg");
    _.mainAside = document.querySelector(".c-aside__menu");
    _.scrollToMenuPosInSubFolder();
    _.polling();

    window.setInterval(_.polling, 3000);
});