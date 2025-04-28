import { Navigation, Pagination, Autoplay, EffectFade, Keyboard } from 'swiper/modules';

export function createSwiperConfig(contentEl) {
  return {
    modules: [Navigation, Pagination, Autoplay, EffectFade, Keyboard],
    effect: 'fade',
    fadeEffect: {
      crossFade: true
    },
    speed: 800,
    direction: 'horizontal',
    loop: true,
    spaceBetween: 0,
    autoplay: {
      delay: 5000,
      disableOnInteraction: false
    },
    keyboard: {
      enabled: true,
      onlyInViewport: false,
    },
    navigation: {
      nextEl: '.swiper-button-next',  // Fixed: was incorrect
      prevEl: '.swiper-button-prev'   // Fixed: was incorrect
    },
    pagination: {
      el: '.swiper-pagination',
      type: 'fraction',
      clickable: true
    },
    on: {
      init: function(swiper) {
        swiper.el.focus();
      },
      slideChange: function() {
        const currentSlide = this.slides[this.activeIndex];
        if (contentEl && currentSlide) {
          const img = currentSlide.querySelector('img');
          if (img && img.getAttribute('title')) {
            contentEl.innerText = img.getAttribute('title');
          }
        }
      }
    }
  };
}