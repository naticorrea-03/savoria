import { RELEASED_LEVELS, RELEASED_WORLDS } from '../levels/index.js';
import { createFreshSave, recordCompletion } from './save-store.js';

export const CHARACTERS = [
  { id: 'fatsio', name: 'Fatsio', desc: 'Big heart, bigger appetite.', img: 'assets/sprites/fatsio.png' },
  { id: 'dinnerette', name: 'Dinnerette', desc: 'Royalty with a whisk.', img: 'assets/sprites/dinnerette.png' },
  { id: 'chefno', name: 'Chefno', desc: 'Small chef, huge flavor.', img: 'assets/sprites/chefno.png' },
];

const RELEASED_IDS = new Set(RELEASED_LEVELS.map(({ id }) => id));

export function initialUiState({
  save = createFreshSave(),
  saveRecovered = false,
} = {}) {
  return {
    screen: 'title',
    save,
    selectedLevelId: null,
    selectedLevelIndex: null,
    loadingPercent: 0,
    error: null,
    completion: null,
    helpVisible: true,
    notice: saveRecovered
      ? 'We reset a damaged save. Your adventure can continue.'
      : null,
  };
}

export function reduceUiState(state, event) {
  switch (event.type) {
    case 'RETURN_TITLE':
      return { ...state, screen: 'title', error: null, completion: null };
    case 'START':
      return { ...state, screen: 'characters', error: null };
    case 'CHOOSE_CHARACTER': {
      if (!CHARACTERS.some(({ id }) => id === event.characterId)) return state;
      return {
        ...state,
        screen: 'world',
        save: { ...state.save, chef: event.characterId },
        error: null,
      };
    }
    case 'BACK_TO_CHARACTERS':
      return { ...state, screen: 'characters', error: null };
    case 'SELECT_LEVEL': {
      const releasedIndex = RELEASED_LEVELS.findIndex(({ id }) => id === event.levelId);
      const isOpen = releasedIndex >= 0 && releasedIndex < state.save.unlocked;
      if (!isOpen || event.levelIndex !== releasedIndex) return state;
      return {
        ...state,
        screen: 'loading',
        selectedLevelId: event.levelId,
        selectedLevelIndex: releasedIndex,
        loadingPercent: 0,
        error: null,
        completion: null,
        helpVisible: true,
      };
    }
    case 'LOAD_PROGRESS':
      if (state.screen !== 'loading') return state;
      return {
        ...state,
        loadingPercent: Math.round(Math.min(1, Math.max(0, event.progress)) * 100),
      };
    case 'LOAD_READY':
      if (state.screen !== 'loading') return state;
      return { ...state, screen: 'playing', loadingPercent: 100, error: null };
    case 'LOAD_FAILED':
      return {
        ...state,
        screen: 'error',
        error: { asset: event.asset, retryable: true },
      };
    case 'WEBGL_FAILED':
      return {
        ...state,
        screen: 'error',
        error: { webgl: true, retryable: false },
      };
    case 'RETRY':
      if (!state.error?.retryable || state.selectedLevelIndex === null) return state;
      return {
        ...state,
        screen: 'loading',
        loadingPercent: 0,
        error: null,
      };
    case 'PAUSE':
      return state.screen === 'playing' ? { ...state, screen: 'paused' } : state;
    case 'RESUME':
      return state.screen === 'paused' ? { ...state, screen: 'playing' } : state;
    case 'COURSE_COMPLETE': {
      if (!RELEASED_IDS.has(event.levelId)) return state;
      const nextUnlocked = event.levelId === '1-1' ? 2 : state.save.unlocked;
      return {
        ...state,
        screen: 'complete',
        save: recordCompletion(state.save, event.levelId, event.stars, nextUnlocked),
        completion: {
          levelId: event.levelId,
          stars: Math.min(3, Math.max(0, event.stars)),
          stats: event.stats ?? {},
        },
      };
    }
    case 'CONTINUE':
    case 'QUIT_TO_WORLD':
      return {
        ...state,
        screen: 'world',
        error: null,
        completion: null,
      };
    case 'REPLAY':
      if (state.selectedLevelIndex === null) return state;
      return {
        ...state,
        screen: 'loading',
        loadingPercent: 0,
        error: null,
        completion: null,
        helpVisible: true,
      };
    case 'GAME_OVER':
      return {
        ...state,
        screen: 'error',
        error: { gameOver: true, retryable: true },
      };
    case 'MOVEMENT_USED':
      return state.helpVisible ? { ...state, helpVisible: false } : state;
    case 'DISMISS_NOTICE':
      return state.notice ? { ...state, notice: null } : state;
    default:
      return state;
  }
}

function setVisible(element, visible) {
  element?.classList.toggle('hidden', !visible);
}

function makeCharacterButton(doc, character, selectedId, primary = false) {
  const button = doc.createElement('button');
  button.type = 'button';
  button.className = 'char-card';
  button.dataset.action = 'choose-character';
  button.dataset.characterId = character.id;
  if (primary) button.dataset.primary = '';
  button.setAttribute('aria-pressed', String(character.id === selectedId));
  const image = doc.createElement('img');
  image.src = character.img;
  image.alt = '';
  const name = doc.createElement('span');
  name.className = 'name';
  name.textContent = character.name;
  const description = doc.createElement('span');
  description.className = 'desc';
  description.textContent = character.desc;
  button.append(image, name, description);
  return button;
}

function renderCharacters(doc, state) {
  const row = doc.getElementById('char-cards');
  if (!row) return;
  row.replaceChildren(...CHARACTERS.map((character, index) => (
    makeCharacterButton(doc, character, state.save.chef, index === 0)
  )));
}

function makeLevelButton(doc, level, index, state) {
  const open = index < state.save.unlocked;
  const stars = state.save.best[level.id] ?? 0;
  const button = doc.createElement('button');
  button.type = 'button';
  button.className = `level-node${open ? '' : ' locked'}${index === state.save.unlocked - 1 ? ' current' : ''}`;
  button.disabled = !open;
  button.dataset.action = 'select-level';
  button.dataset.levelId = level.id;
  button.dataset.levelIndex = String(index);
  if (open && index === Math.max(0, state.save.unlocked - 1)) {
    button.dataset.primary = '';
  }
  button.setAttribute(
    'aria-label',
    open
      ? `${level.id} ${level.name}, ${stars} of 3 stars`
      : `${level.id} ${level.name}, locked`,
  );
  const id = doc.createElement('span');
  id.className = 'nid';
  id.textContent = open ? level.id : '🔒';
  const rating = doc.createElement('span');
  rating.className = 'nstars';
  rating.setAttribute('aria-hidden', 'true');
  rating.textContent = open ? (stars ? '⭐'.repeat(stars) : '·') : '';
  button.append(id, rating);
  return button;
}

function renderWorld(doc, state) {
  const list = doc.getElementById('map-worlds');
  if (!list) return;
  const strips = RELEASED_WORLDS.map((world) => {
    const levels = RELEASED_LEVELS
      .map((level, index) => ({ level, index }))
      .filter(({ level }) => level.world === world.n);
    const stars = levels.reduce(
      (total, { level }) => total + (state.save.best[level.id] ?? 0),
      0,
    );
    const strip = doc.createElement('section');
    strip.className = 'world-strip';
    strip.style.backgroundImage = `url('${world.thumb}')`;
    strip.setAttribute('aria-label', `World ${world.n}, ${world.name}`);

    const badge = doc.createElement('div');
    badge.className = 'world-badge';
    const number = doc.createElement('span');
    number.className = 'wnum';
    number.textContent = String(world.n);
    const name = doc.createElement('span');
    name.className = 'wname';
    name.append(world.name);
    const cuisine = doc.createElement('small');
    cuisine.textContent = world.cuisine;
    name.append(cuisine);
    const rating = doc.createElement('span');
    rating.className = 'wstars';
    rating.textContent = `⭐${stars}/${levels.length * 3}`;
    badge.append(number, name, rating);

    const nodes = doc.createElement('div');
    nodes.className = 'level-nodes';
    nodes.append(...levels.map(({ level, index }) => (
      makeLevelButton(doc, level, index, state)
    )));
    strip.append(badge, nodes);
    return strip;
  });
  list.replaceChildren(...strips);
}

function renderCompletion(doc, completion) {
  if (!completion) return;
  const level = RELEASED_LEVELS.find(({ id }) => id === completion.levelId);
  const title = doc.getElementById('complete-title');
  const stars = doc.getElementById('complete-stars');
  const stats = doc.getElementById('complete-stats');
  if (title) title.textContent = `${level?.name ?? 'Course'} clear!`;
  if (stars) {
    stars.textContent = `${'⭐'.repeat(completion.stars)}${'☆'.repeat(3 - completion.stars)}`;
    stars.setAttribute('aria-label', `${completion.stars} of 3 stars`);
  }
  if (stats) {
    const tomatoes = completion.stats.totalCoins
      ? `${completion.stats.coins} of ${completion.stats.totalCoins} tomatoes`
      : `${completion.stats.coins ?? 0} tomatoes`;
    stats.replaceChildren();
    const tomatoLine = doc.createElement('div');
    tomatoLine.textContent = `🍅 ${tomatoes}`;
    const timeLine = doc.createElement('div');
    timeLine.textContent = `⏱ ${formatTime(completion.stats.time ?? 0)}`;
    stats.append(tomatoLine, timeLine);
  }
}

function renderError(doc, error) {
  const title = doc.getElementById('error-title');
  const copy = doc.getElementById('error-copy');
  const asset = doc.getElementById('error-asset');
  const retry = doc.getElementById('btn-retry-load');
  const link = doc.getElementById('error-link');
  if (!title || !copy || !asset || !retry || !link) return;

  asset.textContent = '';
  asset.classList.add('hidden');
  retry.classList.toggle('hidden', !error?.retryable);
  link.textContent = error?.gameOver ? 'World 1 map' : 'Back to Savoria';
  link.href = error?.gameOver ? 'play/' : './';
  link.dataset.action = error?.gameOver ? 'quit-to-world' : '';

  if (error?.webgl) {
    title.textContent = 'WebGL is unavailable';
    copy.textContent = 'Try current Chrome, Firefox, Edge, or Safari on a desktop with hardware acceleration enabled.';
    retry.classList.add('hidden');
    return;
  }
  if (error?.gameOver) {
    title.textContent = 'The kitchen is closed';
    copy.textContent = 'No chefs remain. Retry the course or return to the map.';
    retry.textContent = 'Retry course';
    return;
  }
  title.textContent = 'One ingredient did not load';
  copy.textContent = 'Check the game files, then retry this course.';
  asset.textContent = error?.asset ?? 'Unknown asset';
  asset.classList.remove('hidden');
  retry.textContent = 'Retry';
}

export function formatTime(value) {
  const seconds = Math.max(0, Number(value) || 0);
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
}

let lastRenderedScreen = null;

export function renderUi(state, { doc = document, previousScreen = lastRenderedScreen } = {}) {
  const screenIds = {
    title: 'title-screen',
    characters: 'char-screen',
    world: 'map-screen',
  };
  for (const id of Object.values(screenIds)) {
    setVisible(doc.getElementById(id), screenIds[state.screen] === id);
  }

  renderCharacters(doc, state);
  renderWorld(doc, state);
  renderCompletion(doc, state.completion);
  renderError(doc, state.error);

  const showsGame = ['playing', 'paused', 'complete'].includes(state.screen);
  setVisible(doc.getElementById('game-stage'), showsGame);
  setVisible(doc.getElementById('hud'), showsGame);
  setVisible(doc.getElementById('loading-screen'), state.screen === 'loading');
  setVisible(doc.getElementById('pause-overlay'), state.screen === 'paused');
  setVisible(doc.getElementById('complete-overlay'), state.screen === 'complete');
  setVisible(doc.getElementById('error-screen'), state.screen === 'error');
  setVisible(doc.getElementById('help'), state.helpVisible && state.screen === 'playing');
  setVisible(doc.getElementById('save-recovery'), Boolean(state.notice));

  const loadPercent = doc.getElementById('loading-percent');
  const progress = doc.getElementById('loading-progress');
  if (loadPercent) loadPercent.textContent = `${state.loadingPercent}%`;
  if (progress) {
    progress.value = state.loadingPercent;
    progress.setAttribute('aria-valuenow', String(state.loadingPercent));
  }
  const noticeCopy = doc.getElementById('save-recovery-copy');
  if (noticeCopy) noticeCopy.textContent = state.notice ?? '';

  doc.getElementById('app')?.setAttribute('data-screen', state.screen);

  if (previousScreen !== state.screen) {
    const activeRoot = doc.querySelector(`[data-ui-state="${state.screen}"]:not(.hidden)`);
    const primary = activeRoot?.querySelector('[data-primary]:not(.hidden)') ?? activeRoot;
    queueMicrotask(() => primary?.focus({ preventScroll: true }));
  }
  lastRenderedScreen = state.screen;
}
