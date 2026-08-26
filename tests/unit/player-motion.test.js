import test from 'node:test';
import assert from 'node:assert/strict';
import { AABB } from '../../js/core/aabb.js';
import { DEFAULT_MOTION, createPlayerMotion, stepPlayerMotion } from '../../js/gameplay/player-motion.js';

const EMPTY_WORLD = { solids: [] };

test('motion uses the approved constants', () => {
  assert.deepEqual(DEFAULT_MOTION, {
    walkSpeed: 7.2,
    runSpeed: 10.6,
    acceleration: 46,
    deceleration: 58,
    gravity: 30,
    jumpSpeed: 12.5,
    jumpCutSpeed: 6.5,
    coyoteSeconds: 0.12,
    jumpBufferSeconds: 0.13,
    maxFallSpeed: 26,
  });
});

test('airborne players cannot jump twice', () => {
  const state = createPlayerMotion({ grounded: false, coyote: 0, velocityY: -2 });
  const next = stepPlayerMotion(state, { axis: 0, running: false, jumpPressed: true, jumpHeld: true }, EMPTY_WORLD, 1 / 60);
  assert.ok(next.velocityY <= 0);
});

test('Shift raises target speed without changing walk acceleration', () => {
  const walk = stepPlayerMotion(createPlayerMotion(), { axis: 1, running: false }, EMPTY_WORLD, 1 / 60);
  const run = stepPlayerMotion(createPlayerMotion(), { axis: 1, running: true }, EMPTY_WORLD, 1 / 60);
  assert.ok(run.targetSpeed > walk.targetSpeed);
  assert.equal(run.acceleration, walk.acceleration);
});

test('grounded players use one jump and consume its buffer', () => {
  const next = stepPlayerMotion(
    createPlayerMotion({ grounded: true }),
    { axis: 0, running: false, jumpPressed: true, jumpHeld: true },
    EMPTY_WORLD,
    1 / 60,
  );

  assert.ok(next.velocityY > 0);
  assert.equal(next.grounded, false);
  assert.equal(next.jumpBuffer, 0);
});

test('coyote time permits one jump after leaving ground', () => {
  const next = stepPlayerMotion(
    createPlayerMotion({ grounded: false, coyote: DEFAULT_MOTION.coyoteSeconds, velocityY: -1 }),
    { axis: 0, running: false, jumpPressed: true, jumpHeld: true },
    EMPTY_WORLD,
    1 / 60,
  );
  assert.ok(next.velocityY > 0);
  assert.equal(next.coyote, 0);
});

test('releasing jump caps upward velocity at the approved cut speed', () => {
  const next = stepPlayerMotion(
    createPlayerMotion({ grounded: false, velocityY: 11 }),
    { axis: 0, running: false, jumpHeld: false },
    EMPTY_WORLD,
    1 / 60,
  );
  assert.ok(next.velocityY <= DEFAULT_MOTION.jumpCutSpeed);
});

test('falling speed is capped', () => {
  const next = stepPlayerMotion(
    createPlayerMotion({ grounded: false, velocityY: -100 }),
    { axis: 0, running: false },
    EMPTY_WORLD,
    1 / 60,
  );
  assert.equal(next.velocityY, -DEFAULT_MOTION.maxFallSpeed);
});

test('landing on a solid restores grounded state', () => {
  const world = { solids: [{ aabb: new AABB(0, -0.5, 0, 8, 1, 2) }] };
  const next = stepPlayerMotion(
    createPlayerMotion({ positionY: 0.01, grounded: false, velocityY: -2 }),
    { axis: 0, running: false },
    world,
    1 / 60,
  );
  assert.equal(next.positionY, 0);
  assert.equal(next.velocityY, 0);
  assert.equal(next.grounded, true);
});
