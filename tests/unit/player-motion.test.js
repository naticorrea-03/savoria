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
    turnAcceleration: 96,
    gravity: 30,
    fallGravityMultiplier: 1.35,
    apexSpeedThreshold: 2.4,
    apexGravityMultiplier: 0.5,
    jumpSpeed: 12.5,
    jumpCutSpeed: 6.5,
    coyoteSeconds: 0.12,
    jumpBufferSeconds: 0.13,
    airJumps: 1,
    maxFallSpeed: 26,
  });
});

test('airborne players get one extra jump but cannot jump a third time', () => {
  const airborne = createPlayerMotion({
    grounded: false,
    coyote: 0,
    velocityY: -2,
    airJumpsRemaining: 1,
  });
  const doubleJump = stepPlayerMotion(
    airborne,
    { axis: 0, running: false, jumpPressed: true, jumpHeld: true },
    EMPTY_WORLD,
    1 / 60,
  );
  const thirdAttempt = stepPlayerMotion(
    doubleJump,
    { axis: 0, running: false, jumpPressed: true, jumpHeld: true },
    EMPTY_WORLD,
    1 / 60,
  );

  assert.ok(doubleJump.velocityY > 0);
  assert.equal(doubleJump.airJumpsRemaining, 0);
  assert.ok(thirdAttempt.velocityY < doubleJump.velocityY);
  assert.equal(thirdAttempt.airJumpsRemaining, 0);
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
  assert.equal(next.airJumpsRemaining, 1);
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
  assert.equal(next.airJumpsRemaining, 1);
});

test('ground movement steps onto a half-unit terrain rise without stopping', () => {
  const world = { solids: [{ aabb: new AABB(0.8, 0, 0, 0.6, 1, 2) }] };
  const next = stepPlayerMotion(
    createPlayerMotion({
      positionX: 0.05,
      positionY: 0,
      velocityX: DEFAULT_MOTION.walkSpeed,
      grounded: true,
    }),
    { axis: 1, running: false },
    world,
    1 / 60,
  );

  assert.equal(next.positionY, 0.5);
  assert.ok(next.positionX > 0.05);
  assert.ok(next.velocityX > 0);
});

const LEGACY_FEEL = Object.freeze({
  fallGravityMultiplier: 1,
  apexGravityMultiplier: 1,
  turnAcceleration: DEFAULT_MOTION.acceleration,
});

test('falling pulls harder than rising so landings feel decisive', () => {
  const rising = stepPlayerMotion(
    createPlayerMotion({ grounded: false, velocityY: 9 }),
    { axis: 0, jumpHeld: true },
    EMPTY_WORLD,
    1 / 60,
  );
  const falling = stepPlayerMotion(
    createPlayerMotion({ grounded: false, velocityY: -9 }),
    { axis: 0, jumpHeld: true },
    EMPTY_WORLD,
    1 / 60,
  );
  const riseLoss = 9 - rising.velocityY;
  const fallGain = -9 - falling.velocityY;
  assert.ok(Math.abs(riseLoss - DEFAULT_MOTION.gravity / 60) < 1e-9);
  assert.ok(Math.abs(fallGain - (DEFAULT_MOTION.gravity * DEFAULT_MOTION.fallGravityMultiplier) / 60) < 1e-9);
});

test('a held jump hangs near the top and a released jump does not', () => {
  const near = { grounded: false, velocityY: DEFAULT_MOTION.apexSpeedThreshold - 0.5 };
  const held = stepPlayerMotion(createPlayerMotion(near), { jumpHeld: true }, EMPTY_WORLD, 1 / 60);
  const released = stepPlayerMotion(createPlayerMotion(near), { jumpHeld: false }, EMPTY_WORLD, 1 / 60);
  const heldLoss = near.velocityY - held.velocityY;
  const releasedLoss = near.velocityY - released.velocityY;
  assert.ok(Math.abs(heldLoss - (DEFAULT_MOTION.gravity * DEFAULT_MOTION.apexGravityMultiplier) / 60) < 1e-9);
  assert.ok(releasedLoss > heldLoss);
});

test('reversing direction on the ground turns faster than speeding up', () => {
  const start = createPlayerMotion({ grounded: true, velocityX: 5 });
  const turn = stepPlayerMotion(start, { axis: -1 }, EMPTY_WORLD, 1 / 60);
  const speedUp = stepPlayerMotion(
    createPlayerMotion({ grounded: true, velocityX: -5 }),
    { axis: -1 },
    EMPTY_WORLD,
    1 / 60,
  );
  assert.ok(5 - turn.velocityX > Math.abs(-5 - speedUp.velocityX));
  assert.ok(Math.abs((5 - turn.velocityX) - DEFAULT_MOTION.turnAcceleration / 60) < 1e-9);
});

function jumpReach(motion, running, rise) {
  // Local copy of the helper arc so this test stays self-contained.
  const ground = { solids: [{ aabb: new AABB(0, -2.5, 0, 2000, 5, 10) }] };
  let state = createPlayerMotion({ grounded: true });
  for (let frame = 0; frame < 180; frame += 1) {
    state = stepPlayerMotion(state, { axis: 1, running, jumpHeld: true }, ground, 1 / 60, motion);
  }
  const takeoff = state.positionX;
  let previous = state;
  for (let frame = 0; frame < 300; frame += 1) {
    state = stepPlayerMotion(
      state,
      { axis: 1, running, jumpPressed: frame === 0, jumpHeld: true },
      EMPTY_WORLD,
      1 / 60,
      motion,
    );
    if (state.velocityY <= 0 && previous.positionY >= rise && state.positionY <= rise) {
      return state.positionX - takeoff;
    }
    previous = state;
  }
  return 0;
}

test('the new feel never shortens a jump that levels already require', () => {
  for (const running of [false, true]) {
    for (const rise of [-2, 0, 0.8, 1.5]) {
      const legacy = jumpReach({ ...DEFAULT_MOTION, ...LEGACY_FEEL }, running, rise);
      const current = jumpReach(DEFAULT_MOTION, running, rise);
      assert.ok(
        current >= legacy - 0.1,
        `running=${running} rise=${rise}: ${current.toFixed(2)} < ${legacy.toFixed(2)}`,
      );
    }
  }
  assert.ok(jumpReach(DEFAULT_MOTION, true, 0) > jumpReach({ ...DEFAULT_MOTION, ...LEGACY_FEEL }, true, 0));
});
