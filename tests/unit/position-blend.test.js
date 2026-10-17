import test from 'node:test';
import assert from 'node:assert/strict';
import { FixedStepLoop } from '../../js/core/fixed-step-loop.js';
import { PositionBlend } from '../../js/core/position-blend.js';

function thing(x = 0, y = 0, z = 0) {
  return {
    position: {
      x,
      y,
      z,
      set(nx, ny, nz) {
        this.x = nx;
        this.y = ny;
        this.z = nz;
      },
    },
  };
}

test('blend sits between the last two steps and restore returns the simulated spot', () => {
  const blend = new PositionBlend();
  const enemy = thing(0, 1, 0);
  blend.remember([enemy]);
  enemy.position.set(1, 3, 0);
  blend.blend(0.25);
  assert.equal(enemy.position.x, 0.25);
  assert.equal(enemy.position.y, 1.5);
  blend.restore();
  assert.equal(enemy.position.x, 1);
  assert.equal(enemy.position.y, 3);
});

test('a jump of more than 3 units is a respawn and is not blended', () => {
  const blend = new PositionBlend();
  const enemy = thing(0, 0, 0);
  blend.remember([enemy]);
  enemy.position.set(20, 0, 0);
  blend.blend(0.5);
  assert.equal(enemy.position.x, 20);
  blend.restore();
  assert.equal(enemy.position.x, 20);
});

test('objects added during a step draw where they are and missing ones are ignored', () => {
  const blend = new PositionBlend();
  const old = thing(0, 0, 0);
  blend.remember([old, null, {}]);
  const fresh = thing(5, 5, 0);
  old.position.set(1, 0, 0);
  blend.blend(0.5);
  assert.equal(fresh.position.x, 5);
  assert.equal(old.position.x, 0.5);
  blend.restore();
  assert.equal(old.position.x, 1);
});

test('at 144 Hz a 60 Hz mover is drawn with even per-frame motion', () => {
  const loop = new FixedStepLoop();
  const blend = new PositionBlend();
  const enemy = thing(0, 0, 0);
  const drawn = [];
  const rawDrawn = [];
  for (let frame = 0; frame < 288; frame += 1) {
    loop.advance(
      1 / 144,
      () => {
        blend.remember([enemy]);
        enemy.position.x += 0.1;
      },
      (alpha) => {
        rawDrawn.push(enemy.position.x);
        blend.blend(alpha);
        drawn.push(enemy.position.x);
        blend.restore();
      },
    );
  }
  const spread = (xs) => {
    const steps = xs.slice(1).map((x, i) => x - xs[i]);
    return Math.max(...steps) - Math.min(...steps);
  };
  assert.ok(spread(rawDrawn.slice(10)) > 0.09);
  assert.ok(spread(drawn.slice(10)) < 0.01);
});
