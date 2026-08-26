import test from 'node:test';
import assert from 'node:assert/strict';
import { createTextureStore } from '../../js/core/texture-store.js';
import { initialUiState, reduceUiState } from '../../js/ui/ui-state.js';

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
