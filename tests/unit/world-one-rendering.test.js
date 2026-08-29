import test from 'node:test';
import assert from 'node:assert/strict';
import {
  WORLD_ONE_ASSETS,
  backgroundLayerX,
  fitVisualUv,
  mergeGroundVisualRuns,
  terrainPlaneZ,
} from '../../js/core/world-builder.js';
import { WORLD_ONE_VISUALS } from '../../js/visuals/world-one-manifest.js';

test('background layers follow camera with increasing parallax', () => {
  assert.deepEqual(
    backgroundLayerX(100, WORLD_ONE_VISUALS.backgrounds),
    [8, 16, 28],
  );
});

test('World 1 production assets contain no legacy terrain atlas', () => {
  assert.equal(
    WORLD_ONE_ASSETS.some((path) => /tile_|ground_(top|fill)|small_mushroom/.test(path)),
    false,
  );
});

test('World 1 production assets include every depth and terrain family', () => {
  for (const path of [
    'assets/world1/background-far.png',
    'assets/world1/background-middle.png',
    'assets/world1/background-near.png',
    'assets/world1/ground-cap.png',
    'assets/world1/ground-face.png',
    'assets/world1/ravioli-platform.png',
    'assets/world1/penne-pillar.png',
    'assets/world1/marinara-surface.png',
  ]) {
    assert.ok(WORLD_ONE_ASSETS.includes(path), path);
  }
});

test('visible terrain stays on the gameplay plane regardless of collision depth', () => {
  assert.equal(terrainPlaneZ(4, 0.08), 0.08);
  assert.equal(terrainPlaneZ(12, 0.08), 0.08);
});

test('ground art preserves its source scale on narrow collision blocks', () => {
  const source = { offsetX: 0.06, offsetY: 0.22, repeatX: 0.88, repeatY: 0.54 };
  assert.deepEqual(fitVisualUv(source, 2.9, 18, 6), source);
  const narrow = fitVisualUv(source, 2.9, 9, 6);
  assert.ok(narrow.repeatX < source.repeatX);
  assert.equal(Number(narrow.repeatX.toFixed(3)), 0.455);
});

test('adjacent level boxes share a visual only when their terrain kind matches', () => {
  const runs = mergeGroundVisualRuns([
    [5, 0, 0, 10, 6, 8, 'ground'],
    [12, 0, 0, 4, 6, 8, 'ground2'],
    [20, 0, 0, 4, 6, 8, 'ground'],
  ]);
  assert.deepEqual(runs, [
    [5, 0, 0, 10, 6, 8, 'ground'],
    [12, 0, 0, 4, 6, 8, 'ground2'],
    [20, 0, 0, 4, 6, 8, 'ground'],
  ]);
});
