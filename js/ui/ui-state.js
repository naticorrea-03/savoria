import { RELEASED_LEVELS, RELEASED_WORLDS } from '../levels/index.js';
import { createFreshSave, recordCompletion } from './save-store.js';

export const CHARACTERS = [
  {
    id: 'fatsio',
    name: 'Hungrio',
    desc: 'Big heart, bigger appetite.',
    img: 'assets/sprites/fatsio.png',
  },
  {
    id: 'dinnerette',
    name: 'Dinnerette',
    desc: 'Royalty with a whisk.',
    img: 'assets/sprites/dinnerette.png',
  },
  {
    id: 'chefno',
    name: 'Chefno',
    desc: 'Small chef, huge flavor.',
    img: 'assets/sprites/chefno.png',
  },
];

const RELEASED_IDS = new Set(RELEASED_LEVELS.map(({ id }) => id));

export function titleProgressFor(save = createFreshSave()) {
  const best = save.best ?? {};
  const completedCourses = RELEASED_LEVELS.filter(({ id }) => best[id] !== undefined).length;
  const totalStars = Object.values(best).reduce(
    (total, stars) => total + (Number(stars) || 0),
    0,
  );
  const worldStars = Object.fromEntries(RELEASED_WORLDS.map(({ n }) => [
    n,
    RELEASED_LEVELS
      .filter(({ world }) => world === n)
      .reduce((total, { id }) => total + (best[id] ?? 0), 0),
  ]));
  const openCount = Math.max(
    1,
    Math.min(RELEASED_LEVELS.length, Number(save.unlocked) || 1),
  );
  const current = RELEASED_LEVELS.find(
    ({ id }, index) => index < openCount && best[id] === undefined,
  ) ?? RELEASED_LEVELS[openCount - 1];

  return {
    completedCourses,
    currentLevelId: current.id,
    currentLevelName: current.name,
    currentWorld: current.world,
    totalStars,
    worldStars,
  };
}

function completionState(levelId) {
  const index = RELEASED_LEVELS.findIndex(({ id }) => id === levelId);
  const level = RELEASED_LEVELS[index];
  if (!level) return null;
  const nextLevel = RELEASED_LEVELS[index + 1];
  return {
    nextUnlocked: Math.min(RELEASED_LEVELS.length, index + 2),
    worldComplete: !nextLevel || nextLevel.world !== level.world,
    worldNumber: level.world,
  };
}

export function createWebGLCapabilityProbe(createCanvas) {
  let cached;
  return () => {
    if (cached !== undefined) return cached;
    let context = null;
    try {
      const canvas = createCanvas();
      context = canvas.getContext('webgl2') || canvas.getContext('webgl');
      cached = Boolean(context);
    } catch {
      cached = false;
    }
    try {
      context?.getExtension?.('WEBGL_lose_context')?.loseContext?.();
    } catch {
      // Capability detection must not fail because explicit release is unsupported.
    }
    return cached;
  };
}

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
    case 'HOOK_SHOW_SCREEN': {
      if (event.id === 'title-screen') {
        return { ...state, screen: 'title', error: null, completion: null };
      }
      if (event.id === 'char-screen') {
        return { ...state, screen: 'characters', error: null, completion: null };
      }
      if (event.id === 'map-screen') {
        return { ...state, screen: 'world', error: null, completion: null };
      }
      if (event.id === null) {
        return { ...state, screen: 'playing', error: null, completion: null };
      }
      if (event.id === 'gameover-screen') {
        return {
          ...state,
          screen: 'error',
          error: { gameOver: true, retryable: true },
          completion: null,
        };
      }
      if (event.id === 'win-screen') {
        return {
          ...state,
          screen: 'complete',
          error: null,
          completion: {
            levelId: '1-2',
            stars: state.save.best['1-2'] ?? 0,
            stats: {},
            worldComplete: true,
          },
        };
      }
      return state;
    }
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
      const completion = completionState(event.levelId);
      return {
        ...state,
        screen: 'complete',
        save: recordCompletion(
          state.save,
          event.levelId,
          event.stars,
          completion.nextUnlocked,
        ),
        completion: {
          levelId: event.levelId,
          stars: Math.min(3, Math.max(0, event.stars)),
          stats: event.stats ?? {},
          worldComplete: completion.worldComplete,
          worldNumber: completion.worldNumber,
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
  button.setAttribute('aria-label', `${character.name}: ${character.desc}`);
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

function renderTitleHub(doc, state) {
  const progress = titleProgressFor(state.save);
  const world = RELEASED_WORLDS.find(({ n }) => n === progress.currentWorld);
  const courseStars = state.save.best[progress.currentLevelId] ?? 0;
  const sushiOpen = state.save.unlocked >= 3;

  const copy = {
    'title-total-stars': `${progress.totalStars}/12`,
    'title-completed-courses': `${progress.completedCourses}/4`,
    'title-current-world': `World ${progress.currentWorld} · ${world?.name ?? 'Savoria'}`,
    'title-current-course': `${progress.currentLevelId} ${progress.currentLevelName}`,
    'title-world-one-stars': `${progress.worldStars[1]}/6 stars`,
    'title-world-two-stars': sushiOpen ? `${progress.worldStars[2]}/6 stars` : 'Locked',
  };
  for (const [id, text] of Object.entries(copy)) {
    const element = doc.getElementById(id);
    if (element) element.textContent = text;
  }

  const stars = doc.getElementById('title-current-stars');
  if (stars) {
    stars.textContent = `${'★'.repeat(courseStars)}${'☆'.repeat(3 - courseStars)}`;
    stars.setAttribute('aria-label', `${courseStars} of 3 course stars`);
  }

  doc.querySelector('[data-world="2"]')?.classList.toggle('locked', !sushiOpen);
  for (const chef of doc.querySelectorAll('.title-chef')) {
    const selected = chef.dataset.characterId === state.save.chef;
    chef.classList.toggle('is-selected', selected);
    chef.setAttribute('aria-current', selected ? 'true' : 'false');
  }
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
  button.dataset.levelName = level.name;
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
    strip.style.backgroundImage = `url('${world.mapBackground ?? world.thumb}')`;
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
  if (title) {
    title.textContent = completion.worldComplete
      ? `World ${completion.worldNumber} complete!`
      : `${level?.name ?? 'Course'} clear!`;
  }
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
  link.textContent = error?.gameOver ? 'World map' : 'Back to Savoria';
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

export function applyGameBackgroundState(stage, hud, screen) {
  const playing = screen === 'playing';
  if (playing) stage.dataset.uiState = 'playing';
  else delete stage.dataset.uiState;
  for (const element of [stage, hud]) {
    element.inert = !playing;
    if (playing) {
      element.removeAttribute('aria-hidden');
      element.removeAttribute('inert');
    } else {
      element.setAttribute('aria-hidden', 'true');
      element.setAttribute('inert', '');
    }
  }
}

export function renderUi(state, { doc = document, previousScreen = lastRenderedScreen } = {}) {
  const screenIds = {
    title: 'title-screen',
    characters: 'char-screen',
    world: 'map-screen',
  };
  for (const id of Object.values(screenIds)) {
    setVisible(doc.getElementById(id), screenIds[state.screen] === id);
  }

  renderTitleHub(doc, state);
  renderCharacters(doc, state);
  renderWorld(doc, state);
  renderCompletion(doc, state.completion);
  renderError(doc, state.error);

  const selectedLevel = RELEASED_LEVELS[state.selectedLevelIndex];
  const selectedWorld = RELEASED_WORLDS.find(({ n }) => n === selectedLevel?.world);
  const loadingTitle = doc.getElementById('loading-title');
  const loadingProgress = doc.getElementById('loading-progress');
  const mapButtons = [doc.getElementById('btn-quit'), doc.getElementById('btn-next')];
  if (loadingTitle) loadingTitle.textContent = `Loading ${selectedWorld?.name ?? 'Savoria'}`;
  if (loadingProgress) {
    loadingProgress.setAttribute(
      'aria-label',
      `${selectedWorld?.name ?? 'Savoria'} loading progress`,
    );
  }
  for (const button of mapButtons) {
    if (button) button.textContent = 'World map';
  }

  const gameStage = doc.getElementById('game-stage');
  const hud = doc.getElementById('hud');
  const showsGame = ['playing', 'paused', 'complete'].includes(state.screen);
  setVisible(gameStage, showsGame);
  setVisible(hud, showsGame);
  applyGameBackgroundState(gameStage, hud, state.screen);
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
