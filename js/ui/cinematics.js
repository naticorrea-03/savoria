// Short cinematic beats around play: the world intro card, the course title
// card, the goal celebration before the course-clear card, the star reveal,
// and the iris wipe into a course. Display only. Every blocking beat ends on
// any key or click, and nothing here reads or writes gameplay state.

import { sfx } from '../audio/sfx.js';
import { prefersReducedMotion } from '../core/motion-math.js';

const CONFETTI_COLORS = ['#ffd166', '#ef476f', '#06d6a0', '#ffe9b0', '#f78c3b', '#8ecae6'];

export const TIMING = {
  worldIntroMs: 1500,
  courseCardMs: 1500,
  goalBeatMs: 1050,
  irisCloseMs: 300,
  irisOpenMs: 260,
  starFirstMs: 480,
  starStepMs: 240,
};

export function createCinematics({ doc = document, win = window } = {}) {
  const app = doc.getElementById('app');
  const reduced = () => prefersReducedMotion(win);
  let active = null;
  let swallowKeyUp = null;

  // One blocking beat at a time. skip() must finish it synchronously.
  function begin(name, skip) {
    if (active) active.skip();
    const token = { name, skip: () => { if (active === token) active = null; skip(); } };
    active = token;
    app.dataset.cinematic = name;
    return token;
  }

  function end(token) {
    if (active === token) active = null;
    if (!active && app.dataset.cinematic) delete app.dataset.cinematic;
  }

  win.addEventListener('keydown', (event) => {
    if (!active) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    swallowKeyUp = event.code;
    active.skip();
  }, true);

  win.addEventListener('keyup', (event) => {
    if (swallowKeyUp && event.code === swallowKeyUp) {
      swallowKeyUp = null;
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);

  app.addEventListener('pointerdown', () => active?.skip(), true);

  function layer(className) {
    const element = doc.createElement('div');
    element.className = className;
    element.setAttribute('aria-hidden', 'true');
    app.append(element);
    return element;
  }

  // Shared helper: show an element for a while, then fade it out and remove it.
  function timedBeat({ name, element, holdMs, blocking = true, onDone }) {
    let finished = false;
    let token = null;
    const timer = setTimeout(() => finish(false), holdMs);
    function finish(skipped) {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      if (token) end(token);
      element.classList.add('is-leaving');
      const outMs = skipped ? 120 : 260;
      if (reduced()) element.animate([{ opacity: 1 }, { opacity: 0 }], { duration: outMs, fill: 'forwards' });
      setTimeout(() => element.remove(), outMs);
      onDone?.();
    }
    if (blocking) token = begin(name, () => finish(true));
    // Reduced motion swaps every entrance for a plain fade.
    if (reduced()) element.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200 });
    return { finish: () => finish(true), element };
  }

  function worldIntro({ world, accent, deep }) {
    return new Promise((resolve) => {
      const card = layer('cine-world-intro');
      card.style.setProperty('--accent', accent);
      card.style.setProperty('--deep', deep);
      card.innerHTML = `
        <div class="cine-world-backdrop"></div>
        <figure class="cine-world-card">
          <img alt="" src="${world.thumb}">
          <figcaption>
            <span class="cine-world-kicker">World ${world.n}</span>
            <strong class="cine-world-name"></strong>
            <span class="cine-world-cuisine"></span>
          </figcaption>
        </figure>
        <span class="cine-skip">Press any key</span>`;
      card.querySelector('.cine-world-name').textContent = world.name;
      card.querySelector('.cine-world-cuisine').textContent = world.cuisine;
      card.setAttribute('role', 'status');
      card.removeAttribute('aria-hidden');
      card.setAttribute('aria-label', `World ${world.n}, ${world.name}`);
      if (reduced()) card.classList.add('is-reduced');
      timedBeat({ name: 'world-intro', element: card, holdMs: TIMING.worldIntroMs, onDone: resolve });
    });
  }

  // Course title card. It never blocks input: the course is already live
  // underneath, so the first movement key just fades it early.
  let courseBeat = null;
  function courseCard({ id, name, worldName, accent }) {
    courseBeat?.finish();
    const card = layer('cine-course-card');
    card.style.setProperty('--accent', accent);
    card.innerHTML = `
      <span class="cine-course-world"></span>
      <span class="cine-course-id"></span>
      <strong class="cine-course-name"></strong>`;
    card.querySelector('.cine-course-world').textContent = worldName;
    card.querySelector('.cine-course-id').textContent = id;
    card.querySelector('.cine-course-name').textContent = name;
    if (reduced()) card.classList.add('is-reduced');
    const onKey = () => beat.finish();
    const beat = timedBeat({
      name: 'course-card',
      element: card,
      holdMs: TIMING.courseCardMs,
      blocking: false,
      onDone: () => win.removeEventListener('keydown', onKey),
    });
    win.addEventListener('keydown', onKey);
    courseBeat = beat;
    return beat;
  }

  function confettiBurst(x, y, count = 46, spread = 1) {
    if (reduced()) return;
    const holder = layer('cine-confetti');
    for (let index = 0; index < count; index += 1) {
      const bit = doc.createElement('i');
      bit.style.background = CONFETTI_COLORS[index % CONFETTI_COLORS.length];
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.25;
      const speed = (180 + Math.random() * 260) * spread;
      const dx = Math.cos(angle) * speed;
      const dy = Math.sin(angle) * speed;
      const spin = (Math.random() - 0.5) * 900;
      const duration = 900 + Math.random() * 500;
      bit.animate(
        [
          { transform: `translate(${x}px, ${y}px) rotate(0deg) scale(1)`, opacity: 1 },
          { transform: `translate(${x + dx * 0.8}px, ${y + dy * 0.8}px) rotate(${spin * 0.6}deg) scale(1)`, opacity: 1, offset: 0.45 },
          { transform: `translate(${x + dx}px, ${y + dy + 260}px) rotate(${spin}deg) scale(.7)`, opacity: 0 },
        ],
        { duration, easing: 'cubic-bezier(.15,.7,.3,1)', fill: 'forwards' },
      );
      holder.append(bit);
    }
    setTimeout(() => holder.remove(), 1500);
  }

  // The goal beat: the world stays visible, a banner stamps in, confetti
  // flies, then the course-clear card takes over. The save is already written
  // before this starts; only the card's entrance waits.
  function goalBeat({ x = innerWidth / 2, y = innerHeight / 2, title = 'Course clear!', onDone }) {
    app.dataset.goalBeat = '';
    const banner = layer('cine-goal');
    banner.innerHTML = '<div class="cine-goal-rays"></div><strong class="cine-goal-title"></strong>';
    const titleNode = banner.querySelector('.cine-goal-title');
    [...title].forEach((letter, index) => {
      const span = doc.createElement('span');
      span.textContent = letter;
      span.style.setProperty('--i', String(index));
      titleNode.append(span);
    });
    banner.style.setProperty('--gx', `${x}px`);
    banner.style.setProperty('--gy', `${y}px`);
    if (reduced()) banner.classList.add('is-reduced');
    confettiBurst(x, y, 54, 1);
    setTimeout(() => confettiBurst(innerWidth * 0.25, innerHeight * 0.55, 22, 0.8), 180);
    setTimeout(() => confettiBurst(innerWidth * 0.75, innerHeight * 0.55, 22, 0.8), 300);
    return timedBeat({
      name: 'goal',
      element: banner,
      holdMs: reduced() ? 500 : TIMING.goalBeatMs,
      onDone: () => {
        delete app.dataset.goalBeat;
        onDone?.();
      },
    });
  }

  // Stars stamp one by one after the card lands. Earned stars get a chime
  // that climbs in pitch and a burst; missed stars land with a dull thud.
  let starTimers = [];
  function revealStars(starsRoot, panel) {
    starTimers.forEach(clearTimeout);
    starTimers = [];
    const stars = [...(starsRoot?.querySelectorAll('.star') ?? [])];
    if (reduced()) return;
    stars.forEach((star, index) => {
      const at = TIMING.starFirstMs + index * TIMING.starStepMs;
      star.style.animationDelay = `${at}ms`;
      starTimers.push(setTimeout(() => {
        if (!star.isConnected) return;
        const earned = star.classList.contains('is-earned');
        if (earned) {
          sfx.blip(660 + index * 220, 0.16, 'triangle', 0.08);
          const rect = star.getBoundingClientRect();
          sparkle(rect.left + rect.width / 2, rect.top + rect.height / 2);
          panel?.animate(
            [{ transform: 'translateY(0)' }, { transform: 'translateY(3px)' }, { transform: 'translateY(0)' }],
            { duration: 160, easing: 'ease-out' },
          );
        } else {
          sfx.blip(180, 0.1, 'triangle', 0.05);
        }
      }, at + 300));
    });
  }

  function sparkle(x, y) {
    const holder = layer('cine-sparkle');
    for (let index = 0; index < 10; index += 1) {
      const dot = doc.createElement('i');
      const angle = (index / 10) * Math.PI * 2;
      const distance = 38 + (index % 2) * 18;
      dot.animate(
        [
          { transform: `translate(${x}px, ${y}px) scale(1)`, opacity: 1 },
          { transform: `translate(${x + Math.cos(angle) * distance}px, ${y + Math.sin(angle) * distance}px) scale(.2)`, opacity: 0 },
        ],
        { duration: 520, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'forwards' },
      );
      holder.append(dot);
    }
    setTimeout(() => holder.remove(), 600);
  }

  // Iris wipe into a course: a dark ring closes in on the chef. Resolves
  // once closed; irisOpen() then fades it off the next screen.
  let iris = null;
  function irisClose({ x, y }) {
    return new Promise((resolve) => {
      iris?.remove();
      iris = layer('cine-iris');
      const element = iris;
      const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
      let done = false;
      let frame = 0;
      let token = null;
      const setRadius = (r) => {
        const mask = `radial-gradient(circle at ${x}px ${y}px, transparent ${r}px, #000 ${r + 1.5}px)`;
        element.style.maskImage = mask;
        element.style.webkitMaskImage = mask;
      };
      const finish = () => {
        if (done) return;
        done = true;
        cancelAnimationFrame(frame);
        if (token) end(token);
        element.style.maskImage = 'none';
        element.style.webkitMaskImage = 'none';
        element.style.opacity = '1';
        resolve();
      };
      const started = performance.now();
      const duration = reduced() ? 180 : TIMING.irisCloseMs;
      const step = (now) => {
        const t = Math.min(1, Math.max(0, now - started) / duration);
        if (reduced()) element.style.opacity = String(t);
        else setRadius(radius * (1 - (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)));
        if (t >= 1) finish();
        else frame = requestAnimationFrame(step);
      };
      if (reduced()) element.style.opacity = '0';
      else setRadius(radius);
      frame = requestAnimationFrame(step);
      token = begin('iris', finish);
    });
  }

  function irisOpen() {
    const element = iris;
    iris = null;
    if (!element) return;
    const animation = element.animate([{ opacity: 1 }, { opacity: 0 }], {
      duration: TIMING.irisOpenMs,
      easing: 'ease-out',
      fill: 'forwards',
    });
    animation.onfinish = () => element.remove();
  }

  return {
    begin,
    end,
    get active() { return active?.name ?? null; },
    skip() { active?.skip(); },
    worldIntro,
    courseCard,
    goalBeat,
    revealStars,
    confettiBurst,
    sparkle,
    irisClose,
    irisOpen,
    reduced,
  };
}
