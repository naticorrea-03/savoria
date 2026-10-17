import test from 'node:test';
import assert from 'node:assert/strict';
import { CAMERA_TUNING, CameraFollow } from '../../js/core/camera-follow.js';

const STEP = 1 / 60;

function run(camera, frames, frame) {
  for (let index = 0; index < frames; index += 1) camera.update(frame(index));
  return camera;
}

test('the first update snaps onto the player instead of sweeping from the origin', () => {
  const camera = new CameraFollow().update({ x: 40, y: 2, dt: STEP, minX: 9, maxX: 200 });
  assert.ok(Math.abs(camera.x - (40 + CAMERA_TUNING.idleLook)) < 1e-9);
  assert.equal(camera.y, 2 + CAMERA_TUNING.heightAbovePlayer);
});

test('the camera leans toward the direction of travel and eases back', () => {
  const camera = new CameraFollow().snap(20, 1, 1);
  run(camera, 120, () => ({ x: 20, y: 1, velocityX: 10, facing: 1, dt: STEP }));
  const running = camera.lookAhead;
  assert.ok(running > 2.5 && running <= CAMERA_TUNING.maxLook);
  run(camera, 30, () => ({ x: 20, y: 1, velocityX: -10, facing: -1, dt: STEP }));
  assert.ok(camera.lookAhead < running, 'turning moves the lean gradually');
  assert.ok(camera.lookAhead > -running, 'and does not flip in a single frame');
});

test('a normal jump does not move the camera vertically', () => {
  const camera = new CameraFollow().snap(10, 1, 1);
  const restingY = camera.y;
  let peakShift = 0;
  run(camera, 50, (index) => {
    const height = 1 + 2.6 * Math.sin((index / 49) * Math.PI);
    peakShift = Math.max(peakShift, Math.abs(camera.y - restingY));
    return { x: 10, y: height, grounded: false, dt: STEP };
  });
  assert.ok(peakShift < 0.45, `camera moved ${peakShift.toFixed(2)} during a jump`);
});

test('climbing past the window and falling both pull the camera along', () => {
  const camera = new CameraFollow().snap(10, 1, 1);
  run(camera, 90, () => ({ x: 10, y: 9, grounded: false, dt: STEP }));
  assert.ok(camera.y > 9 + CAMERA_TUNING.heightAbovePlayer - 2.6);
  const high = camera.y;
  run(camera, 90, () => ({ x: 10, y: 1, grounded: false, dt: STEP }));
  assert.ok(camera.y < high - 4);
});

test('landing on a higher ledge eases the camera up over several frames', () => {
  const camera = new CameraFollow().snap(10, 1, 1);
  camera.update({ x: 10, y: 4, grounded: true, dt: STEP });
  assert.ok(camera.y < 4 + CAMERA_TUNING.heightAbovePlayer - 1);
  run(camera, 120, () => ({ x: 10, y: 4, grounded: true, dt: STEP }));
  assert.ok(Math.abs(camera.y - (4 + CAMERA_TUNING.heightAbovePlayer)) < 0.05);
});

test('smoothing takes the same real time at 60 and 144 frames per second', () => {
  const at = (hz) => {
    const camera = new CameraFollow().snap(10, 1, 1);
    run(camera, hz / 4, () => ({ x: 14, y: 1, facing: 1, dt: 1 / hz }));
    return camera.x;
  };
  assert.ok(Math.abs(at(60) - at(144)) < 0.02);
});

test('a respawn far away snaps and the level edges clamp the target', () => {
  const camera = new CameraFollow().snap(100, 1, 1);
  camera.update({ x: 5, y: 1, dt: STEP, minX: 9, maxX: 200 });
  assert.equal(camera.x, 9);
  const edge = new CameraFollow().snap(50, 1, 1);
  run(edge, 600, () => ({ x: 199, y: 1, velocityX: 10, dt: STEP, minX: 9, maxX: 191 }));
  assert.ok(edge.x <= 191);
});
