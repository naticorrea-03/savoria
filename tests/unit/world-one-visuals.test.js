import test from 'node:test';
import assert from 'node:assert/strict';
import {
  WORLD_ONE_VISUALS,
  collectWorldOneAssets,
  decorationSlotsFor,
  terrainVisualFor,
} from '../../js/visuals/world-one-manifest.js';

test('World 1 manifest exposes three ordered depth layers', () => {
  assert.deepEqual(
    WORLD_ONE_VISUALS.backgrounds.map(({ id }) => id),
    ['far', 'middle', 'near'],
  );
  assert.deepEqual(
    WORLD_ONE_VISUALS.backgrounds.map(({ parallax }) => parallax),
    [0.08, 0.16, 0.28],
  );
});

test('terrain kinds resolve without legacy atlas paths', () => {
  for (const kind of ['ground', 'ground2', 'plat', 'brick', 'pillar']) {
    const visual = terrainVisualFor(kind);
    assert.ok(visual.cap || visual.face);
    assert.equal(
      Object.values(visual).some((value) => /tile_|ground_(top|fill)/.test(String(value))),
      false,
    );
  }
});

test('asset collection is local, unique, and complete', () => {
  const paths = collectWorldOneAssets();
  assert.equal(paths.length, new Set(paths).size);
  assert.ok(paths.every((path) => path.startsWith('assets/')));
  assert.ok(paths.includes('assets/world1/background-far.png'));
  assert.ok(paths.includes('assets/world1/marinara-surface.png'));
  assert.ok(paths.includes('assets/sprites/tomato.png'));
});

test('controlled decoration skips narrow and non-ground terrain', () => {
  assert.deepEqual(
    decorationSlotsFor({ kind: 'ground', width: 7, top: 2, x: 0 }),
    [],
  );
  assert.deepEqual(
    decorationSlotsFor({ kind: 'plat', width: 20, top: 2, x: 0 }),
    [],
  );
});

test('wide ground gets sparse props away from collision edges', () => {
  const slots = decorationSlotsFor({ kind: 'ground', width: 24, top: 2, x: 30 });
  assert.equal(slots.length, 2);
  assert.ok(slots.every(({ xOffset }) => Math.abs(xOffset) <= 9));
  assert.ok(slots.every(({ z }) => z < 0));
});

test('manifest is frozen through nested terrain and layers', () => {
  assert.equal(Object.isFrozen(WORLD_ONE_VISUALS), true);
  assert.equal(Object.isFrozen(WORLD_ONE_VISUALS.backgrounds), true);
  assert.equal(Object.isFrozen(WORLD_ONE_VISUALS.terrain.ground), true);
});

test('generated platform and hazard plates remove baked light backgrounds', () => {
  assert.equal(WORLD_ONE_VISUALS.terrain.plat.removeLightNeutral, true);
  assert.equal(WORLD_ONE_VISUALS.terrain.brick.removeLightNeutral, true);
  assert.equal(WORLD_ONE_VISUALS.hazard.removeLightNeutral, true);
});

test('ground faces extend below shallow collision boxes without moving their top edge', () => {
  assert.equal(WORLD_ONE_VISUALS.terrain.ground.skirtDepth, 6);
  assert.equal(WORLD_ONE_VISUALS.terrain.ground2.skirtDepth, 6);
  assert.equal(WORLD_ONE_VISUALS.terrain.plat.skirtDepth, undefined);
});
