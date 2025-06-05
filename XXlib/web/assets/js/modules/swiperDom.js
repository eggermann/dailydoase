function createSwiperElements() {
  const swiperContainer = document.createElement('div');
  swiperContainer.className = 'swiper';
  swiperContainer.setAttribute('tabindex', '0');
  
  // Navigation elements
  const prevButton = document.createElement('div');
  prevButton.className = 'swiper-button-prev';
  const nextButton = document.createElement('div');
  nextButton.className = 'swiper-button-next';
  
  // Pagination
  const pagination = document.createElement('div');
  pagination.className = 'swiper-pagination';
  
  const swiperWrapper = document.createElement('div');
  swiperWrapper.className = 'swiper-wrapper';

  return {
    container: swiperContainer,
    wrapper: swiperWrapper,
    prevButton,
    nextButton,
    pagination
  };
}

function createSlides(images, startIndex = 0) {
  const slides = [...images]
    .sort((a, b) => parseFloat(b.dataset.mtime) - parseFloat(a.dataset.mtime))
    .map(img => {
      const slide = document.createElement('div');
      slide.className = 'swiper-slide';
      slide.appendChild(img.cloneNode(true));
      return slide;
    });

  // Rotate array to start from clicked image
  if (startIndex > 0 && startIndex < slides.length) {
    const first = slides.splice(0, startIndex);
    slides.push(...first);
  }

  return slides;
}

export function initializeSwiperDom(images, startIndex = 0) {
  const elements = createSwiperElements();
  const slides = createSlides(images, startIndex);

  slides.forEach(slide => {
    elements.wrapper.appendChild(slide);
  });

  elements.container.appendChild(elements.wrapper);
  elements.container.appendChild(elements.prevButton);
  elements.container.appendChild(elements.nextButton);
  elements.container.appendChild(elements.pagination);

  return elements.container;
}

// Add click handlers to images
export function addImageClickHandlers(images, startSlideshow) {
  images.forEach((img, index) => {
    img.addEventListener('click', (e) => {
      e.preventDefault();
      startSlideshow(index);
    });
  });
}