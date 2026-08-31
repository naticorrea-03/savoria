import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LOCAL_CORRECTION_MS,
  REMOTE_INTERPOLATION_MS,
  LocalPrediction,
  RemoteInterpolation,
} from '../../js/multiplayer/netcode.js';

const position = (x, y = 0, z = 0) => ({ x, y, z });
const input = (axis = 1) => ({
  axis,
  running: false,
  jumpPressed: false,
  jumpHeld: false,
});

test('remote players render one hundred milliseconds behind authority', () => {
  const remote = new RemoteInterpolation();
  remote.push(position(0), 1, 0);
  remote.push(position(10), 2, 100);
  remote.push(position(20), 3, 200);

  assert.equal(REMOTE_INTERPOLATION_MS, 100);
  assert.deepEqual(remote.sample(150), position(5));
  assert.deepEqual(remote.sample(250), position(15));
});

test('local input predicts movement immediately before authority replies', () => {
  const local = new LocalPrediction({
    initial: position(0),
    simulate: (current, controls, seconds) => position(current.x + controls.axis * seconds * 10),
  });

  const predicted = local.applyInput(1, input(1), 0.1, 20);

  assert.deepEqual(predicted, position(1));
  assert.deepEqual(local.sample(20), position(1));
  assert.equal(local.pendingCount, 1);
});

test('local authoritative corrections smooth for sixty-five milliseconds', () => {
  const local = new LocalPrediction({
    initial: position(0),
    simulate: (current, controls, seconds) => position(current.x + controls.axis * seconds * 10),
  });
  local.applyInput(1, input(1), 0.1, 0);

  local.reconcile(position(0.4), 1, { now: 100 });

  assert.equal(LOCAL_CORRECTION_MS, 65);
  assert.deepEqual(local.sample(100), position(1));
  assert.ok(Math.abs(local.sample(132.5).x - 0.7) < 0.0001);
  assert.deepEqual(local.sample(165), position(0.4));
});

test('continuous input advances simulation while an active correction keeps blending', () => {
  const local = new LocalPrediction({
    initial: position(0),
    simulate: (current, controls, seconds) => position(current.x + controls.axis * seconds * 10),
  });
  local.applyInput(1, input(1), 0.1, 0);
  local.reconcile(position(0.4), 1, { now: 100 });

  const presented = local.applyInput(2, input(1), 0.1, 120);

  assert.ok(Math.abs(presented.x - 1.8153846154) < 0.0001);
  assert.ok(Math.abs(local.sample(132.5).x - 1.7) < 0.0001);
  assert.deepEqual(local.sample(165), position(1.4));
  assert.equal(local.pendingCount, 1);
});

test('respawns, doors, and checkpoints snap without smoothing', () => {
  for (const reason of ['respawn', 'door', 'checkpoint']) {
    const local = new LocalPrediction({
      initial: position(8),
      simulate: (current) => current,
    });
    local.applyInput(1, input(1), 0.1, 0);

    local.reconcile(position(2), 1, { now: 50, reason });

    assert.deepEqual(local.sample(50), position(2), reason);
    assert.equal(local.pendingCount, 0, reason);
  }
});

test('reconnect reset drops stale local and remote prediction history', () => {
  const local = new LocalPrediction({
    initial: position(0),
    simulate: (current) => position(current.x + 1),
  });
  const remote = new RemoteInterpolation();
  local.applyInput(1, input(), 1 / 60, 0);
  remote.push(position(4), 1, 0);
  remote.push(position(9), 2, 100);

  local.reset(position(6));
  remote.reset(position(7), 3, 200);

  assert.equal(local.pendingCount, 0);
  assert.deepEqual(local.sample(200), position(6));
  assert.deepEqual(remote.sample(200), position(7));
  assert.equal(remote.sampleCount, 1);
});

test('remote interpolation rejects reordered and duplicate authoritative ticks', () => {
  const remote = new RemoteInterpolation();

  assert.equal(remote.push(position(0), 10, 0), true);
  assert.equal(remote.push(position(20), 12, 100), true);
  assert.equal(remote.push(position(99), 11, 120), false);
  assert.equal(remote.push(position(88), 12, 130), false);

  assert.equal(remote.sampleCount, 2);
  assert.deepEqual(remote.sample(150), position(10));
});

test('a 150 ms RTT network harness preserves immediate prediction through delay, reordering, and reconnect', () => {
  const local = new LocalPrediction({
    initial: position(0),
    simulate: (current, controls, seconds) => position(current.x + controls.axis * seconds * 10),
  });
  const remote = new RemoteInterpolation();
  const patchIntervalMs = 50;

  // The local response happens at input time, before the first 20 Hz patch.
  assert.deepEqual(local.applyInput(1, input(1), 0.1, 0), position(1));
  assert.ok(0 < patchIntervalMs);
  assert.deepEqual(local.applyInput(2, input(1), 0.1, 25), position(2));

  // A delayed first acknowledgement arrives after one 150 ms round trip.
  local.reconcile(position(1), 1, { now: 150 });
  assert.equal(local.pendingCount, 1);
  assert.ok(local.sample(150).x > 1);
  assert.deepEqual(local.sample(215), position(2));

  // A newer patch wins when an earlier snapshot is delayed and reordered.
  assert.equal(remote.push(position(0), 10, 75), true);
  assert.equal(remote.push(position(3), 12, 125), true);
  assert.equal(remote.push(position(2), 11, 150), false);
  assert.deepEqual(remote.sample(225), position(3));

  // A dropped client discards prediction history, then starts cleanly on reconnect.
  local.reset(position(3));
  remote.reset(position(6), 13, 225);
  assert.equal(local.pendingCount, 0);
  assert.deepEqual(local.sample(225), position(3));
  assert.deepEqual(remote.sample(225), position(6));

  // The late second acknowledgement has no visible residual after 65 ms.
  local.applyInput(3, input(-1), 0.1, 250);
  local.reconcile(position(2), 3, { now: 400 });
  assert.deepEqual(local.sample(465), position(2));
});
