// Savoria 3D UI state machine: menus, world map, HUD, lives, progression.
import * as THREE from '../../vendor/three.module.js';
import { sfx } from '../audio/sfx.js';
import { GameSession } from '../core/game-session.js';
import { createTextureStore } from '../core/texture-store.js';
import { WORLD_ONE_ASSETS } from '../core/world-builder.js';
import {
  RELEASED_LEVELS,
  RELEASED_WORLDS,
  buildReleasedLevel,
} from '../levels/index.js';
import { createActiveProgressReporter } from './level-loading.js';
import { loadSave, writeSave, recordCompletion } from './save-store.js';

const $ = (id) => document.getElementById(id);
const app = $('app');

const CHARS = [
  { id: 'fatsio', name: 'Fatsio', desc: 'Big heart, bigger appetite.', img: 'assets/sprites/fatsio.png' },
  { id: 'dinnerette', name: 'Dinnerette', desc: 'Royalty with a whisk.', img: 'assets/sprites/dinnerette.png' },
  { id: 'chefno', name: 'Chefno', desc: 'Small chef, huge flavor.', img: 'assets/sprites/chefno.png' },
];

// ── save data ──
const loaded = loadSave(localStorage);
let save = loaded.save;
let saveRepairPending = loaded.recovered;

// ── run state ──
let session = null;
let currentChar = CHARS.find((char) => char.id === save.chef) ?? CHARS[0];
let currentLevel = 0;   // index into RELEASED_LEVELS
let lives = 4;
let levelStartId = 0;

// ── screens ──
const screens = ['title-screen', 'char-screen', 'map-screen', 'gameover-screen', 'win-screen'];
function showScreen(id) {
  screens.forEach((s) => $(s).classList.toggle('hidden', s !== id));
  $('hud').classList.add('hidden');
  $('pause-overlay').classList.add('hidden');
  $('complete-overlay').classList.add('hidden');
  if (id) $(id).classList.add('fade-in');
  if (document.activeElement?.blur) document.activeElement.blur();
}

// ── HUD ──
function renderHearts(n) {
  $('hud-hearts').textContent = '❤️'.repeat(Math.max(0, n)) + '🖤'.repeat(Math.max(0, 3 - n));
}
function fmtTime(t) {
  const m = Math.floor(t / 60), s = Math.floor(t % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}
let msgTimer = null;
function hudMsg(text, ms = 2200) {
  const el = $('hud-msg');
  el.textContent = text;
  el.style.opacity = 1;
  clearTimeout(msgTimer);
  msgTimer = setTimeout(() => { el.style.opacity = 0; }, ms);
}

function showLoadProgress(progress) {
  hudMsg(`Loading ${Math.round(progress * 100)}%`, 500);
}

function showInitialHudMessage(levelName) {
  if (saveRepairPending) {
    saveRepairPending = false;
    hudMsg('Save repaired', 2600);
    return;
  }
  hudMsg(levelName, 2600);
}

const POWER_ICONS = {
  speed: 'assets/sprites/speed_pasta.png',
  shield: 'assets/sprites/parmesan_shield.png',
  boost: 'assets/sprites/basil_boost.png',
};

function onGameEvent(type, data) {
  switch (type) {
    case 'coins': {
      $('tomato-count').textContent = data;
      if (data > 0 && data % 100 === 0) { lives++; $('life-count').textContent = lives; hudMsg('Extra chef! +1 life 👨‍🍳'); }
      break;
    }
    case 'hearts': renderHearts(data); break;
    case 'timer': $('timer-text').textContent = fmtTime(data); break;
    case 'msg': hudMsg(data); break;
    case 'flash': {
      const f = $('hurt-flash');
      f.style.opacity = 0.55;
      setTimeout(() => { f.style.opacity = 0; }, 180);
      break;
    }
    case 'power': {
      const el = $('hud-power');
      if (!data) { el.style.display = 'none'; break; }
      el.style.display = 'flex';
      $('power-icon').src = POWER_ICONS[data.type];
      $('power-time').textContent = Math.ceil(data.t) + 's';
      break;
    }
    case 'bossShow':
    case 'bossHp': {
      $('hud-boss').style.display = 'flex';
      $('boss-fill').style.width = (data.hp / data.maxHp) * 100 + '%';
      if (data.hp <= 0) setTimeout(() => { $('hud-boss').style.display = 'none'; }, 1200);
      break;
    }
    case 'pause': pauseGame(); break;
    case 'died': onDied(); break;
    case 'complete': onComplete(data); break;
  }
}

// ── session lifecycle ──
async function startLevel(idx) {
  const startId = ++levelStartId;
  const textures = createTextureStore({
    THREE,
    loader: new THREE.TextureLoader(),
    baseUrl: document.baseURI,
  });
  try {
    await textures.preload(
      WORLD_ONE_ASSETS,
      createActiveProgressReporter(startId, () => levelStartId, showLoadProgress),
    );
  } catch (error) {
    textures.dispose();
    if (startId === levelStartId) hudMsg('Could not load level');
    console.error('Could not preload game textures', error);
    return;
  }
  if (startId !== levelStartId) {
    textures.dispose();
    return;
  }
  if (session) { session.destroy(); session = null; }
  currentLevel = idx;
  const level = buildReleasedLevel(RELEASED_LEVELS[idx]);
  session = new GameSession({
    container: app,
    level,
    characterId: currentChar.id,
    textures,
    emit: onGameEvent,
  });
  showScreen(null);
  $('hud').classList.remove('hidden');
  renderHearts(3);
  $('tomato-count').textContent = '0';
  $('life-count').textContent = lives;
  $('timer-text').textContent = fmtTime(level.time);
  const def = RELEASED_LEVELS[idx];
  const wdef = RELEASED_WORLDS.find((w) => w.n === def.world);
  $('hlp-world').textContent = wdef.name.toUpperCase();
  $('hlp-num').textContent = `${def.world}-${def.idx}`;
  $('hlp-name').textContent = def.name.replace(/^\d+-\d+\s*/, '');
  const st = save.best[def.id] || 0;
  $('hlp-stars').textContent = '⭐'.repeat(st) + '☆'.repeat(3 - st);
  $('hud-chef').src = currentChar.img;
  $('hud-power').style.display = 'none';
  $('hud-boss').style.display = 'none';
  showInitialHudMessage(level.name);
  session.start();
}

function pauseGame() {
  if (!session || session.finished) return;
  session.pause();
  $('pause-overlay').classList.remove('hidden');
}
function resumeGame() {
  $('pause-overlay').classList.add('hidden');
  if (document.activeElement?.blur) document.activeElement.blur();
  session?.resume();
}

function onDied() {
  lives--;
  $('life-count').textContent = lives;
  if (lives <= 0) {
    setTimeout(() => { session?.destroy(); session = null; showScreen('gameover-screen'); }, 900);
  } else {
    hudMsg('Ouch! Chefs left: ' + lives, 2000);
    setTimeout(() => startLevel(currentLevel), 1100);
  }
}

function onComplete(stats) {
  const coinPct = stats.totalCoins ? stats.coins / stats.totalCoins : 1;
  const stars = 1 + (coinPct >= 0.6 ? 1 : 0) + (stats.hearts >= 2 ? 1 : 0);
  const id = RELEASED_LEVELS[currentLevel].id;
  save = recordCompletion(save, id, stars, currentLevel + 2);
  writeSave(localStorage, save);

  $('complete-title').textContent = stats.isBoss ? 'The Don is Toast!' : 'Course Clear!';
  $('complete-stars').textContent = '⭐'.repeat(stars) + '☆'.repeat(3 - stars);
  $('complete-stats').innerHTML =
    `🍅 ${stats.coins} / ${stats.totalCoins} tomatoes<br>⏱ ${fmtTime(stats.time)}`;
  $('btn-next').textContent = stats.isBoss ? 'Finish' : (currentLevel + 1 < RELEASED_LEVELS.length ? 'Next Level →' : 'World Map');
  $('complete-overlay').classList.remove('hidden');
  $('complete-overlay').dataset.isboss = stats.isBoss ? '1' : '';
}

// ── screen builders ──
function buildCharScreen() {
  const row = $('char-cards');
  row.innerHTML = '';
  for (const c of CHARS) {
    const card = document.createElement('div');
    card.className = 'char-card';
    card.innerHTML = `<img src="${c.img}"><div class="name">${c.name}</div><div class="desc">${c.desc}</div>`;
    card.onclick = () => {
      currentChar = c;
      save = { ...save, chef: c.id };
      writeSave(localStorage, save);
      sfx.coin();
      buildMapScreen();
      showScreen('map-screen');
    };
    row.appendChild(card);
  }
}

// World map: one strip per world (matches the Savoria world-select design),
// with level nodes joined by a dotted path.
function buildMapScreen() {
  const list = $('map-worlds');
  list.innerHTML = '';
  RELEASED_WORLDS.forEach((w) => {
    const worldLevels = RELEASED_LEVELS.map((L, i) => ({ L, i })).filter(({ L }) => L.world === w.n);
    const anyOpen = worldLevels.some(({ i }) => i < save.unlocked);
    const strip = document.createElement('div');
    strip.className = 'world-strip' + (anyOpen ? '' : ' locked');
    strip.style.backgroundImage = `url('${w.thumb}')`;
    const stars = worldLevels.reduce((n, { L }) => n + (save.best[L.id] || 0), 0);

    const badge = document.createElement('div');
    badge.className = 'world-badge';
    badge.innerHTML = `<span class="wnum">${w.n}</span>
      <span class="wname">${w.name}<small>${w.cuisine}</small></span>
      <span class="wstars">${anyOpen ? '⭐' + stars + '/' + worldLevels.length * 3 : '🔒'}</span>`;
    strip.appendChild(badge);

    const nodes = document.createElement('div');
    nodes.className = 'level-nodes';
    worldLevels.forEach(({ L, i }) => {
      const open = i < save.unlocked;
      const node = document.createElement('button');
      node.className = 'level-node' + (open ? '' : ' locked') + (i === save.unlocked - 1 ? ' current' : '');
      const st = save.best[L.id] || 0;
      node.innerHTML = open
        ? `<span class="nid">${L.world}-${L.idx}</span><span class="nstars">${st ? '⭐'.repeat(st) : '·'}</span>`
        : '🔒';
      node.title = open ? `${L.world}-${L.idx} ${L.name}` : 'Locked';
      if (open) node.onclick = () => { sfx.coin(); startLevel(i); };
      nodes.appendChild(node);
    });
    strip.appendChild(nodes);
    list.appendChild(strip);
  });
  $('map-lives').textContent = lives;
}

// ── wire buttons ──
$('btn-play').onclick = () => { sfx.ensure(); sfx.coin(); buildCharScreen(); showScreen('char-screen'); };
$('btn-back-char').onclick = () => showScreen('char-screen');
$('btn-resume').onclick = resumeGame;
$('btn-restart').onclick = () => { $('pause-overlay').classList.add('hidden'); startLevel(currentLevel); };
$('btn-quit').onclick = () => {
  levelStartId++;
  session?.destroy();
  session = null;
  buildMapScreen();
  showScreen('map-screen');
};
$('btn-next').onclick = () => {
  const isBoss = $('complete-overlay').dataset.isboss === '1';
  session?.destroy(); session = null;
  if (isBoss) { showScreen('win-screen'); return; }
  if (currentLevel + 1 < RELEASED_LEVELS.length) startLevel(currentLevel + 1);
  else { buildMapScreen(); showScreen('map-screen'); }
};
$('btn-replay').onclick = () => startLevel(currentLevel);
$('btn-go-retry').onclick = () => { lives = 4; startLevel(currentLevel); };
$('btn-go-menu').onclick = () => { lives = 4; buildMapScreen(); showScreen('map-screen'); };
$('btn-win-menu').onclick = () => { buildMapScreen(); showScreen('map-screen'); };

// testing hooks
window.__savoriaTest = {
  startLevel,
  showScreen,
  releasedLevels: RELEASED_LEVELS,
  get session() { return session; },
};

showScreen('title-screen');
