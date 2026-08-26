import test from 'node:test';
import assert from 'node:assert/strict';
import { createTextureStore } from '../../js/core/texture-store.js';

const fakeThree = { SRGBColorSpace: 'srgb', RepeatWrapping: 'repeat' };

function fakeTexture() {
  return {
    needsUpdate: false,
    repeat: { set(x, y) { this.value = [x, y]; } },
    offset: { set(x, y) { this.value = [x, y]; } },
    clone() { return fakeTexture(); },
    dispose() {},
  };
}

function createDeferredLoader() {
  let finish;
  return {
    loader: { loadAsync: () => new Promise((resolve) => { finish = resolve; }) },
    resolve: () => finish(fakeTexture()),
  };
}

test('tiled clones are unavailable before preload completes', async () => {
  const deferred = createDeferredLoader();
  const store = createTextureStore({
    THREE: fakeThree,
    loader: deferred.loader,
    baseUrl: 'http://localhost/assets/',
  });
  assert.throws(() => store.tiled('tile.png', 2, 1, 0, 0), /not preloaded/);
  const loading = store.preload(['tile.png']);
  deferred.resolve();
  await loading;
  assert.equal(store.tiled('tile.png', 2, 1, 0, 0).needsUpdate, true);
});
