// Don Funghi's name card, speech line, phase label, and stomp hint. Driven
// only by the plain boss view (solo 'boss' events or the co-op room view),
// so both modes show the same thing. Display only.

import {
  BOSS_LINES,
  BOSS_NAME,
  BOSS_PHASES,
  BOSS_TITLE,
} from '../gameplay/boss-fight.js';

const LINE_MS = 3600;

export function createBossCard({ doc = document, mount, showBar = false }) {
  const root = doc.createElement('div');
  root.className = 'boss-card';
  root.hidden = true;
  root.innerHTML = `
    <div class="boss-card-plate">
      <span class="boss-card-kicker">Boss</span>
      <strong class="boss-card-name"></strong>
      <span class="boss-card-title"></span>
    </div>
    <div class="boss-card-status">
      <span class="boss-card-phase"></span>
      ${showBar ? '<span class="boss-card-bar"><span class="boss-card-fill"></span></span>' : ''}
    </div>
    <p class="boss-card-line" role="status" aria-live="polite"></p>
    <span class="boss-card-hint">He's dizzy. Stomp him!</span>
  `;
  root.querySelector('.boss-card-name').textContent = BOSS_NAME;
  root.querySelector('.boss-card-title').textContent = BOSS_TITLE;
  mount?.append(root);

  const phaseLabel = root.querySelector('.boss-card-phase');
  const line = root.querySelector('.boss-card-line');
  const fill = root.querySelector('.boss-card-fill');
  let last = null;
  let lineTimer = 0;

  function restart(element, className) {
    element.classList.remove(className);
    // Reading offsetWidth restarts the CSS animation for the next frame.
    void element.offsetWidth;
    element.classList.add(className);
  }

  function sync(view) {
    if (!view || view.mode === 'sleep') {
      if (!view) reset();
      return;
    }
    const previous = last;
    if (
      previous
      && previous.mode === view.mode
      && previous.phase === view.phase
      && previous.hp === view.hp
      && previous.lineRevision === view.lineRevision
    ) return;
    last = {
      mode: view.mode,
      phase: view.phase,
      hp: view.hp,
      maxHp: view.maxHp,
      lineRevision: view.lineRevision,
    };
    root.hidden = view.mode === 'done';
    root.dataset.mode = view.mode;
    root.classList.toggle('is-intro', view.mode === 'intro');
    root.classList.toggle('is-tired', view.mode === 'tired');

    const phase = BOSS_PHASES[(view.phase || 1) - 1] ?? BOSS_PHASES[0];
    phaseLabel.textContent = `Phase ${view.phase || 1}: ${phase.name}`;
    if (previous && previous.phase !== view.phase) restart(phaseLabel, 'is-popping');
    if (fill) fill.style.width = `${Math.max(0, (view.hp / Math.max(1, view.maxHp)) * 100)}%`;

    if (view.lineRevision && view.lineRevision !== previous?.lineRevision && BOSS_LINES[view.line]) {
      line.textContent = `"${BOSS_LINES[view.line]}"`;
      line.classList.add('is-shown');
      restart(line, 'is-popping');
      clearTimeout(lineTimer);
      lineTimer = setTimeout(() => line.classList.remove('is-shown'), LINE_MS);
    }
  }

  function reset() {
    if (last === null && root.hidden) return;
    last = null;
    clearTimeout(lineTimer);
    root.hidden = true;
    root.className = 'boss-card';
    line.classList.remove('is-shown');
    line.textContent = '';
  }

  return { sync, reset, element: root };
}
