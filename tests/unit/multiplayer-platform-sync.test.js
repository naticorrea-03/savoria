import test from 'node:test';
import assert from 'node:assert/strict';
import { RELEASED_LEVELS, buildReleasedLevel } from '../../js/levels/index.js';
import { createCourseWorld, moverPositionAt } from '../../js/gameplay/course-world.js';
import { createCourseSimulation, stepCourseSimulation } from '../../js/gameplay/course-simulation.js';
import { runCoopSession } from '../helpers/coop-sim.js';

// Issue 26: on 1-2 the floating pasta platform looked different to each player
// and jumps landed differently. Riders and platforms were drawn on three
// different clocks: platform at the last 20 Hz patch, the local player ahead
// by the prediction, the remote player 100 ms behind.
const level = buildReleasedLevel(RELEASED_LEVELS.find(({ id }) => id === '1-2'));
const FLOATING = 1;

const swing = (values) => Math.max(...values) - Math.min(...values);

function riderOffsets(result) {
  const local = [];
  const remote = [];
  for (const sample of result.samples.filter(({ at }) => at > 1500)) {
    const platform = sample.platforms.find(({ id }) => id === `mover-${FLOATING}`).position;
    const [localPlayer, remotePlayer] = [true, false].map((isLocal) => (
      sample.presentation.players.find((player) => player.isLocal === isLocal).position
    ));
    local.push(localPlayer.x - platform.x);
    remote.push(remotePlayer.x - platform.x);
  }
  return { local, remote };
}

test('platform position is the same function on the server and the client', () => {
  const server = createCourseSimulation({ level, seed: 's', players: { a: { characterId: 'fatsio' } } });
  const world = createCourseWorld(level);
  for (let tick = 1; tick <= 600; tick += 1) {
    stepCourseSimulation(server, {}, 1 / 60);
    const [x, y, z] = moverPositionAt(world.movingPlatforms[FLOATING], tick / 60);
    const authoritative = server.movingPlatforms[FLOATING];
    assert.ok(Math.abs(authoritative.positionX - x) < 1e-9);
    assert.ok(Math.abs(authoritative.positionY - y) < 1e-9);
    assert.ok(Math.abs(authoritative.positionZ - z) < 1e-9);
  }
});

for (const latencyMs of [30, 80, 140]) {
  for (const frameHz of [60, 144]) {
    test(`riders stay glued to the floating platform at ${latencyMs} ms and ${frameHz} Hz`, () => {
      const result = runCoopSession({
        level,
        seconds: 12,
        latencyMs,
        frameHz,
        startOnMover: FLOATING,
      });
      const { local, remote } = riderOffsets(result);
      // The platform travels 3.5 units. Before the fix the offset swung by
      // 0.4 (remote) and 0.5 to 0.9 (local) units, about a chef width.
      assert.ok(swing(local) < 0.02, `local rider drifted ${swing(local).toFixed(3)}`);
      assert.ok(swing(remote) < 0.02, `remote rider drifted ${swing(remote).toFixed(3)}`);
      const server = result.server.players.local;
      assert.equal(server.grounded, true);
      const corrections = result.corrections;
      assert.ok(Math.max(...corrections) < 0.1, 'authority never pulls the rider far');
    });
  }
}

// Real rooms deliver patches unevenly and frames hitch. A late or bunched
// patch moves the predicted tick, and every platform with it, by a step or
// two. Measured in two real browsers this slid the local chef about 0.1 units
// on mover-1. The correction now moves with the ground under the rider.
for (const latencyMs of [30, 80, 140]) {
  for (const frameHz of [60, 144]) {
    test(`local rider stays glued through uneven patches at ${latencyMs} ms and ${frameHz} Hz`, () => {
      const result = runCoopSession({
        level,
        seconds: 12,
        latencyMs,
        frameHz,
        startOnMover: FLOATING,
        patchJitterMs: 40,
        hitchEveryMs: 700,
      });
      const { local, remote } = riderOffsets(result);
      assert.ok(swing(local) < 0.02, `local rider drifted ${swing(local).toFixed(3)}`);
      assert.ok(swing(remote) < 0.02, `remote rider drifted ${swing(remote).toFixed(3)}`);
      assert.equal(result.server.players.local.grounded, true);
    });
  }
}

test('prediction agrees with the server while walking back and forth on the platform', () => {
  const result = runCoopSession({
    level,
    seconds: 12,
    latencyMs: 60,
    startOnMover: FLOATING,
    script: (at) => ({ axis: Math.floor(at / 220) % 2 ? -1 : 1 }),
  });
  const mean = result.corrections.reduce((sum, value) => sum + value, 0) / result.corrections.length;
  assert.ok(mean < 0.05, `mean correction ${mean.toFixed(4)}`);
  assert.ok(Math.max(...result.corrections) < 0.3);
});

test('leaving a platform does not carry the prediction with a stale mover id', () => {
  const result = runCoopSession({ level, seconds: 1, latencyMs: 30, startOnMover: FLOATING });
  const prediction = result.runLoop.localPrediction;
  const stale = {
    ...prediction.predicted,
    groundMoverId: `mover-${FLOATING}`,
    x: 20,
    y: 1.5,
    grounded: true,
    velocityY: 0,
  };
  const before = stale.x;
  const next = prediction.simulate(stale, { axis: 0, running: false, jumpPressed: false, jumpHeld: true }, 1 / 60);
  assert.ok(Math.abs(next.x - before) < 1e-9);
});
