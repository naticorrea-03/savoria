import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from '../../vendor/three.module.js';
import {
  SHAKE_MAX_OFFSET,
  addTrauma,
  createShake,
  createSquash,
  kickSquash,
  stepShake,
  stepSquash,
} from '../../js/core/motion-math.js';
import { ParticlePool } from '../../js/core/particle-pool.js';

test('screen shake stays capped and decays to rest', () => {
  const shake = createShake();
  addTrauma(shake, 0.8);
  addTrauma(shake, 0.8);
  assert.equal(shake.trauma, 1);
  let peak = 0;
  for (let frame = 0; frame < 120; frame += 1) {
    stepShake(shake, 1 / 60);
    peak = Math.max(peak, Math.abs(shake.x), Math.abs(shake.y));
  }
  assert.ok(peak <= SHAKE_MAX_OFFSET + 1e-9);
  assert.equal(shake.trauma, 0);
  assert.equal(Math.abs(shake.x), 0);
});

test('squash spring overshoots once and settles back to 1', () => {
  const squash = createSquash();
  kickSquash(squash, 0.7);
  let max = 0;
  for (let frame = 0; frame < 90; frame += 1) max = Math.max(max, stepSquash(squash, 1 / 60));
  assert.ok(max > 1, 'landing squash should rebound past rest');
  assert.ok(Math.abs(squash.value - 1) < 0.01);
  kickSquash(squash, 3);
  assert.ok(stepSquash(squash, 1) <= 1.45);
});

test('particle pool reuses a fixed buffer and retires dead particles', () => {
  const pool = new ParticlePool(THREE, 8);
  const buffer = pool.position;
  for (let index = 0; index < 20; index += 1) {
    pool.spawn(0, 0, 0, 1, 2, 0, { life: 0.5, size: 0.3 });
  }
  assert.equal(pool.position, buffer);
  pool.update(0.1);
  assert.equal(pool.active, 8);
  assert.ok(pool.position[1] > 0);
  pool.update(1);
  assert.equal(pool.active, 0);
  assert.ok(pool.alpha.every((alpha) => alpha === 0));
  pool.dispose();
});
