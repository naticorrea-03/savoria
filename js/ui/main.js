import * as THREE from '../../vendor/three.module.js';
import { sfx } from '../audio/sfx.js';
import { GameSession } from '../core/game-session.js';
import { chefSpriteConfig } from '../core/chef-sprite.js';
import { createTextureStore } from '../core/texture-store.js';
import { collectVisualAssets } from '../visuals/manifest-utils.js';
import {
  MultiplayerClient,
  loadVendoredSdk,
} from '../multiplayer/client.js';
import {
  getLocalIdentity,
  saveGuestName,
} from '../multiplayer/identity.js';
import {
  inviteUrl,
  normalizeRoomCode,
  roomCodeFromSearch,
} from '../multiplayer/invite.js';
import {
  LOCAL_CORRECTION_MS,
  REMOTE_INTERPOLATION_MS,
} from '../multiplayer/netcode.js';
import { MultiplayerRunLoop } from '../multiplayer/run-loop.js';
import { MultiplayerCourseRenderer } from '../multiplayer/course-renderer.js';
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
let localIdentity = getLocalIdentity(localStorage);
let multiplayerClient = null;
let lobbyView = null;
let multiplayerStatus = { kind: 'idle', message: '' };
let multiplayerSdkLoaded = false;
let netcodeResetCount = 0;
let autoResumeRequestCount = 0;
let multiplayerPhaseHistory = [];
let multiplayerRunLoop = null;
let multiplayerPresentation = null;
let multiplayerCourseRenderer = null;
let multiplayerCourseLoadId = 0;
let multiplayerCompletionCount = 0;
let multiplayerFailureCount = 0;
let handledMultiplayerOutcome = null;

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

  const level = buildReleasedLevel(definition);

  const textures = createTextureStore({
    THREE,
    loader: new THREE.TextureLoader(),
    baseUrl: document.baseURI,
  });

  try {
    await textures.preload(
      [
        ...collectVisualAssets(level.theme.visuals),
        chefSpriteConfig(uiState.save.chef).path,
      ],
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

function unlockedLevelIds() {
  return RELEASED_LEVELS
    .slice(0, Math.max(1, Number(uiState.save.unlocked) || 1))
    .map(({ id }) => id);
}

function multiplayerJoinOptions() {
  return {
    characterId: $('online-character').value,
    unlockedLevelIds: unlockedLevelIds(),
  };
}

function setMultiplayerScreen(screen) {
  for (const id of ['title', 'online', 'lobby', 'online-course']) {
    $(`${id}-screen`).classList.toggle('hidden', screen !== id);
  }
  app.dataset.screen = screen;
  const root = $(`${screen}-screen`);
  const primary = root?.querySelector('[data-primary]:not(.hidden)') ?? root;
  queueMicrotask(() => primary?.focus({ preventScroll: true }));
}

function openOnline() {
  $('online-guest-name').value = localIdentity.guestName;
  $('online-character').value = uiState.save.chef;
  const code = roomCodeFromSearch(location.search);
  if (code) $('online-room-code').value = code;
  setMultiplayerScreen('online');
}

function openHome() {
  stopMultiplayerCourse();
  $('online-screen').classList.add('hidden');
  $('lobby-screen').classList.add('hidden');
  const url = new URL(location.href);
  url.searchParams.delete('room');
  history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
  renderUi(uiState, { previousScreen: 'online' });
}

function setOnlineStatus(message, kind = 'info') {
  multiplayerStatus = { kind, message };
  const status = $('online-status');
  status.textContent = message;
  status.dataset.kind = kind;
}

function setLobbyStatus(message, kind = 'info') {
  multiplayerStatus = { kind, message };
  const status = $('lobby-status');
  status.textContent = message;
  status.dataset.kind = kind;
}

function createPlayerCard(player, view) {
  const card = document.createElement('article');
  card.className = 'lobby-player';
  card.dataset.characterId = player.characterId;
  card.style.setProperty('--player-color', player.color);
  card.setAttribute('role', 'listitem');
  card.setAttribute('aria-label', `${player.guestName}, ${player.characterId}, ${player.ready ? 'ready' : 'not ready'}`);

  const avatar = document.createElement('div');
  avatar.className = 'lobby-player-avatar';
  const image = document.createElement('img');
  const character = CHARACTERS.find(({ id }) => id === player.characterId);
  image.src = character?.img ?? CHARACTERS[0].img;
  image.alt = '';
  avatar.append(image);

  const name = document.createElement('strong');
  name.className = 'lobby-player-name';
  name.textContent = player.guestName;
  const role = document.createElement('span');
  role.className = 'lobby-player-role';
  const roles = [];
  if (player.sessionId === view.hostPlayerId) roles.push('Host');
  if (player.isLocal) roles.push('You');
  role.textContent = roles.join(' · ') || 'Guest';
  const ready = document.createElement('span');
  ready.className = `lobby-player-ready${player.ready ? ' is-ready' : ''}`;
  ready.textContent = player.connected
    ? (player.ready ? 'Ready' : 'Choosing')
    : 'Reconnecting';
  card.append(avatar, name, role, ready);
  return card;
}

function renderLobby(view) {
  lobbyView = view;
  if (multiplayerPhaseHistory.at(-1) !== view.phase) {
    multiplayerPhaseHistory.push(view.phase);
  }
  if (view.phase === 'playing') {
    enterMultiplayerCourse(view);
    return;
  }
  if (multiplayerRunLoop && app.dataset.screen === 'online-course') {
    multiplayerRunLoop.updateState(view, performance.now());
    if (view.phase === 'paused') {
      if (view.pauseReason === 'host') {
        $('multiplayer-course-status').textContent = view.isHost
          ? 'Course paused. Press Escape to resume.'
          : 'The host paused the course.';
      } else {
        $('multiplayer-course-status').textContent = view.players.every(({ connected }) => connected)
          ? 'Both chefs reconnected. Resuming course.'
          : 'Waiting for the other chef to reconnect.';
      }
      return;
    }
    if (view.phase === 'completed') {
      completeMultiplayerCourse(view);
      return;
    }
    if (view.phase === 'failed') {
      failMultiplayerCourse(view);
      return;
    }
    stopMultiplayerCourse();
    if (view.phase === 'lobby') setMultiplayerScreen('lobby');
  }
  const players = $('lobby-players');
  players.replaceChildren(...view.players.map((player) => createPlayerCard(player, view)));
  $('lobby-room-code').textContent = multiplayerClient?.roomCode ?? '------';

  const course = $('lobby-course');
  const visibleLevelIds = view.isHost
    ? unlockedLevelIds()
    : RELEASED_LEVELS.map(({ id }) => id);
  course.replaceChildren(...visibleLevelIds.map((levelId) => {
    const level = RELEASED_LEVELS.find(({ id }) => id === levelId);
    const option = document.createElement('option');
    option.value = levelId;
    option.textContent = `${levelId} ${level?.name ?? levelId}`;
    return option;
  }));
  if ([...course.options].some(({ value }) => value === view.selectedLevelId)) {
    course.value = view.selectedLevelId;
  }
  course.disabled = !view.isHost || view.phase !== 'lobby';

  const localPlayer = view.players.find(({ isLocal }) => isLocal);
  const ready = $('lobby-ready');
  ready.textContent = localPlayer?.ready ? 'Not ready' : 'Ready up';
  ready.disabled = !localPlayer?.connected || view.phase !== 'lobby';
  ready.dataset.ready = String(localPlayer?.ready === true);

  const start = $('lobby-start');
  start.classList.toggle('hidden', !view.isHost);
  start.disabled = !view.canStart || view.phase !== 'lobby';

  if (view.phase === 'playing') {
    setLobbyStatus('Course starting. Both chefs are connected.', 'connected');
  } else if (view.players.length < 2) {
    setLobbyStatus('Waiting for another chef. Share the private room code.');
  } else if (!view.canStart) {
    setLobbyStatus('Both chefs need to ready up.');
  } else {
    setLobbyStatus('Both chefs are ready. The host can start.');
  }
}

function enterMultiplayerCourse(view) {
  if (!multiplayerRunLoop) {
    multiplayerRunLoop = new MultiplayerRunLoop({
      sendInput: (input) => multiplayerClient?.sendInput(input),
      requestResume: () => {
        autoResumeRequestCount += 1;
        multiplayerClient?.resume();
      },
      onPresentation: renderMultiplayerPresentation,
      inputTarget: window,
    });
  }
  multiplayerRunLoop.updateState(view, performance.now());
  $('multiplayer-course-code').textContent = multiplayerClient?.roomCode ?? '------';
  if (app.dataset.screen !== 'online-course') {
    handledMultiplayerOutcome = null;
    setMultiplayerScreen('online-course');
    multiplayerRunLoop.start();
    void loadMultiplayerCourse(view);
  }
}

function renderMultiplayerPresentation(presentation) {
  multiplayerPresentation = presentation;
  const container = $('multiplayer-course-players');
  const existing = new Map(
    [...container.children].map((marker) => [marker.dataset.multiplayerPlayer, marker]),
  );
  const activeIds = new Set();
  presentation.players.forEach((player) => {
    activeIds.add(player.sessionId);
    let marker = existing.get(player.sessionId);
    if (!marker) {
      marker = document.createElement('article');
      marker.dataset.multiplayerPlayer = player.sessionId;
      const image = document.createElement('img');
      image.alt = '';
      const copy = document.createElement('div');
      const name = document.createElement('strong');
      const stats = document.createElement('span');
      copy.append(name, stats);
      marker.append(image, copy);
      container.append(marker);
    }
    marker.className = `multiplayer-course-player${player.isLocal ? ' is-local' : ''}`;
    marker.dataset.characterId = player.characterId;
    marker.style.setProperty('--player-color', player.color);
    marker.setAttribute('aria-label', `${player.guestName}${player.isLocal ? ', you' : ''}`);
    const character = CHARACTERS.find(({ id }) => id === player.characterId);
    const image = marker.querySelector('img');
    image.src = character?.img ?? CHARACTERS[0].img;
    marker.querySelector('strong').textContent = player.guestName;
    marker.querySelector('span').textContent = `${'❤️'.repeat(player.hearts)} · ${player.lives} lives${player.power ? ` · ${player.power.type} ${Math.ceil(player.power.seconds)}s` : ''}`;
    container.append(marker);
  });
  for (const [sessionId, marker] of existing) {
    if (!activeIds.has(sessionId)) marker.remove();
  }
  $('multiplayer-tomato-count').textContent = String(lobbyView?.tomatoCount ?? 0);
  $('multiplayer-timer').textContent = formatTime(lobbyView?.timer ?? 0);
  multiplayerCourseRenderer?.render(presentation, lobbyView, performance.now());
}

async function loadMultiplayerCourse(view) {
  const definition = RELEASED_LEVELS.find(({ id }) => id === view.selectedLevelId);
  if (!definition || !hasWebGL()) {
    $('multiplayer-course-status').textContent = 'This browser cannot render the course.';
    return;
  }
  const loadId = ++multiplayerCourseLoadId;
  const level = buildReleasedLevel(definition);
  const textures = createTextureStore({
    THREE,
    loader: new THREE.TextureLoader(),
    baseUrl: document.baseURI,
  });
  const characterAssets = [...new Set(view.players.map(({ characterId }) => (
    chefSpriteConfig(characterId).path
  )))];
  try {
    await textures.preload([
      ...collectVisualAssets(level.theme.visuals),
      ...characterAssets,
    ]);
  } catch (error) {
    textures.dispose();
    if (loadId === multiplayerCourseLoadId) {
      $('multiplayer-course-status').textContent = `Could not load ${failedAssetName(error)}.`;
    }
    return;
  }
  if (loadId !== multiplayerCourseLoadId || app.dataset.screen !== 'online-course') {
    textures.dispose();
    return;
  }
  multiplayerCourseRenderer?.destroy();
  multiplayerCourseRenderer = new MultiplayerCourseRenderer({
    container: $('multiplayer-course-stage'),
    level,
    textures,
  });
  $('multiplayer-course-title').textContent = `${definition.id} ${definition.name}`;
  $('multiplayer-course-status').textContent = view.isHost
    ? 'Course connected. Escape pauses for both chefs.'
    : 'Course connected. Escape leaves the room.';
  if (multiplayerPresentation) {
    multiplayerCourseRenderer.render(multiplayerPresentation, lobbyView, performance.now());
  }
}

function completeMultiplayerCourse(view) {
  const outcome = `completed:${multiplayerClient?.roomCode}:${view.completion?.levelId}`;
  if (handledMultiplayerOutcome === outcome || !view.completion) return;
  handledMultiplayerOutcome = outcome;
  multiplayerCompletionCount += 1;
  const local = view.players.find(({ isLocal }) => isLocal);
  $('online-course-screen').classList.add('hidden');
  stopMultiplayerCourse();
  dispatch({
    type: 'COURSE_COMPLETE',
    levelId: view.completion.levelId,
    stars: view.completion.stars,
    stats: {
      coins: view.completion.tomatoCount,
      totalCoins: view.completion.totalTomatoes,
      time: Math.round(view.completion.elapsed),
      hearts: local?.hearts ?? 0,
    },
  });
}

function failMultiplayerCourse(view) {
  const outcome = `failed:${multiplayerClient?.roomCode}:${view.authoritativeTick}`;
  if (handledMultiplayerOutcome === outcome) return;
  handledMultiplayerOutcome = outcome;
  multiplayerFailureCount += 1;
  $('online-course-screen').classList.add('hidden');
  stopMultiplayerCourse();
  dispatch({ type: 'GAME_OVER' });
}

function stopMultiplayerCourse() {
  multiplayerCourseLoadId += 1;
  multiplayerRunLoop?.stop();
  multiplayerRunLoop = null;
  multiplayerPresentation = null;
  multiplayerCourseRenderer?.destroy();
  multiplayerCourseRenderer = null;
}

function handleMultiplayerStatus(status) {
  if (status.kind === 'expired') {
    stopMultiplayerCourse();
    setOnlineStatus(status.message, status.kind);
    openOnline();
    return;
  }
  setLobbyStatus(status.message, status.kind);
}

async function connectMultiplayer(mode) {
  const roomCode = normalizeRoomCode($('online-room-code').value);
  if (mode === 'join' && !roomCode) {
    setOnlineStatus('Enter a valid six-character room code.', 'error');
    return;
  }

  localIdentity = saveGuestName(localStorage, $('online-guest-name').value);
  autoResumeRequestCount = 0;
  multiplayerPhaseHistory = [];
  setOnlineStatus(mode === 'create' ? 'Creating your private kitchen…' : 'Joining the kitchen…');
  multiplayerClient = new MultiplayerClient({
    identity: localIdentity,
    loadSdk: async () => {
      const sdk = await loadVendoredSdk();
      multiplayerSdkLoaded = true;
      return sdk;
    },
    onState: renderLobby,
    onStatus: handleMultiplayerStatus,
    resetNetcode: () => {
      netcodeResetCount += 1;
      multiplayerRunLoop?.reset();
    },
  });

  try {
    const room = mode === 'create'
      ? await multiplayerClient.createRoom(multiplayerJoinOptions())
      : await multiplayerClient.joinRoom(roomCode, multiplayerJoinOptions());
    history.replaceState(null, '', inviteUrl(location.href, room.roomId));
    $('lobby-room-code').textContent = room.roomId;
    setMultiplayerScreen('lobby');
  } catch (error) {
    multiplayerClient = null;
    const message = mode === 'join'
      ? 'That room expired. Create a new room or enter another code.'
      : 'The online kitchen is unavailable. Try again.';
    setOnlineStatus(message, mode === 'join' ? 'expired' : 'error');
  }
}

async function leaveLobby() {
  stopMultiplayerCourse();
  await multiplayerClient?.leave();
  multiplayerClient = null;
  lobbyView = null;
  openOnline();
}

function handleAction(action, target, event) {
  switch (action) {
    case 'start':
      sfx.ensure();
      sfx.coin();
      dispatch({ type: 'START' });
      break;
    case 'online':
      openOnline();
      break;
    case 'back-home':
      openHome();
      break;
    case 'create-room':
      void connectMultiplayer('create');
      break;
    case 'join-room':
      void connectMultiplayer('join');
      break;
    case 'lobby-ready':
      multiplayerClient?.setReady(target.dataset.ready !== 'true');
      break;
    case 'lobby-start':
      multiplayerClient?.start();
      break;
    case 'copy-invite':
      navigator.clipboard?.writeText(inviteUrl(location.href, multiplayerClient.roomCode))
        .then(() => setLobbyStatus('Invite link copied.'))
        .catch(() => setLobbyStatus('Copy the room code above.', 'error'));
      break;
    case 'leave-lobby':
      void leaveLobby();
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

$('online-room-code').addEventListener('input', (event) => {
  event.target.value = event.target.value.toUpperCase().replace(/[\s-]+/g, '').slice(0, 6);
});

$('lobby-course').addEventListener('change', (event) => {
  if (lobbyView?.isHost) multiplayerClient?.selectLevel(event.target.value);
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
  if (app.dataset.screen === 'online-course' && event.code === 'Escape' && !event.repeat) {
    event.preventDefault();
    if (lobbyView?.isHost) {
      if (lobbyView.phase === 'paused') multiplayerClient?.resume();
      else multiplayerClient?.pause();
    }
    else void leaveLobby();
  }
});

addEventListener('blur', () => {
  if (dispatch({ type: 'PAUSE' })) session?.pause();
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden && dispatch({ type: 'PAUSE' })) session?.pause();
});

addEventListener('beforeunload', () => {
  cancelLevel();
  void multiplayerClient?.leave();
});

function showScreen(id) {
  dispatch({ type: 'HOOK_SHOW_SCREEN', id });
}

window.__savoriaTest = {
  startLevel,
  showScreen,
  releasedLevels: RELEASED_LEVELS,
  get session() { return session; },
  multiplayer: {
    get identity() { return { ...localIdentity }; },
    get view() { return lobbyView; },
    get status() { return { ...multiplayerStatus }; },
    get sdkLoaded() { return multiplayerSdkLoaded; },
    get netcodeResetCount() { return netcodeResetCount; },
    get autoResumeRequestCount() { return autoResumeRequestCount; },
    get phaseHistory() { return [...multiplayerPhaseHistory]; },
    get pendingInputCount() { return multiplayerRunLoop?.pendingInputCount ?? 0; },
    get authorityPlaying() { return multiplayerRunLoop?.authorityPlaying ?? false; },
    get presentation() { return multiplayerPresentation; },
    get completionCount() { return multiplayerCompletionCount; },
    get failureCount() { return multiplayerFailureCount; },
    get renderedPlayerCount() { return multiplayerCourseRenderer?.playerVisuals.size ?? 0; },
    get hasCourseCanvas() { return Boolean(multiplayerCourseRenderer?.renderer.domElement.isConnected); },
    control(payload) { multiplayerClient?.testControl(payload); },
    drop() { multiplayerClient?.dropForTest(); },
    reconnect() { return multiplayerClient?.reconnectForTest(); },
    timing: {
      remoteInterpolationMs: REMOTE_INTERPOLATION_MS,
      localCorrectionMs: LOCAL_CORRECTION_MS,
    },
  },
};

renderUi(uiState);
if (roomCodeFromSearch(location.search)) openOnline();
if (uiState.notice) {
  setTimeout(() => dispatch({ type: 'DISMISS_NOTICE' }), 6000);
}
