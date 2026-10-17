// World select and the illustrated overworld. The chef walks between unlocked
// course nodes on a winding road; locked nodes stay sealed, cleared nodes
// show stars, and fresh unlocks get a short reveal. Display only: the map
// reads the save and calls back into main.js to open a world or a course.

import { RELEASED_LEVELS, RELEASED_WORLDS } from '../levels/index.js';
import { CHARACTERS } from './ui-state.js';
import {
  CINEMATIC_MEMORY_KEY,
  PLANNED_WORLDS,
  STAGE_HEIGHT,
  STAGE_WIDTH,
  coverTransform,
  isWorldOpen,
  parseMemory,
  pendingCourseReveals,
  pendingWorldReveals,
  pointAtDistance,
  seedMemory,
  segmentLengthTable,
  worldAccent,
  worldMapLayout,
} from './world-map-layout.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const HOP_MS = 400;
const WALK_CAP_MS = 900;
const CHEF_FOOT = 14;
const STRIDE = 230;

const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

function svg(doc, tag, attributes = {}) {
  const element = doc.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, String(value));
  return element;
}

function starText(count) {
  return `${'★'.repeat(count)}${'☆'.repeat(3 - count)}`;
}

export function createWorldMap({
  doc = document,
  win = window,
  storage = win.localStorage,
  cinematics,
  onOpenWorld,
  onEnterCourse,
}) {
  const screen = doc.getElementById('map-screen');
  const selectView = doc.getElementById('world-select');
  const cards = doc.getElementById('world-cards');
  const overworld = doc.getElementById('overworld');
  const reduced = () => cinematics.reduced();

  let memory = null;
  let renderedKey = null;
  let view = null;
  let active = false;
  let lastWorld = null;
  let save = null;
  let map = null;
  const chefStops = new Map();
  const timers = new Set();

  function later(callback, ms) {
    const id = setTimeout(() => {
      timers.delete(id);
      callback();
    }, ms);
    timers.add(id);
    return id;
  }

  function clearTimers() {
    timers.forEach(clearTimeout);
    timers.clear();
  }

  function loadMemory(currentSave) {
    if (memory) return;
    let raw = null;
    try { raw = storage?.getItem(CINEMATIC_MEMORY_KEY); } catch { raw = null; }
    memory = parseMemory(raw) ?? seedMemory(currentSave, RELEASED_LEVELS);
    persistMemory();
  }

  function persistMemory() {
    try { storage?.setItem(CINEMATIC_MEMORY_KEY, JSON.stringify(memory)); } catch { /* private mode */ }
  }

  function remember(list, value) {
    if (!memory[list].includes(value)) {
      memory[list].push(value);
      persistMemory();
    }
  }

  // World select

  function worldStars(worldNumber) {
    const levels = RELEASED_LEVELS.filter(({ world }) => world === worldNumber);
    return {
      levels,
      stars: levels.reduce((total, { id }) => total + (save.best[id] ?? 0), 0),
    };
  }

  function buildWorldCard(world, planned) {
    const open = !planned && isWorldOpen(world.n, save, RELEASED_LEVELS);
    const button = doc.createElement('button');
    button.type = 'button';
    button.className = `world-card${open ? '' : ' is-locked'}${planned ? ' is-planned' : ''}`;
    button.dataset.world = String(world.n);
    button.disabled = !open;
    const { accent, deep } = worldAccent(world.theme);
    button.style.setProperty('--accent', accent);
    button.style.setProperty('--deep', deep);

    const art = doc.createElement('img');
    art.src = world.thumb;
    art.alt = '';
    art.decoding = 'async';
    const number = doc.createElement('span');
    number.className = 'world-card-number';
    number.textContent = String(world.n);
    const copy = doc.createElement('span');
    copy.className = 'world-card-copy';
    const name = doc.createElement('strong');
    name.textContent = world.name;
    const cuisine = doc.createElement('small');
    cuisine.textContent = world.cuisine;
    copy.append(name, cuisine);
    const status = doc.createElement('span');
    status.className = 'world-card-status';
    button.append(art, number, copy, status);

    if (planned) {
      status.textContent = 'Coming soon';
      button.setAttribute('aria-label', `World ${world.n}, ${world.name}, coming soon`);
      return button;
    }
    const { levels, stars } = worldStars(world.n);
    if (!open) {
      status.textContent = 'Locked';
      button.setAttribute('aria-label', `World ${world.n}, ${world.name}, locked`);
      return button;
    }
    status.textContent = `★ ${stars}/${levels.length * 3}`;
    const pips = doc.createElement('span');
    pips.className = 'world-card-pips';
    pips.setAttribute('aria-hidden', 'true');
    for (const level of levels) {
      const pip = doc.createElement('i');
      if (save.best[level.id] !== undefined) pip.className = 'is-cleared';
      pips.append(pip);
    }
    button.append(pips);
    button.setAttribute('aria-label', `World ${world.n}, ${world.name}, ${stars} of ${levels.length * 3} stars`);
    button.addEventListener('click', () => onOpenWorld(world.n));
    return button;
  }

  function buildWorldSelect() {
    const releasedNumbers = new Set(RELEASED_WORLDS.map(({ n }) => n));
    const planned = PLANNED_WORLDS.filter(({ n }) => !releasedNumbers.has(n));
    const built = [
      ...RELEASED_WORLDS.map((world) => buildWorldCard(world, false)),
      ...planned.map((world) => buildWorldCard(world, true)),
    ];
    cards.replaceChildren(...built);
    for (const card of built) delete card.dataset.primary;
    const reveals = pendingWorldReveals(memory, save, RELEASED_LEVELS, RELEASED_WORLDS);
    const openCards = built.filter((card) => !card.disabled);
    const preferred = built.find((card) => Number(card.dataset.world) === (reveals.at(-1) ?? lastWorld))
      ?? openCards.at(-1);
    if (preferred && !preferred.disabled) preferred.dataset.primary = '';
    if (reveals.length) playWorldReveals(reveals);
  }

  function playWorldReveals(worldNumbers) {
    const targets = worldNumbers
      .map((n) => cards.querySelector(`.world-card[data-world="${n}"]`))
      .filter(Boolean);
    worldNumbers.forEach((n) => remember('worldCards', n));
    if (reduced()) {
      targets.forEach((card) => card.classList.add('is-unsealed-quiet'));
      return;
    }
    targets.forEach((card) => card.classList.add('is-sealed'));
    let token = null;
    const finish = () => {
      clearTimers();
      targets.forEach((card) => {
        card.classList.remove('is-sealed');
        card.classList.add('is-unsealed');
      });
      if (token) cinematics.end(token);
      token = null;
    };
    token = cinematics.begin('world-unlock', finish);
    later(() => {
      targets.forEach((card) => {
        card.classList.remove('is-sealed');
        card.classList.add('is-unsealed');
        const rect = card.getBoundingClientRect();
        cinematics.confettiBurst(rect.left + rect.width / 2, rect.top + rect.height / 2, 30, 0.7);
      });
    }, 380);
    later(finish, 1000);
  }

  function moveCardFocus(event) {
    const all = [...cards.querySelectorAll('.world-card')];
    const enabled = all.filter((card) => !card.disabled);
    const index = enabled.indexOf(doc.activeElement);
    if (index < 0) {
      enabled[0]?.focus();
      return;
    }
    const columns = Math.max(1, Math.round(cards.clientWidth / (all[0]?.offsetWidth || 1)));
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -columns, ArrowDown: columns }[event.code];
    const from = all.indexOf(enabled[index]);
    let target = from + step;
    while (all[target]?.disabled) target += Math.sign(step);
    all[target]?.focus();
  }

  // Overworld

  function buildOverworld(worldNumber) {
    const world = RELEASED_WORLDS.find(({ n }) => n === worldNumber);
    const entries = RELEASED_LEVELS
      .map((level, index) => ({ level, index }))
      .filter(({ level }) => level.world === worldNumber);
    const layout = worldMapLayout(entries.length, worldNumber);
    const { accent, deep } = worldAccent(world.theme);
    const nextWorld = RELEASED_WORLDS.find(({ n }) => n > worldNumber)
      ?? PLANNED_WORLDS.find(({ n }) => n > worldNumber);
    const nextOpen = nextWorld && isWorldOpen(nextWorld.n, save, RELEASED_LEVELS);
    const reveals = new Set(pendingCourseReveals(memory, save, RELEASED_LEVELS, worldNumber));
    const firstVisit = !memory.worlds.includes(worldNumber);
    if (firstVisit) reveals.clear();
    const openIndex = (index) => index < save.unlocked;

    overworld.style.setProperty('--accent', accent);
    overworld.style.setProperty('--deep', deep);
    overworld.dataset.world = String(worldNumber);
    overworld.toggleAttribute('data-anchored', layout.anchored);

    const viewport = doc.createElement('div');
    viewport.className = 'ow-viewport';
    const stage = doc.createElement('div');
    stage.className = 'ow-stage';
    stage.style.width = `${STAGE_WIDTH}px`;
    stage.style.height = `${STAGE_HEIGHT}px`;
    const art = doc.createElement('img');
    art.className = 'ow-art';
    art.src = world.mapBackground ?? world.thumb;
    art.alt = '';
    art.decoding = 'async';
    stage.append(art);

    const road = svg(doc, 'svg', {
      class: 'ow-road',
      viewBox: `0 0 ${STAGE_WIDTH} ${STAGE_HEIGHT}`,
      'aria-hidden': 'true',
    });
    const defs = svg(doc, 'defs');
    const glow = svg(doc, 'filter', { id: `ow-glow-${worldNumber}`, x: '-50%', y: '-50%', width: '200%', height: '200%' });
    glow.append(svg(doc, 'feGaussianBlur', { stdDeviation: '6' }));
    defs.append(glow);
    road.append(defs);

    // Start signpost.
    const sign = svg(doc, 'g', { class: 'ow-sign', transform: `translate(${layout.start.x} ${layout.start.y})` });
    sign.append(
      svg(doc, 'rect', { x: -5, y: -78, width: 10, height: 82, rx: 3 }),
      svg(doc, 'rect', { class: 'ow-sign-board', x: -46, y: -86, width: 92, height: 34, rx: 8 }),
    );
    const signText = svg(doc, 'text', { x: 0, y: -63, 'text-anchor': 'middle' });
    signText.textContent = 'START';
    sign.append(signText);

    const segmentEls = layout.segments.map((segment, index) => {
      const leadsToGate = index === entries.length;
      const open = leadsToGate
        ? Boolean(nextOpen) || entries.every(({ level }) => save.best[level.id] !== undefined)
        : openIndex(entries[index].index);
      const group = svg(doc, 'g', { class: `ow-seg${open ? ' is-open' : ' is-locked'}` });
      if (open) {
        group.append(
          svg(doc, 'path', { class: 'ow-road-edge', d: segment.d, pathLength: 1 }),
          svg(doc, 'path', { class: 'ow-road-top', d: segment.d, pathLength: 1 }),
          svg(doc, 'path', { class: 'ow-road-dash', d: segment.d }),
        );
      } else {
        group.append(svg(doc, 'path', { class: 'ow-road-ghost', d: segment.d }));
      }
      road.append(group);
      return group;
    });

    // Gate toward the next world.
    const gate = svg(doc, 'g', {
      class: `ow-gate${nextOpen ? ' is-open' : ''}`,
      transform: `translate(${layout.gate.x} ${layout.gate.y})`,
    });
    if (!layout.paintedGate) {
      gate.append(svg(doc, 'path', { class: 'ow-gate-arch', d: 'M-54 34 L-54 -40 Q-54 -92 0 -92 Q54 -92 54 -40 L54 34 L32 34 L32 -36 Q32 -66 0 -66 Q-32 -66 -32 -36 L-32 34 Z' }));
    }
    gate.append(svg(doc, 'rect', { class: 'ow-gate-plate', x: -62, y: 42, width: 124, height: 30, rx: 9 }));
    const gateText = svg(doc, 'text', { x: 0, y: 63, 'text-anchor': 'middle' });
    gateText.textContent = nextWorld
      ? (nextOpen ? `WORLD ${nextWorld.n} ›` : `WORLD ${nextWorld.n}`)
      : 'MORE SOON';
    gate.append(gateText);
    if (!nextOpen) {
      const lock = svg(doc, 'text', { class: 'ow-gate-lock', x: 0, y: layout.paintedGate ? 22 : -18, 'text-anchor': 'middle' });
      lock.textContent = '🔒';
      gate.append(lock);
    }

    // A few twinkles along the road. Seeded by index so they hold still.
    const twinkles = svg(doc, 'g', { class: 'ow-twinkles' });
    layout.segments.forEach((segment, index) => {
      const table = segmentLengthTable(segment.curve, 12);
      const point = pointAtDistance(segment.curve, table, 0.5);
      const offset = index % 2 === 0 ? -58 : 58;
      const star = svg(doc, 'path', {
        d: 'M0 -11 L3 -3 L11 0 L3 3 L0 11 L-3 3 L-11 0 L-3 -3 Z',
        transform: `translate(${Math.round(point.x)} ${Math.round(point.y + offset)})`,
        style: `animation-delay: ${index * 420}ms`,
      });
      twinkles.append(star);
    });

    road.append(sign, gate, twinkles);
    stage.append(road);

    const clouds = doc.createElement('div');
    clouds.className = 'ow-clouds';
    clouds.setAttribute('aria-hidden', 'true');
    for (let index = 0; index < 3; index += 1) clouds.append(doc.createElement('i'));

    const nodesLayer = doc.createElement('div');
    nodesLayer.className = 'ow-nodes';
    nodesLayer.setAttribute('role', 'group');
    nodesLayer.setAttribute('aria-label', `${world.name} courses`);

    const nodes = entries.map(({ level, index }) => {
      const open = openIndex(index);
      const stars = save.best[level.id] ?? 0;
      const cleared = save.best[level.id] !== undefined;
      const button = doc.createElement('button');
      button.type = 'button';
      button.className = `ow-node${open ? ' is-open' : ' is-locked'}${cleared ? ' is-cleared' : ''}`;
      button.disabled = !open;
      button.dataset.levelId = level.id;
      button.dataset.levelIndex = String(index);
      button.setAttribute(
        'aria-label',
        open ? `${level.id} ${level.name}, ${stars} of 3 stars` : `${level.id} ${level.name}, locked`,
      );
      const plate = doc.createElement('span');
      plate.className = 'ow-node-plate';
      const id = doc.createElement('span');
      id.className = 'ow-node-id';
      id.textContent = level.id;
      const lock = doc.createElement('span');
      lock.className = 'ow-node-lock';
      lock.textContent = '🔒';
      plate.append(id, lock);
      const rating = doc.createElement('span');
      rating.className = 'ow-node-stars';
      rating.setAttribute('aria-hidden', 'true');
      [0, 1, 2].forEach((starIndex) => {
        const star = doc.createElement('i');
        star.textContent = '★';
        if (starIndex < stars) star.className = 'is-earned';
        rating.append(star);
      });
      const name = doc.createElement('span');
      name.className = 'ow-node-name';
      name.textContent = level.name;
      button.append(plate, name, rating);
      if (cleared) {
        const flag = doc.createElement('span');
        flag.className = 'ow-node-flag';
        flag.setAttribute('aria-hidden', 'true');
        button.append(flag);
      }
      button.addEventListener('click', () => onNodeClick(nodes.indexOf(button)));
      // Keyboard focus (Tab) walks the chef too; mouse focus waits for the click.
      button.addEventListener('focus', () => {
        const index = nodes.indexOf(button);
        if (map && !map.walking && !map.entering && map.chefAt !== index && button.matches(':focus-visible')) {
          walkTo(index);
        }
      });
      return button;
    });
    nodesLayer.append(...nodes);

    const chef = doc.createElement('div');
    chef.className = 'ow-chef';
    chef.setAttribute('aria-hidden', 'true');
    const shadow = doc.createElement('span');
    shadow.className = 'ow-chef-shadow';
    const body = doc.createElement('span');
    body.className = 'ow-chef-body';
    const sprite = doc.createElement('img');
    const character = CHARACTERS.find(({ id }) => id === save.chef) ?? CHARACTERS[0];
    sprite.src = character.img;
    sprite.alt = '';
    body.append(sprite);
    chef.append(shadow, body);

    const dust = doc.createElement('div');
    dust.className = 'ow-dust';
    dust.setAttribute('aria-hidden', 'true');

    viewport.append(stage, clouds, nodesLayer, chef, dust);

    const head = doc.createElement('header');
    head.className = 'ow-head';
    const kicker = doc.createElement('p');
    kicker.className = 'map-kicker';
    kicker.textContent = `World ${world.n} · ${world.cuisine}`;
    const title = doc.createElement('h1');
    title.className = 'screen-title';
    title.id = 'overworld-title';
    title.textContent = world.name;
    const { stars: total, levels } = worldStars(world.n);
    const chip = doc.createElement('span');
    chip.className = 'ow-star-chip';
    chip.textContent = `★ ${total}/${levels.length * 3}`;
    head.append(kicker, title, chip);

    const info = doc.createElement('div');
    info.className = 'ow-info';
    info.setAttribute('aria-live', 'polite');
    const infoCopy = doc.createElement('div');
    infoCopy.className = 'ow-info-copy';
    const infoId = doc.createElement('span');
    infoId.className = 'ow-info-id';
    const infoName = doc.createElement('strong');
    const infoStars = doc.createElement('span');
    infoStars.className = 'ow-info-stars';
    infoCopy.append(infoId, infoName, infoStars);
    const play = doc.createElement('button');
    play.type = 'button';
    play.className = 'btn ow-play';
    play.textContent = "Let's cook";
    play.addEventListener('click', () => enterCourse(map.chefAt));
    info.append(infoCopy, play);

    const hints = doc.createElement('p');
    hints.className = 'ow-hints';
    hints.innerHTML = '<kbd>←</kbd><kbd>→</kbd> walk <kbd>Enter</kbd> cook <kbd>Esc</kbd> all worlds';

    const back = doc.createElement('button');
    back.type = 'button';
    back.className = 'btn small ow-back';
    back.dataset.action = 'back-to-worlds';
    back.textContent = '← All worlds';

    overworld.replaceChildren(viewport, head, info, hints, back);

    // Where the chef starts: the last course played here, else the first
    // uncleared open course, else the last open one.
    const openNodes = nodes.map((node, index) => (node.disabled ? -1 : index)).filter((index) => index >= 0);
    const firstUncleared = entries.findIndex(({ level, index }) => openIndex(index) && save.best[level.id] === undefined);
    const remembered = chefStops.get(worldNumber);
    const revealIndexes = [...reveals].map((id) => entries.findIndex(({ level }) => level.id === id)).filter((index) => index >= 0);
    let chefAt = remembered !== undefined && !nodes[remembered]?.disabled
      ? remembered
      : (firstUncleared >= 0 ? firstUncleared : openNodes.at(-1) ?? 0);
    // During a reveal the chef waits one stop back, then walks to the new node.
    const autoWalkTo = revealIndexes.length ? Math.max(...revealIndexes) : null;
    if (autoWalkTo !== null) {
      const behind = openNodes.filter((index) => index < autoWalkTo && !revealIndexes.includes(index));
      if (behind.length) chefAt = behind.at(-1);
    }

    map = {
      worldNumber,
      world,
      entries,
      layout,
      viewport,
      stage,
      nodes,
      segmentEls,
      chef,
      body,
      dust,
      info: { root: info, id: infoId, name: infoName, stars: infoStars, play },
      transform: null,
      chefAt,
      chefPoint: { ...layout.nodes[chefAt] },
      walking: null,
      entering: false,
      revealIndexes,
      autoWalkTo,
      firstVisit,
    };

    nodes.forEach((node) => delete node.dataset.primary);
    nodes[chefAt].dataset.primary = '';
    relayout();
    updateInfo();
    return { reveals: revealIndexes, firstVisit };
  }

  function project(point) {
    const { scale, x, y } = map.transform;
    return { x: point.x * scale + x, y: point.y * scale + y };
  }

  function relayout() {
    if (!map) return;
    const width = map.viewport.clientWidth || win.innerWidth;
    const height = map.viewport.clientHeight || win.innerHeight;
    map.transform = coverTransform(width, height);
    const { scale, x, y } = map.transform;
    map.stage.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
    map.layout.nodes.forEach((point, index) => {
      const screenPoint = project(point);
      map.nodes[index].style.transform = `translate(${Math.round(screenPoint.x)}px, ${Math.round(screenPoint.y)}px)`;
    });
    placeChef(map.chefPoint, 0);
  }

  // foot lifts the chef onto a node's plate; on the open road it drops to 0.
  function placeChef(point, lift, facing = map.facing ?? 1, squash = 1, foot = CHEF_FOOT) {
    map.chefPoint = point;
    map.facing = facing;
    const screenPoint = project(point);
    map.chef.style.transform = `translate3d(${screenPoint.x}px, ${screenPoint.y - foot}px, 0)`;
    map.body.style.transform = `translateY(${-lift}px) scale(${facing * (2 - squash)}, ${squash})`;
  }

  function updateInfo() {
    const entry = map.entries[map.chefAt];
    const stars = save.best[entry.level.id] ?? 0;
    map.info.id.textContent = entry.level.id;
    map.info.name.textContent = entry.level.name;
    map.info.stars.textContent = save.best[entry.level.id] === undefined ? 'New course' : starText(stars);
    map.nodes.forEach((node, index) => node.classList.toggle('is-here', index === map.chefAt));
  }

  function puff(point) {
    if (reduced()) return;
    const screenPoint = project(point);
    for (let index = 0; index < 4; index += 1) {
      const bit = doc.createElement('i');
      const dx = (index - 1.5) * 14;
      bit.animate(
        [
          { transform: `translate(${screenPoint.x + dx * 0.3}px, ${screenPoint.y - 22}px) scale(.5)`, opacity: 0.85 },
          { transform: `translate(${screenPoint.x + dx}px, ${screenPoint.y - 34 - (index % 2) * 8}px) scale(1.3)`, opacity: 0 },
        ],
        { duration: 420 + index * 40, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'forwards' },
      );
      map.dust.append(bit);
      later(() => bit.remove(), 520);
    }
  }

  // Walk node to node along the road. One eased stride per segment with a
  // hop in the middle and dust on each landing. finish() jumps to the end.
  function walkTo(target, { then } = {}) {
    if (!map || target === map.chefAt || map.nodes[target]?.disabled) {
      then?.();
      return;
    }
    map.walking?.finish();
    const from = map.chefAt;
    const direction = Math.sign(target - from);
    const hops = [];
    for (let index = from; index !== target; index += direction) {
      // segments[i] runs from node i-1 to node i (segment 0 starts at START).
      const segmentIndex = direction > 0 ? index + 1 : index;
      const segment = map.layout.segments[segmentIndex];
      hops.push({
        segment,
        table: segmentLengthTable(segment.curve),
        forward: direction > 0,
        strides: Math.max(1, Math.round(segment.length / STRIDE)),
      });
    }
    const hopMs = Math.min(HOP_MS, WALK_CAP_MS / hops.length);
    const startedAt = performance.now();
    let frame = 0;
    let lastHop = -1;
    const walk = { finish: null };
    map.walking = walk;

    const arrive = () => {
      cancelAnimationFrame(frame);
      if (map.walking === walk) map.walking = null;
      map.chefAt = target;
      chefStops.set(map.worldNumber, target);
      placeChef({ ...map.layout.nodes[target] }, 0, direction);
      map.chef.classList.remove('is-walking');
      if (!reduced()) {
        map.body.animate(
          [
            { transform: `translateY(0) scale(${direction * 1.18}, .82)` },
            { transform: `translateY(0) scale(${direction}, 1)` },
          ],
          { duration: 200, easing: 'cubic-bezier(.3,1.6,.5,1)' },
        );
      }
      puff(map.layout.nodes[target]);
      updateInfo();
      if (doc.activeElement !== map.nodes[target] && screen.contains(doc.activeElement)) {
        map.nodes[target].focus({ preventScroll: true });
      }
      then?.();
    };
    walk.finish = arrive;

    if (reduced()) {
      map.chef.animate([{ opacity: 1 }, { opacity: 0 }, { opacity: 1 }], { duration: 240 });
      later(arrive, 120);
      return;
    }

    map.chef.classList.add('is-walking');
    const step = (now) => {
      // rAF timestamps can trail performance.now() by a frame.
      const elapsed = Math.max(0, now - startedAt);
      const hopIndex = Math.min(hops.length - 1, Math.floor(elapsed / hopMs));
      const local = Math.min(1, (elapsed - hopIndex * hopMs) / hopMs);
      if (elapsed >= hops.length * hopMs) {
        arrive();
        return;
      }
      const hop = hops[hopIndex];
      const t = easeInOut(local);
      // Little bouncing strides along the eased path, dust on each landing.
      const strideT = t * hop.strides;
      const stride = Math.min(hop.strides - 1, Math.floor(strideT));
      const strideKey = hopIndex * 100 + stride;
      if (strideKey !== lastHop && lastHop >= 0) puff(map.chefPoint);
      lastHop = strideKey;
      const arc = Math.sin(Math.PI * (strideT - stride));
      const point = pointAtDistance(hop.segment.curve, hop.table, hop.forward ? t : 1 - t);
      const lift = arc * 16;
      const squash = 1 + arc * 0.07;
      const facing = point.x >= map.chefPoint.x - 0.01 ? 1 : -1;
      const foot = CHEF_FOOT * Math.max(0, 1 - Math.sin(Math.PI * t) * 1.6);
      placeChef(point, lift, facing, squash, foot);
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
  }

  function onNodeClick(index) {
    if (!map || map.entering || map.nodes[index]?.disabled) return;
    if (index === map.chefAt && !map.walking) {
      enterCourse(index);
      return;
    }
    walkTo(index, { then: () => enterCourse(index) });
  }

  function enterCourse(index) {
    if (!map || map.entering) return;
    const entry = map.entries[index];
    if (!entry || map.nodes[index].disabled) return;
    map.entering = true;
    const screenPoint = project(map.layout.nodes[index]);
    cinematics.irisClose({ x: screenPoint.x, y: screenPoint.y - 40 }).then(() => {
      onEnterCourse(entry.index);
      cinematics.irisOpen();
    });
  }

  function playCourseReveals() {
    const indexes = map.revealIndexes;
    if (!indexes.length) return;
    indexes.forEach((index) => remember('courses', map.entries[index].level.id));
    const nodes = indexes.map((index) => map.nodes[index]);
    const segments = indexes.map((index) => map.segmentEls[index]);
    if (reduced()) {
      nodes.forEach((node) => node.classList.add('is-unsealed-quiet'));
      if (map.autoWalkTo !== null) walkTo(map.autoWalkTo);
      return;
    }
    nodes.forEach((node) => node.classList.add('is-sealed'));
    segments.forEach((segment) => segment.classList.add('is-sealed'));
    let token = null;
    const snapshot = map;
    const finish = () => {
      clearTimers();
      if (token) cinematics.end(token);
      token = null;
      if (map !== snapshot) return;
      nodes.forEach((node) => {
        node.classList.remove('is-sealed');
        node.classList.add('is-unsealed');
      });
      segments.forEach((segment) => segment.classList.remove('is-sealed'));
      if (map.autoWalkTo !== null && map.chefAt !== map.autoWalkTo) {
        const target = map.autoWalkTo;
        map.autoWalkTo = null;
        walkTo(target);
        map.walking?.finish();
      }
    };
    token = cinematics.begin('course-unlock', finish);
    later(() => segments.forEach((segment) => {
      segment.classList.remove('is-sealed');
      segment.classList.add('is-drawing');
    }), 120);
    later(() => {
      nodes.forEach((node) => {
        node.classList.remove('is-sealed');
        node.classList.add('is-unsealed');
        const rect = node.querySelector('.ow-node-plate').getBoundingClientRect();
        cinematics.sparkle(rect.left + rect.width / 2, rect.top + rect.height / 2);
        cinematics.confettiBurst(rect.left + rect.width / 2, rect.top + rect.height / 2, 24, 0.55);
      });
    }, 520);
    later(() => {
      if (token) cinematics.end(token);
      token = null;
      if (map === snapshot && map.autoWalkTo !== null) {
        const target = map.autoWalkTo;
        map.autoWalkTo = null;
        walkTo(target);
      }
    }, 960);
  }

  function onKeyDown(event) {
    if (!active || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.target?.closest?.('input, select, textarea')) return;
    if (view === 'select') {
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.code)) {
        event.preventDefault();
        moveCardFocus(event);
      } else if (event.code === 'Escape' || event.code === 'Backspace') {
        event.preventDefault();
        doc.getElementById('btn-back-char')?.click();
      }
      return;
    }
    if (view !== 'map' || !map || map.entering) return;
    const back = ['ArrowLeft', 'KeyA', 'ArrowUp', 'KeyW'].includes(event.code);
    const forward = ['ArrowRight', 'KeyD', 'ArrowDown', 'KeyS'].includes(event.code);
    if (back || forward) {
      event.preventDefault();
      if (event.repeat && map.walking) return;
      map.walking?.finish();
      const target = map.chefAt + (forward ? 1 : -1);
      if (target >= 0 && target < map.nodes.length && !map.nodes[target].disabled) {
        walkTo(target);
      } else if (!reduced()) {
        map.body.animate(
          [
            { transform: `translateX(0) scale(${map.facing}, 1)` },
            { transform: `translateX(${forward ? 6 : -6}px) scale(${map.facing}, 1)` },
            { transform: `translateX(0) scale(${map.facing}, 1)` },
          ],
          { duration: 180 },
        );
      }
    } else if (event.code === 'Escape' || event.code === 'Backspace') {
      event.preventDefault();
      overworld.querySelector('.ow-back')?.click();
    } else if ((event.code === 'Enter' || event.code === 'Space') && !event.target?.closest?.('button')) {
      event.preventDefault();
      enterCourse(map.chefAt);
    }
  }

  win.addEventListener('keydown', onKeyDown);
  win.addEventListener('resize', () => {
    if (active && view === 'map') relayout();
  });

  function swapView(nextView, animate) {
    const showMap = nextView === 'map';
    selectView.classList.toggle('hidden', showMap);
    overworld.classList.toggle('hidden', !showMap);
    screen.dataset.mapView = nextView;
    const entering = showMap ? overworld : selectView;
    entering.classList.remove('is-zoom-in', 'is-zoom-out');
    if (animate && !reduced()) {
      void entering.offsetWidth;
      entering.classList.add(showMap ? 'is-zoom-in' : 'is-zoom-out');
    }
  }

  function render(state) {
    if (state.screen !== 'world') {
      if (active) {
        active = false;
        clearTimers();
        map?.walking?.finish();
      }
      renderedKey = null;
      return;
    }
    save = state.save;
    loadMemory(save);
    const nextView = state.mapWorld === null ? 'select' : 'map';
    const key = [
      nextView,
      state.mapWorld,
      save.unlocked,
      JSON.stringify(save.best),
      save.chef,
    ].join('|');
    if (active && key === renderedKey) return;
    const wasActive = active;
    const previousView = view;
    active = true;
    renderedKey = key;
    clearTimers();
    view = nextView;
    swapView(nextView, wasActive && previousView !== nextView);

    if (nextView === 'select') {
      map = null;
      buildWorldSelect();
      if (wasActive) {
        queueMicrotask(() => cards.querySelector('[data-primary]')?.focus({ preventScroll: true }));
      }
      return;
    }

    lastWorld = state.mapWorld;
    const { firstVisit } = buildOverworld(state.mapWorld);
    if (wasActive) {
      queueMicrotask(() => map?.nodes[map.chefAt]?.focus({ preventScroll: true }));
    }
    const snapshot = map;
    if (firstVisit) {
      // Count every course already open here as seen; the intro covers them.
      pendingCourseReveals(memory, save, RELEASED_LEVELS, state.mapWorld)
        .forEach((id) => remember('courses', id));
      remember('worlds', state.mapWorld);
      cinematics.worldIntro({
        world: snapshot.world,
        ...worldAccent(snapshot.world.theme),
      });
      return;
    }
    later(() => {
      if (map === snapshot) playCourseReveals();
    }, wasActive && previousView === 'select' ? 300 : 200);
  }

  return {
    render,
    get view() { return active ? view : null; },
    get chefAt() { return map?.chefAt ?? null; },
    get walking() { return Boolean(map?.walking); },
  };
}
