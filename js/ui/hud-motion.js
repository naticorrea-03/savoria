// DOM motion for the HUD and course-clear card: ticking counters, bumps,
// and tomatoes that fly from the world into the HUD. Display only.

import { prefersReducedMotion } from '../core/motion-math.js';

const FLYER_POOL = 10;
const FLIGHT_MS = 620;

// counterId and tomatoesId pick the HUD: solo by default, or the shared
// co-op counter. layerParentId must sit above the HUD it flies into.
export function createHudMotion({
  doc = document,
  tomatoSrc = 'assets/sprites/tomato.png',
  counterId = 'tomato-count',
  tomatoesId = 'hud-tomatoes',
  layerParentId = 'app',
} = {}) {
  const reduced = () => prefersReducedMotion();
  const counter = doc.getElementById(counterId);
  const tomatoes = doc.getElementById(tomatoesId);
  const layer = doc.createElement('div');
  layer.className = 'fx-layer';
  layer.setAttribute('aria-hidden', 'true');
  doc.getElementById(layerParentId)?.append(layer);

  const flyers = [];
  for (let index = 0; index < FLYER_POOL; index += 1) {
    const image = doc.createElement('img');
    image.src = tomatoSrc;
    image.alt = '';
    image.className = 'fx-flyer';
    layer.append(image);
    flyers.push({ image, busy: false });
  }

  let shown = 0;
  let target = 0;
  let tickHandle = 0;
  let lastTick = 0;

  function bump(element, scale = 1.22) {
    if (!element || reduced() || !element.animate) return;
    element.animate(
      [
        { transform: 'scale(1)' },
        { transform: `scale(${scale})`, offset: 0.35 },
        { transform: 'scale(1)' },
      ],
      { duration: 280, easing: 'cubic-bezier(.3,1.6,.5,1)' },
    );
  }

  function renderCount() {
    if (counter) counter.textContent = String(shown);
  }

  function tick(now) {
    tickHandle = 0;
    if (shown === target) return;
    if (now - lastTick >= 55) {
      lastTick = now;
      shown += shown < target ? 1 : -1;
      renderCount();
      bump(tomatoes, 1.16);
    }
    tickHandle = requestAnimationFrame(tick);
  }

  function setTomatoes(value, { delayMs = 0 } = {}) {
    target = value;
    if (reduced() || value < shown) {
      shown = value;
      renderCount();
      return;
    }
    const start = () => {
      if (!tickHandle && shown !== target) tickHandle = requestAnimationFrame(tick);
    };
    if (delayMs > 0) setTimeout(start, delayMs);
    else start();
  }

  function resetTomatoes(value = 0) {
    if (tickHandle) cancelAnimationFrame(tickHandle);
    tickHandle = 0;
    shown = target = value;
    renderCount();
  }

  function flyTomato(x, y, count = 1) {
    if (reduced() || !tomatoes) return;
    const rect = tomatoes.querySelector('img')?.getBoundingClientRect() ?? tomatoes.getBoundingClientRect();
    const endX = rect.left + rect.width / 2;
    const endY = rect.top + rect.height / 2;
    for (let index = 0; index < count; index += 1) {
      const flyer = flyers.find((entry) => !entry.busy);
      if (!flyer) return;
      flyer.busy = true;
      const startX = x + index * 14;
      const midX = (startX + endX) / 2 + 40;
      const midY = Math.min(y, endY) - 70;
      const animation = flyer.image.animate(
        [
          { transform: `translate(${startX}px, ${y}px) scale(0.6)`, opacity: 0 },
          { transform: `translate(${startX}px, ${y - 26}px) scale(1.25)`, opacity: 1, offset: 0.16 },
          { transform: `translate(${midX}px, ${midY}px) scale(1)`, opacity: 1, offset: 0.55 },
          { transform: `translate(${endX}px, ${endY}px) scale(0.55)`, opacity: 0.9 },
        ],
        { duration: FLIGHT_MS, delay: index * 90, easing: 'cubic-bezier(.45,0,.3,1)', fill: 'backwards' },
      );
      animation.onfinish = animation.oncancel = () => {
        flyer.busy = false;
        bump(tomatoes, 1.3);
      };
    }
  }

  // Count numbers on the course-clear card up from zero.
  function countUp(root) {
    const nodes = root?.querySelectorAll('[data-count-to]') ?? [];
    for (const node of nodes) {
      const end = Number(node.dataset.countTo) || 0;
      if (reduced() || end === 0) {
        node.textContent = String(end);
        continue;
      }
      const delay = Number(node.dataset.countDelay) || 0;
      const duration = Math.min(900, 220 + end * 45);
      const started = performance.now() + delay;
      node.textContent = '0';
      const step = (now) => {
        const t = Math.min(1, Math.max(0, (now - started) / duration));
        const eased = 1 - (1 - t) ** 3;
        node.textContent = String(Math.round(end * eased));
        if (t < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }
  }

  return { bump, setTomatoes, resetTomatoes, flyTomato, countUp, flightMs: FLIGHT_MS };
}
