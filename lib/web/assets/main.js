import axios from 'axios';
import Masonry from 'masonry-layout';
import aos from './js/aos.js';
import headroom from './js/headroom.js';
import fullscreen from './js/fullscreen.js';
import imagePanel from './js/image-panel.js';
import changeLayout from './js/changeLayout.js';
import slider from './js/slider.js';

// Import required Swiper styles
import 'aos/dist/aos.css';
import 'swiper/css';
import 'swiper/css/navigation';
import 'swiper/css/pagination';
import 'swiper/css/effect-fade';

import elementWithinViewport from 'element-within-viewport';
import animateScrollTo from 'animated-scroll-to';

const env = process.env.NODE_ENV;

const _ = {
    urlPrefix: '',
    lastImageId: null, // Track last image to prevent duplicates
    setImage: (q) => {
        // Prevent reloading the same image
        if (_.lastImageId === q.metadata?.filePath) {
            return;
        }
        _.lastImageId = q.metadata?.filePath;

        // Set image with proper base64 handling
        if (q.imageBase64) {
            _.mainElBG.setAttribute('src', q.imageBase64);
        }

        // Clear existing info
        const oInfo = document.querySelector('.c-panel__content__info');
        oInfo && oInfo.remove();

        console.log('Image data:', q);

        // Create new info element
        try {
            let prompt = '';
            if (typeof q.json === 'string') {
                const json = JSON.parse(q.json);
                prompt = json.prompt || '';
            } else if (q.json?.prompt) {
                prompt = q.json.prompt;
            }

            if (prompt) {
                const infEl = document.createElement('div');
                infEl.classList.add('c-panel__content__info');
                const pEl = document.createElement('p');
                pEl.textContent = prompt;
                infEl.appendChild(pEl);
                _.mainPC.appendChild(infEl);
            }
        } catch (err) {
            console.warn('Error parsing image info:', err);
        }
    },

    pollingMainPageImage: () => {
        // Only poll if tab is visible
        if (document.hidden) return;

        axios.get(_.urlPrefix + '/img')
            .then(function (response) {
                _.setImage(response.data);
            })
            .catch(function (error) {
                console.warn('Error fetching image:', error);
            });
    },

    scrollToMenuPosInSubFolder() {
        if (!_.isHome) {
            const current = document.querySelector('.c-aside__menu [aria-current]');
            current?.focus();
        }
    },

    anchorScroll() {
        if (window.location.hash) {
            let selector = window.location.hash.replace('#', '');
            selector = 'img[src*="' + selector + '"]';
            const el = document.querySelector(selector)?.parentNode;
            if (el) {
                el.classList.add('hash-tagged');
                el.scrollIntoView();
            }
        }

        const images = document.querySelectorAll('.c-panel__images img');
        [...images].forEach(el => {
            elementWithinViewport(el, {
                onEnter: (element) => {
                    if (window.history.pushState) {
                        const urlHash = "#" + el.getAttribute('id');
                        window.history.pushState(null, '', urlHash);
                    }
                }
            });
        });
    },

    setMenuToggle: () => {
        document.querySelector('.c-aside__menu__button')?.addEventListener('click', () => {
            _.mainAside.classList.toggle('opened-menu');
        });
    }
};

document.addEventListener('DOMContentLoaded', async () => {
    _.isHome = document.querySelector("body.home");
    _.mainAside = document.querySelector(".c-aside__menu");

    const AOS = aos.init();

    // Initialize slider for image slideshow
    slider.init();
    headroom.init();
    fullscreen.init();
    imagePanel.init();
    _.setMenuToggle();

    _.mainPC = document.querySelector(".c-panel__content");
    _.mainElBG = document.querySelector(".c-panel__bg");

    // Lazy load images
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.addEventListener('load', () => {
                    observer.unobserve(entry.target);
                });
            }
        });
    });

    document.querySelectorAll('img').forEach(img => observer.observe(img));

    if (!_.isHome) {
        changeLayout.init();
        _.anchorScroll();
        _.scrollToMenuPosInSubFolder();
        return;
    }

    // Initial load
    _.pollingMainPageImage();
    
    // Only poll when tab is visible
    let pollInterval = window.setInterval(_.pollingMainPageImage, 3000);
    
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            window.clearInterval(pollInterval);
        } else {
            _.pollingMainPageImage(); // Immediate poll when becoming visible
            pollInterval = window.setInterval(_.pollingMainPageImage, 3000);
        }
    });

    // Cleanup on page unload
    window.addEventListener('beforeunload', () => {
        slider.destroy();
        observer.disconnect();
        window.clearInterval(pollInterval);
    });
});