import { Swiper } from 'swiper';
import { Navigation, Pagination, Autoplay, EffectFade, Keyboard } from 'swiper/modules';
import 'swiper/css/effect-fade';

let swiper = null;

const sliderModule = {
    init: function(type) {
        const playPauseBtn = document.querySelector('#playPause');
        if (!playPauseBtn) return;

        // Reset checkbox state on init
        playPauseBtn.checked = false;

        const panelElement = document.querySelector('.c-panel');
        const contentEl = document.querySelector('.c-panel__content__info');

        // Initialize swiper container
        const swiperContainer = document.createElement('div');
        swiperContainer.className = 'swiper';
        swiperContainer.setAttribute('tabindex', '0');
        
        // Add navigation elements
        const prevButton = document.createElement('div');
        prevButton.className = 'swiper-button-prev';
        const nextButton = document.createElement('div');
        nextButton.className = 'swiper-button-next';
        
        // Add pagination
        const pagination = document.createElement('div');
        pagination.className = 'swiper-pagination';
        
        const swiperWrapper = document.createElement('div');
        swiperWrapper.className = 'swiper-wrapper';

        // Add slides
        const images = document.querySelectorAll('[data-mtime]');
        if (images.length === 0) return;

//      sort((a, b) => parseFloat(b.dataset.mtime) - parseFloat(a.dataset.mtime))
      [...images].forEach(img => {
                     const slide = document.createElement('div');
                     slide.className = 'swiper-slide';
                     slide.appendChild(img.cloneNode(true));
                     swiperWrapper.appendChild(slide);
                 });




        swiperContainer.appendChild(swiperWrapper);
        swiperContainer.appendChild(prevButton);
        swiperContainer.appendChild(nextButton);
        swiperContainer.appendChild(pagination);
        panelElement.appendChild(swiperContainer);

        // Function to toggle slideshow
        const toggleSlideshow = () => {
            const isPlaying = !playPauseBtn.checked;
            console.log('Toggling slideshow:', isPlaying ? 'start' : 'stop');

            if (isPlaying) {
// Swiper event: play/pause videos on slide change
if (swiper) {
    swiper.on('slideChange', () => {
        // Pause all videos in slides
        document.querySelectorAll('.swiper-slide video').forEach(v => {
            v.pause();
            v.currentTime = 0;
        });
        // Play video in active slide
        const activeSlide = document.querySelector('.swiper-slide-active');
        if (activeSlide) {
            const video = activeSlide.querySelector('video');
            if (video) {
                video.muted = true;
                video.load();
                video.play();
            }
        }
    });
}
                // Always start autoplay when turning on slideshow
                const autoplayConfig = {
                    delay: 5000,
                    disableOnInteraction: false,
                    waitForTransition: true
                };
                // Start slideshow
                if (!swiper) {
                    swiper = new Swiper('.swiper', {
                        modules: [Navigation, Pagination, Autoplay, EffectFade, Keyboard],
                        effect: 'fade',
                        fadeEffect: {
                            crossFade: true
                        },
                        speed: 800,
                        direction: 'horizontal',
                        loop: true,
                        spaceBetween: 0,
                        autoplay: autoplayConfig,
                        keyboard: {
                            enabled: true,
                            onlyInViewport: false,
                        },
                        navigation: {
                            nextEl: '.swiper-button-next',
                            prevEl: '.swiper-button-prev'
                        },
                        pagination: {
                            el: '.swiper-pagination',
                            type: 'fraction',
                            clickable: true
                        },
                        on: {
                            slideChange: function() {
                                const currentSlide = this.slides[this.activeIndex];
                                if (contentEl && currentSlide) {
                                    const img = currentSlide.querySelector('img');
                                    if (img && img.getAttribute('title')) {
                                        contentEl.innerText = img.getAttribute('title');
                                    }
                                }
                            },
                            init: function() {
                                // Focus swiper container for keyboard nav
                                swiperContainer.focus();
                            }
                        }
                    });
                    swiper.autoplay.start(); // Ensure autoplay starts immediately
                } else {
                    swiper.autoplay.start();
                }
                // Force autoplay to start
                setTimeout(() => swiper.autoplay.start(), 0);
                playPauseBtn.checked = true;
                panelElement.classList.add('playing');
                document.body.classList.add('playing');

                // Enable keyboard shortcuts
                document.addEventListener('keydown', handleKeyPress);
            } else {
                // Stop slideshow
                if (swiper) {
                    swiper.autoplay.stop();
                }
                playPauseBtn.checked = false;
                panelElement.classList.remove('playing');
                document.body.classList.remove('playing');
                
                // Reset swiper
                if (swiper) {
                    swiper.destroy(true, true);
                    swiper = null;
                }

                // Remove keyboard shortcuts
                document.removeEventListener('keydown', handleKeyPress);
            }
        };

        // Handle keyboard shortcuts
        const handleKeyPress = (event) => {
            if (!swiper) return;

            switch (event.key) {
                case ' ':
                    event.preventDefault();
                    if (swiper.autoplay.running) {
                        swiper.autoplay.stop();
                    } else {
                        swiper.autoplay.start();
                    }
                    break;
                case 'Escape':
                    event.preventDefault();
                    toggleSlideshow();
                    break;
            }
        };

        // Handle click events
        const handleClick = (event) => {
            event.preventDefault();
            event.stopPropagation();
            toggleSlideshow();
            // Immediately enable autoplay on click
            if (swiper && swiper.autoplay) {
                swiper.params.autoplay.disableOnInteraction = false;
                swiper.autoplay.start();
            }
        };

        // Handle checkbox and label clicks
        const label = document.querySelector(`label[for="${playPauseBtn.id}"]`);
        if (label) {
            label.addEventListener('click', handleClick);
        }
        playPauseBtn.addEventListener('click', handleClick);

        // Check URL parameters for autoplay
        if (window.location.search.includes('autoplay')) {
            setTimeout(() => {
                toggleSlideshow();
            }, 1000);
        }
    },
    
    destroy: function() {
        if (swiper) {
            swiper.destroy(true, true);
            swiper = null;
            document.removeEventListener('keydown', handleKeyPress);
        }
    }
};

export default sliderModule;