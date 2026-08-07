const ROW_HEIGHT_PX = 8;

const schedule = (callback) => window.requestAnimationFrame(callback);

const resizeMasonryItem = (list, item) => {
  const gap = Number.parseFloat(window.getComputedStyle(list).rowGap) || 0;
  const itemHeight = item.getBoundingClientRect().height;
  if (itemHeight <= 0) return;

  const rowSpan = Math.max(1, Math.ceil((itemHeight + gap) / (ROW_HEIGHT_PX + gap)));
  item.style.gridRowEnd = `span ${rowSpan}`;
};

const enableNativeFormatMasonry = (list) => {
  const items = [...list.querySelectorAll(':scope > .c-panel__item')];
  if (items.length === 0) return;

  const resizeAll = () => items.forEach((item) => resizeMasonryItem(list, item));
  const queueResizeAll = () => schedule(resizeAll);

  items.forEach((item) => {
    item.querySelectorAll('img, video').forEach((media) => {
      media.addEventListener('load', queueResizeAll);
      media.addEventListener('loadedmetadata', queueResizeAll);
    });
  });

  if ('ResizeObserver' in window) {
    const observer = new ResizeObserver(queueResizeAll);
    observer.observe(list);
    items.forEach((item) => observer.observe(item));
  } else {
    window.addEventListener('resize', queueResizeAll);
  }

  queueResizeAll();
};

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.c-panel__list').forEach(enableNativeFormatMasonry);
});
