import test from 'node:test';
import assert from 'node:assert/strict';
import {
  alphaForLightNeutral,
  createTextureStore,
  cropRectFromUv,
  erodeLightNeutralFringe,
} from '../../js/core/texture-store.js';

const fakeThree = { SRGBColorSpace: 'srgb', RepeatWrapping: 'repeat' };

function fakeTexture(disposals = []) {
  return {
    needsUpdate: false,
    repeat: { set(x, y) { this.value = [x, y]; } },
    offset: { set(x, y) { this.value = [x, y]; } },
    clone() { return fakeTexture(disposals); },
    dispose() { disposals.push(this); },
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

test('sprite-sheet clones are owned and disposed by the texture store', async () => {
  const disposals = [];
  const source = fakeTexture(disposals);
  const store = createTextureStore({
    THREE: fakeThree,
    loader: { loadAsync: async () => source },
    baseUrl: 'http://localhost/assets/',
  });
  await store.preload(['chef.png']);

  const clone = store.clone('chef.png');
  assert.notEqual(clone, source);

  store.dispose();
  assert.deepEqual(disposals, [clone, source]);
});

test('light-neutral masking removes baked checkerboards without erasing saturated art', () => {
  assert.equal(alphaForLightNeutral(248, 248, 248, 255), 0);
  assert.equal(alphaForLightNeutral(236, 235, 236, 255), 0);
  assert.equal(alphaForLightNeutral(240, 181, 39, 255), 255);
  assert.equal(alphaForLightNeutral(126, 116, 95, 255), 255);
});

test('light-neutral fringe erosion removes pale edge pixels but keeps colored art', () => {
  const pixels = new Uint8ClampedArray([
    0, 0, 0, 0,
    214, 208, 196, 255,
    45, 132, 66, 255,
  ]);
  erodeLightNeutralFringe(pixels, 3, 1, 1);
  assert.equal(pixels[7], 0);
  assert.equal(pixels[11], 255);
});

test('UV crops convert Three bottom-origin coordinates into canvas rectangles', () => {
  assert.deepEqual(
    cropRectFromUv(
      { offsetX: 0.1, offsetY: 0.25, repeatX: 0.8, repeatY: 0.5 },
      1000,
      800,
    ),
    { x: 100, y: 200, width: 800, height: 400 },
  );
});
