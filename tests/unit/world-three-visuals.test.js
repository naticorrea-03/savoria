import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { WORLD_THREE } from '../../js/levels/world-three.js';
import { THEMES } from '../../js/levels/themes.js';
import { WORLD_ONE_VISUALS } from '../../js/visuals/world-one-manifest.js';
import { collectVisualAssets, decorationSlotsFor } from '../../js/visuals/manifest-utils.js';

const visuals = THEMES.taco.visuals;

test('Taco Territory fills every World 1 slot with dedicated, preloadable art', () => {
  assert.equal(visuals.id, 'taco-territory');
  assert.equal(WORLD_THREE.mapBackground, visuals.ui.mapBackground);
  assert.deepEqual(visuals.backgrounds.map(({ id }) => id), ['far', 'middle', 'near']);
  assert.deepEqual(Object.keys(visuals.terrain), Object.keys(WORLD_ONE_VISUALS.terrain));
  assert.deepEqual(Object.keys(visuals.sprites).sort(), Object.keys(WORLD_ONE_VISUALS.sprites).sort());
  const assets = collectVisualAssets(visuals);
  assert.equal(assets.length, 22);
  assert.equal(new Set(assets).size, assets.length);
  // Don Funghi keeps his own sprite in every world.
  assert.equal(visuals.sprites.boss, 'assets/sprites/don_funghi.png');
  for (const asset of assets) {
    if (asset === visuals.sprites.boss) continue;
    assert.match(asset, /^assets\/sprites\/w3_.+\.png$/);
    const png = readFileSync(asset);
    assert.equal(png.subarray(1, 4).toString(), 'PNG', asset);
    assert.ok(png.readUInt32BE(16) > 0 && png.readUInt32BE(20) > 0, asset);
  }
  assert.ok(Object.isFrozen(visuals.terrain.ground));
});

test('Taco Territory decorates ground behind the collision plane', () => {
  const slots = decorationSlotsFor({ kind: 'ground', width: 24, top: 2 }, visuals);
  assert.equal(slots.length, 2);
  assert.ok(slots.every(({ path, z }) => path === 'assets/sprites/w3_nopal_garden.png' && z < 0));
  assert.deepEqual(decorationSlotsFor({ kind: 'plat', width: 24, top: 2 }, visuals), []);
});
