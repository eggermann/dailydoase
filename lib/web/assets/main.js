import axios from 'axios';
import Masonry from 'masonry-layout';
import aos from './js/aos.js';
import playPause from './js/playPause.js';
import headroom from './js/headroom.js';
import fullscreen from './js/fullscreen.js';
import imagePanel from './js/image-panel.js';
import changeLayout from './js/changeLayout.js';

import 'aos/dist/aos.css'; // You can also use <link> for styles
import elementWithinViewport from 'element-within-viewport';
import animateScrollTo from 'animated-scroll-to';


const env = process.env.NODE_ENV;

const _ = {
    urlPrefix: '',//, env == 'development' ? '' : 'daily-doasis',
    setImage: (q) => {
        if (_.q == q) {
            console.log('same')
            return;
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
    pollingMainPageImage: () => {
        axios.get(_.urlPrefix + '/img')
            .then(function (response) {
                const q = response.data;
                _.setImage(q);
            })
            .catch(function (error) {
                // handle error
                console.log('error<-- ', error);
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
    },
    anchorScroll() {

        if (window.location.hash) {
            let selector = window.location.hash.replace('#', '');
            selector = 'img[src*="' + selector + '"]'
            const el = document.querySelector(selector);
            el.classList.add('hash-tagged')
            //console.log('++',el,window.location.hash)

            el.scrollIntoView()

        }

        const images = document.querySelectorAll('.c-panel__images img');

        [...images].forEach(el => {
            elementWithinViewport(el, {
                onEnter: (element) => {
                    if (window.history.pushState) {
                        const urlHash = "#" + el.getAttribute('id')
                        //  window.history.pushState(null, null, urlHash);
                    }
                }
            });
        });


    },
    setMenuToggle: () => {
        document.querySelector('.c-aside__menu__button')
            .addEventListener('click', () => {
                _.mainAside.classList.toggle('opened-menu')
            })
    }
};
document.addEventListener('DOMContentLoaded', async () => {
    _.isHome = document.querySelector("body.home");
    _.mainAside = document.querySelector(".c-aside__menu");

    const AOS = aos.init();
    playPause.init();
    headroom.init();
    fullscreen.init();
    imagePanel.init();
    _.setMenuToggle();

    _.mainPC = document.querySelector(".c-panel__content");
    _.mainElBG = document.querySelector(".c-panel__bg");

    document.querySelectorAll('img')
        .forEach((img) =>
            img.addEventListener('load', () => {
                    //  AOS.refresh();
                }
            )
        );

    if (!_.isHome) {
        changeLayout.init();
        _.anchorScroll();



        _.scrollToMenuPosInSubFolder();


        return;
    }

    _.pollingMainPageImage();
    window.setInterval(_.pollingMainPageImage, 3000);
});