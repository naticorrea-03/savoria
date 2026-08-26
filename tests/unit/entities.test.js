import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../../vendor/three.module.js';
import { updateEntities } from '../../js/gameplay/entities.js';

test('entity updates place the boss phase after projectiles and before particles', () => {
  const projectile = {
    m: { position: new THREE.Vector3(0, 10, 0) },
    v: new THREE.Vector3(),
    life: 2,
  };
  const particle = {
    m: {
      position: new THREE.Vector3(0, 10, 0),
      material: { opacity: 1, transparent: false },
    },
    v: new THREE.Vector3(),
    life: 1,
  };
  const context = {
    player: {
      pos: new THREE.Vector3(100, 100, 0),
      vel: new THREE.Vector3(),
      w: 0.8,
      h: 1.55,
      d: 0.8,
    },
    coins: [],
    items: [],
    enemies: [],
    projectiles: [projectile],
    particles: [particle],
    decoSpins: [],
    solids: [],
    level: { killY: -20 },
    power: null,
    glow: { visible: false },
    invuln: 0,
    elapsed: 0,
  };
  let stateDuringBoss = null;

  updateEntities(context, 0.25, () => {
    stateDuringBoss = {
      projectileLife: projectile.life,
      particleLife: particle.life,
    };
  });

  assert.deepEqual(stateDuringBoss, {
    projectileLife: 1.75,
    particleLife: 1,
  });
  assert.equal(particle.life, 0.75);
});
