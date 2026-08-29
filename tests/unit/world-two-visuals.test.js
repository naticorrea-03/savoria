import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { THEMES } from '../../js/levels/themes.js';
import { collectVisualAssets } from '../../js/visuals/manifest-utils.js';

test('Sushi Shores uses a purpose-made three-layer visual manifest', () => {
  assert.ok(THEMES.sushi.visuals);
  assert.deepEqual(
    THEMES.sushi.visuals.backgrounds.map(({ id }) => id),
    ['far', 'middle', 'near'],
  );
});

test('Sushi Shores routes terrain, hazards, enemies, and landmarks to local World 2 art', () => {
  const visuals = THEMES.sushi.visuals ?? {};
  assert.equal(visuals.terrain?.ground?.face, 'assets/world2/rice-nori-ground.png');
  assert.equal(visuals.terrain?.plat?.face, 'assets/world2/sushi-platform.png');
  assert.equal(visuals.hazard?.surface, 'assets/world2/soy-sauce-surface.png');
  assert.equal(visuals.sprites?.meatball, 'assets/world2/wasabi-imp.png');
  assert.equal(visuals.sprites?.goal, 'assets/world2/golden-sushi-lantern.png');
  assert.equal(visuals.sprites?.door, 'assets/world2/bonus-sushi-portal.png');
  assert.equal(visuals.ui?.mapBackground, 'assets/world2/world-map-background.png');
});

test('Sushi Shores preloads every unique local visual asset', () => {
  const assets = collectVisualAssets(THEMES.sushi.visuals);
  assert.equal(assets.length, new Set(assets).size);
  assert.ok(assets.length >= 15);
  for (const asset of assets) {
    assert.match(asset, /^assets\/(world2|sprites)\/.+\.png$/);
    assert.equal(existsSync(asset), true, `missing ${asset}`);
  }
});
