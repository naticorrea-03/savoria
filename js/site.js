const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

document.documentElement.dataset.motion = reducedMotion.matches ? 'reduced' : 'full';

reducedMotion.addEventListener?.('change', (event) => {
  document.documentElement.dataset.motion = event.matches ? 'reduced' : 'full';
});
