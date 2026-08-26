import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldCaptureGameplayInput } from '../../js/core/game-session.js';
import { createTextureStore } from '../../js/core/texture-store.js';
import {
  applyGameBackgroundState,
  createWebGLCapabilityProbe,
  initialUiState,
  reduceUiState,
} from '../../js/ui/ui-state.js';

test('the release flow exposes the approved screen states', () => {
  let state = initialUiState();
  assert.equal(state.screen, 'title');

  state = reduceUiState(state, { type: 'START' });
  assert.equal(state.screen, 'characters');

  state = reduceUiState(state, { type: 'CHOOSE_CHARACTER', characterId: 'dinnerette' });
  assert.equal(state.screen, 'world');
  assert.equal(state.save.chef, 'dinnerette');

  state = reduceUiState(state, { type: 'SELECT_LEVEL', levelId: '1-1', levelIndex: 0 });
  assert.equal(state.screen, 'loading');
  assert.equal(state.loadingPercent, 0);

  state = reduceUiState(state, { type: 'LOAD_PROGRESS', progress: 0.527 });
  assert.equal(state.loadingPercent, 53);

  state = reduceUiState(state, { type: 'LOAD_READY' });
  assert.equal(state.screen, 'playing');

  state = reduceUiState(state, { type: 'PAUSE' });
  assert.equal(state.screen, 'paused');

  state = reduceUiState(state, { type: 'RESUME' });
  assert.equal(state.screen, 'playing');
});

test('course completion unlocks 1-2 and returns to the World 1 map', () => {
  const next = reduceUiState(initialUiState(), {
    type: 'COURSE_COMPLETE',
    levelId: '1-1',
    stars: 2,
    stats: { coins: 8, totalCoins: 10, time: 42 },
  });
  assert.equal(next.screen, 'complete');
  assert.equal(next.save.unlocked, 2);
  assert.equal(next.save.best['1-1'], 2);

  const world = reduceUiState(next, { type: 'CONTINUE' });
  assert.equal(world.screen, 'world');
});

test('asset failure enters a retryable error state', () => {
  const loading = reduceUiState(initialUiState(), {
    type: 'SELECT_LEVEL',
    levelId: '1-1',
    levelIndex: 0,
  });
  const next = reduceUiState(loading, { type: 'LOAD_FAILED', asset: 'tile_top.png' });
  assert.equal(next.screen, 'error');
  assert.deepEqual(next.error, { asset: 'tile_top.png', retryable: true });

  const retrying = reduceUiState(next, { type: 'RETRY' });
  assert.equal(retrying.screen, 'loading');
  assert.equal(retrying.loadingPercent, 0);
});

test('WebGL failure gives a nonretryable compatibility state', () => {
  const next = reduceUiState(initialUiState(), { type: 'WEBGL_FAILED' });
  assert.equal(next.screen, 'error');
  assert.deepEqual(next.error, { webgl: true, retryable: false });
});

test('movement hides help only after the first movement input', () => {
  const initial = initialUiState();
  assert.equal(initial.helpVisible, true);
  const next = reduceUiState(initial, { type: 'MOVEMENT_USED' });
  assert.equal(next.helpVisible, false);
  assert.equal(reduceUiState(next, { type: 'MOVEMENT_USED' }), next);
});

test('save recovery is one-time state and never blocks the title', () => {
  const recovered = initialUiState({ saveRecovered: true });
  assert.equal(recovered.screen, 'title');
  assert.match(recovered.notice, /reset/i);

  const dismissed = reduceUiState(recovered, { type: 'DISMISS_NOTICE' });
  assert.equal(dismissed.notice, null);
});

test('locked or unknown courses cannot enter loading', () => {
  const initial = initialUiState();
  assert.equal(
    reduceUiState(initial, { type: 'SELECT_LEVEL', levelId: '1-2', levelIndex: 1 }),
    initial,
  );
  assert.equal(
    reduceUiState(initial, { type: 'SELECT_LEVEL', levelId: '2-1', levelIndex: 2 }),
    initial,
  );
});

test('texture failures identify the failed filename for recovery UI', async () => {
  const store = createTextureStore({
    THREE: { SRGBColorSpace: 'srgb' },
    loader: { loadAsync: async () => { throw new Error('404'); } },
    baseUrl: 'http://localhost/play/',
  });
  await assert.rejects(
    store.preload(['assets/sprites/tile_top.png']),
    (error) => error.asset === 'tile_top.png' && error.path === 'assets/sprites/tile_top.png',
  );
});

test('gameplay input leaves focused controls and paused sessions alone', () => {
  const controlTarget = { closest: () => ({ tagName: 'BUTTON' }) };
  const stageTarget = { closest: () => null };
  assert.equal(shouldCaptureGameplayInput(
    { code: 'Space', target: controlTarget },
    { running: true, finished: false },
  ), false);
  assert.equal(shouldCaptureGameplayInput(
    { code: 'Space', target: stageTarget },
    { running: false, finished: false },
  ), false);
  assert.equal(shouldCaptureGameplayInput(
    { code: 'Space', target: stageTarget },
    { running: true, finished: true },
  ), false);
  assert.equal(shouldCaptureGameplayInput(
    { code: 'Space', target: stageTarget },
    { running: true, finished: false },
  ), true);
  assert.equal(shouldCaptureGameplayInput(
    { code: 'Escape', target: stageTarget },
    { running: true, finished: false },
  ), true);
});

test('WebGL capability is cached and its probe context is released', () => {
  let canvases = 0;
  let released = 0;
  const probe = createWebGLCapabilityProbe(() => {
    canvases += 1;
    return {
      getContext: (name) => name === 'webgl2' ? {
        getExtension: (extension) => extension === 'WEBGL_lose_context'
          ? { loseContext: () => { released += 1; } }
          : null,
      } : null,
    };
  });
  assert.equal(probe(), true);
  assert.equal(probe(), true);
  assert.equal(canvases, 1);
  assert.equal(released, 1);
});

test('paused and complete backgrounds are inert and leave one active state root', () => {
  const makeElement = () => ({
    dataset: { uiState: 'playing' },
    inert: false,
    attributes: new Map(),
    setAttribute(name, value) { this.attributes.set(name, value); },
    removeAttribute(name) { this.attributes.delete(name); },
  });
  const stage = makeElement();
  const hud = makeElement();
  applyGameBackgroundState(stage, hud, 'paused');
  assert.equal(stage.dataset.uiState, undefined);
  assert.equal(stage.inert, true);
  assert.equal(stage.attributes.get('aria-hidden'), 'true');
  assert.equal(stage.attributes.has('inert'), true);
  assert.equal(hud.inert, true);
  assert.equal(hud.attributes.get('aria-hidden'), 'true');
  assert.equal(hud.attributes.has('inert'), true);

  applyGameBackgroundState(stage, hud, 'playing');
  assert.equal(stage.dataset.uiState, 'playing');
  assert.equal(stage.inert, false);
  assert.equal(stage.attributes.has('aria-hidden'), false);
  assert.equal(stage.attributes.has('inert'), false);
  assert.equal(hud.inert, false);
  assert.equal(hud.attributes.has('aria-hidden'), false);
  assert.equal(hud.attributes.has('inert'), false);
});

test('legacy showScreen targets map onto Task 8 state values', () => {
  const mappings = new Map([
    ['title-screen', 'title'],
    ['char-screen', 'characters'],
    ['map-screen', 'world'],
    [null, 'playing'],
    ['gameover-screen', 'error'],
    ['win-screen', 'complete'],
  ]);
  for (const [id, screen] of mappings) {
    const next = reduceUiState(initialUiState(), { type: 'HOOK_SHOW_SCREEN', id });
    assert.equal(next.screen, screen, String(id));
  }
});
