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
  remote.push(position(0), 0);
  remote.push(position(10), 100);
  remote.push(position(20), 200);

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
  remote.push(position(4), 0);
  remote.push(position(9), 100);

  local.reset(position(6));
  remote.reset(position(7), 200);

  assert.equal(local.pendingCount, 0);
  assert.deepEqual(local.sample(200), position(6));
  assert.deepEqual(remote.sample(200), position(7));
  assert.equal(remote.sampleCount, 1);
});
