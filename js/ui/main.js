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
import { loadSave, writeSave } from './save-store.js';
import {
  CHARACTERS,
  createWebGLCapabilityProbe,
  formatTime,
  initialUiState,
  reduceUiState,
  renderUi,
} from './ui-state.js';

const $ = (id) => document.getElementById(id);
const app = $('app');
const gameStage = $('game-stage');
const loaded = loadSave(localStorage);
if (loaded.recovered) writeSave(localStorage, loaded.save);

let uiState = initialUiState({
  save: loaded.save,
  saveRecovered: loaded.recovered,
});
let session = null;
let lives = 4;
let levelStartId = 0;
let msgTimer = null;
const hasWebGL = createWebGLCapabilityProbe(() => document.createElement('canvas'));

function dispatch(event) {
  const previous = uiState;
  const next = reduceUiState(previous, event);
  if (next === previous) return false;
  uiState = next;
  if (next.save !== previous.save) writeSave(localStorage, next.save);
  renderUi(next, { previousScreen: previous.screen });
  if (next.screen === 'world') $('map-lives').textContent = String(lives);
  return true;
}

function renderHearts(count) {
  const hearts = $('hud-hearts');
  const safeCount = Math.max(0, count);
  hearts.textContent = '❤️'.repeat(safeCount) + '🖤'.repeat(Math.max(0, 3 - safeCount));
  hearts.setAttribute('aria-label', `${safeCount} hearts`);
}

function hudMsg(text, duration = 2200) {
  const message = $('hud-msg');
  message.textContent = text;
  message.style.opacity = 1;
  clearTimeout(msgTimer);
  msgTimer = setTimeout(() => {
    message.style.opacity = 0;
  }, duration);
}

const POWER_ICONS = {
  speed: 'assets/sprites/speed_pasta.png',
  shield: 'assets/sprites/parmesan_shield.png',
  boost: 'assets/sprites/basil_boost.png',
};

function onGameEvent(type, data) {
  switch (type) {
    case 'coins':
      $('tomato-count').textContent = String(data);
      if (data > 0 && data % 100 === 0) {
        lives += 1;
        hudMsg('Extra chef! +1 life 👨‍🍳');
      }
      break;
    case 'hearts':
      renderHearts(data);
      break;
    case 'timer':
      $('timer-text').textContent = formatTime(data);
      break;
    case 'msg':
      hudMsg(data);
      break;
    case 'flash': {
      const flash = $('hurt-flash');
      flash.style.opacity = 0.55;
      setTimeout(() => { flash.style.opacity = 0; }, 180);
      break;
    }
    case 'power': {
      const power = $('hud-power');
      if (!data) {
        power.style.display = 'none';
        break;
      }
      power.style.display = 'flex';
      $('power-icon').src = POWER_ICONS[data.type];
      $('power-icon').alt = `${data.type} power`;
      $('power-time').textContent = `${Math.ceil(data.t)}s`;
      break;
    }
    case 'bossShow':
    case 'bossHp':
      $('hud-boss').style.display = 'flex';
      $('boss-fill').style.width = `${(data.hp / data.maxHp) * 100}%`;
      if (data.hp <= 0) {
        setTimeout(() => { $('hud-boss').style.display = 'none'; }, 1200);
      }
      break;
    case 'pause':
      if (dispatch({ type: 'PAUSE' })) session?.pause();
      break;
    case 'died':
      onDied();
      break;
    case 'complete':
      onComplete(data);
      break;
  }
}

function failedAssetName(error) {
  if (error?.asset) return error.asset;
  const path = String(error?.path ?? 'unknown-asset');
  return path.split(/[/?#]/).filter(Boolean).at(-1) ?? 'unknown-asset';
}

async function startLevel(index) {
  const definition = RELEASED_LEVELS[index];
  if (!definition) return;
  if (uiState.screen !== 'loading') {
    const selected = dispatch({
      type: 'SELECT_LEVEL',
      levelId: definition.id,
      levelIndex: index,
    });
    if (!selected) return;
  }

  const startId = ++levelStartId;
  if (!hasWebGL()) {
    if (startId === levelStartId) dispatch({ type: 'WEBGL_FAILED' });
    return;
  }

  const textures = createTextureStore({
    THREE,
    loader: new THREE.TextureLoader(),
    baseUrl: document.baseURI,
  });

  try {
    await textures.preload(
      WORLD_ONE_ASSETS,
      createActiveProgressReporter(
        startId,
        () => levelStartId,
        (progress) => dispatch({ type: 'LOAD_PROGRESS', progress }),
      ),
    );
  } catch (error) {
    textures.dispose();
    if (startId === levelStartId) {
      dispatch({ type: 'LOAD_FAILED', asset: failedAssetName(error) });
    }
    return;
  }

  if (startId !== levelStartId) {
    textures.dispose();
    return;
  }

  const level = buildReleasedLevel(definition);
  let nextSession;
  try {
    nextSession = new GameSession({
      container: gameStage,
      level,
      characterId: uiState.save.chef,
      textures,
      emit: onGameEvent,
    });
  } catch (error) {
    textures.dispose();
    if (startId === levelStartId) dispatch({ type: 'WEBGL_FAILED' });
    return;
  }

  session?.destroy();
  session = nextSession;
  renderHearts(3);
  $('tomato-count').textContent = '0';
  $('timer-text').textContent = formatTime(level.time);
  const world = RELEASED_WORLDS.find(({ n }) => n === definition.world);
  $('hlp-world').textContent = world.name.toUpperCase();
  $('hlp-num').textContent = definition.id;
  $('hlp-name').textContent = definition.name;
  const stars = uiState.save.best[definition.id] ?? 0;
  $('hlp-stars').textContent = '⭐'.repeat(stars) + '☆'.repeat(3 - stars);
  $('hlp-stars').setAttribute('aria-label', `${stars} of 3 course stars`);
  $('hud-power').style.display = 'none';
  $('hud-boss').style.display = 'none';
  dispatch({ type: 'LOAD_READY' });
  hudMsg(level.name, 2600);
  session.start();
}

function onDied() {
  lives -= 1;
  if (lives <= 0) {
    const endedSession = session;
    setTimeout(() => {
      if (session !== endedSession) return;
      session?.destroy();
      session = null;
      dispatch({ type: 'GAME_OVER' });
    }, 900);
    return;
  }

  hudMsg(`Ouch! Chefs left: ${lives}`, 2000);
  const endedSession = session;
  setTimeout(() => {
    if (session !== endedSession) return;
    dispatch({ type: 'REPLAY' });
    startLevel(uiState.selectedLevelIndex);
  }, 1100);
}

function onComplete(stats) {
  const coinPercent = stats.totalCoins ? stats.coins / stats.totalCoins : 1;
  const stars = 1 + (coinPercent >= 0.6 ? 1 : 0) + (stats.hearts >= 2 ? 1 : 0);
  dispatch({
    type: 'COURSE_COMPLETE',
    levelId: uiState.selectedLevelId,
    stars,
    stats,
  });
}

function cancelLevel() {
  levelStartId += 1;
  session?.destroy();
  session = null;
}

function handleAction(action, target, event) {
  switch (action) {
    case 'start':
      sfx.ensure();
      sfx.coin();
      dispatch({ type: 'START' });
      break;
    case 'choose-character':
      sfx.coin();
      dispatch({ type: 'CHOOSE_CHARACTER', characterId: target.dataset.characterId });
      break;
    case 'back-to-characters':
      dispatch({ type: 'BACK_TO_CHARACTERS' });
      break;
    case 'select-level': {
      const index = Number(target.dataset.levelIndex);
      const selected = dispatch({
        type: 'SELECT_LEVEL',
        levelId: target.dataset.levelId,
        levelIndex: index,
      });
      if (selected) {
        sfx.coin();
        startLevel(index);
      }
      break;
    }
    case 'resume':
      if (dispatch({ type: 'RESUME' })) session?.resume();
      break;
    case 'replay':
      if (dispatch({ type: 'REPLAY' })) startLevel(uiState.selectedLevelIndex);
      break;
    case 'quit-to-world':
      event?.preventDefault();
      cancelLevel();
      lives = 4;
      dispatch({ type: 'QUIT_TO_WORLD' });
      break;
    case 'continue':
      cancelLevel();
      dispatch({ type: 'CONTINUE' });
      break;
    case 'retry': {
      const wasGameOver = Boolean(uiState.error?.gameOver);
      const retried = dispatch({ type: 'RETRY' });
      if (retried) {
        if (wasGameOver) lives = 4;
        startLevel(uiState.selectedLevelIndex);
      }
      break;
    }
    case 'dismiss-notice':
      dispatch({ type: 'DISMISS_NOTICE' });
      break;
  }
}

app.addEventListener('click', (event) => {
  const target = event.target.closest('[data-action]');
  if (!target || !app.contains(target)) return;
  handleAction(target.dataset.action, target, event);
});

const movementCodes = new Set([
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'KeyA',
  'KeyD',
  'ShiftLeft',
  'ShiftRight',
  'Space',
]);

addEventListener('keydown', (event) => {
  const focusedLink = event.target?.closest?.('a[href]');
  if (event.code === 'Space' && focusedLink) {
    event.preventDefault();
    focusedLink.click();
    return;
  }
  if (uiState.screen === 'playing' && movementCodes.has(event.code)) {
    dispatch({ type: 'MOVEMENT_USED' });
  }
});

addEventListener('blur', () => {
  if (dispatch({ type: 'PAUSE' })) session?.pause();
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden && dispatch({ type: 'PAUSE' })) session?.pause();
});

addEventListener('beforeunload', cancelLevel);

function showScreen(id) {
  dispatch({ type: 'HOOK_SHOW_SCREEN', id });
}

window.__savoriaTest = {
  startLevel,
  showScreen,
  releasedLevels: RELEASED_LEVELS,
  get session() { return session; },
};

renderUi(uiState);
if (uiState.notice) {
  setTimeout(() => dispatch({ type: 'DISMISS_NOTICE' }), 6000);
}
