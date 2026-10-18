import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from '../../vendor/three.module.js';
import { THEMES } from '../../js/levels/themes.js';
import { CoopFx } from '../../js/multiplayer/coop-fx.js';
import { SessionFx } from '../../js/core/session-fx.js';

const DT = 1 / 60;

function sprite(x, y) {
  const material = new THREE.SpriteMaterial();
  const value = new THREE.Sprite(material);
  value.position.set(x, y, 0);
  return value;
}

function chefVisual(x) {
  const rig = sprite(x, 0);
  rig.userData.config = { height: 1.6 };
  rig.scale.set(1.6, 1.6, 1);
  return {
    rig,
    player: {
      pos: new THREE.Vector3(x, 0, 0),
      vel: new THREE.Vector3(),
      grounded: true,
      facing: 1,
    },
  };
}

function setup({ reduced = false } = {}) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 400);
  camera.position.set(0, 0, 21);
  camera.updateMatrixWorld();
  const sceneState = {
    hazards: [],
    coins: [{ sprite: sprite(5, 1) }, { sprite: sprite(30, 1) }],
    items: [{ sprite: sprite(8, 1), bubble: sprite(8, 1) }],
    enemies: [{ sprite: sprite(12, 0.5) }, { sprite: sprite(40, 0.5) }],
    checkpointFlag: new THREE.Object3D(),
    goalObject: new THREE.Object3D(),
    bossState: null,
  };
  const events = [];
  const fx = new CoopFx({
    THREE,
    scene,
    camera,
    level: { theme: THEMES.pasta },
    sceneState,
    emit: (type, data) => events.push({ type, data }),
    viewport: () => ({ left: 0, top: 0, width: 800, height: 600 }),
  });
  if (reduced) {
    fx.layer.reduced = true;
    fx.layer.amount = 0.4;
  }
  const pops = [];
  const pickupPop = fx.layer.pickupPop.bind(fx.layer);
  fx.layer.pickupPop = (position, color) => {
    pops.push(position.x);
    pickupPop(position, color);
  };
  const visuals = new Map([['me', chefVisual(0)], ['pal', chefVisual(20)]]);
  const players = [
    { sessionId: 'me', playerId: 'me', isLocal: true, hearts: 3, active: true, position: { x: 0, y: 0, z: 0 } },
    { sessionId: 'pal', playerId: 'pal', isLocal: false, hearts: 3, active: true, position: { x: 20, y: 0, z: 0 } },
  ];
  const view = {
    phase: 'playing',
    collectibles: [
      { id: 'tomato-0', kind: 'tomato', position: { x: 5, y: 1, z: 0 }, takenBy: null },
      { id: 'tomato-1', kind: 'tomato', position: { x: 30, y: 1, z: 0 }, takenBy: null },
      { id: 'item-0', kind: 'item', position: { x: 8, y: 1, z: 0 }, takenBy: null },
    ],
    enemies: [
      { id: 'enemy-0', type: 'meatball', position: { x: 12, y: 0, z: 0 }, dead: false },
      { id: 'enemy-1', type: 'flyer', position: { x: 40, y: 0, z: 0 }, dead: false },
    ],
    checkpoint: { active: false, position: { x: 25, y: 1, z: 0 } },
    goal: { position: { x: 60, y: 1, z: 0 }, reachedPlayerIds: [] },
    boss: null,
  };
  const presentation = () => ({ players, local: players[0] });
  const frame = (dt = DT) => fx.update(dt, presentation(), view, visuals);
  const moveLocal = (x, y = 0) => {
    players[0].position = { x, y, z: 0 };
    visuals.get('me').player.pos.set(x, y, 0);
  };
  return { fx, view, players, visuals, frame, moveLocal, pops, events, sceneState };
}

test('a predicted local pickup pops once, before and after the server confirms it', () => {
  const room = setup();
  room.frame();
  room.moveLocal(4.6, 0.6);
  room.frame();
  assert.deepEqual(room.pops, [5], 'pops as soon as the predicted chef touches it');
  assert.equal(room.fx.hidesCollectible('tomato-0'), true);
  room.frame();
  assert.equal(room.pops.length, 1, 'no second pop while waiting for the server');
  room.view.collectibles[0] = { ...room.view.collectibles[0], takenBy: 'me' };
  room.frame();
  room.frame();
  assert.equal(room.pops.length, 1, 'the confirmation is silent');
  assert.equal(room.events.filter(({ data }) => data.type === 'tomato').length, 1);
});

test('a pickup by the other chef pops once from the server patch alone', () => {
  const room = setup();
  room.frame();
  room.view.collectibles[1] = { ...room.view.collectibles[1], takenBy: 'pal' };
  room.frame();
  room.frame();
  assert.deepEqual(room.pops, [30]);
});

test('collectibles taken before this client joined never pop', () => {
  const room = setup();
  room.view.collectibles[1] = { ...room.view.collectibles[1], takenBy: 'pal' };
  room.frame();
  room.frame();
  assert.deepEqual(room.pops, []);
});

test('an unconfirmed prediction shows the collectible again and can pop later', () => {
  const room = setup();
  room.frame();
  room.moveLocal(5, 1);
  room.frame();
  room.moveLocal(-5, 0);
  for (let index = 0; index < 70; index += 1) room.frame();
  assert.equal(room.fx.hidesCollectible('tomato-0'), false);
  room.view.collectibles[0] = { ...room.view.collectibles[0], takenBy: 'pal' };
  room.frame();
  assert.deepEqual(room.pops, [5, 5]);
});

test('only the local chef shakes the screen for hits and stomps', () => {
  const room = setup();
  room.frame();
  room.players[1].hearts = 2;
  room.frame();
  assert.equal(room.fx.shake.trauma, 0, 'remote hit flashes but does not shake');
  assert.ok(room.visuals.get('pal').rig.material.color.r > 1, 'remote hit flashes the remote chef');

  room.view.enemies[1] = { ...room.view.enemies[1], dead: true };
  room.visuals.get('pal').player.pos.set(40, 1, 0);
  room.players[1].position = { x: 40, y: 1, z: 0 };
  room.frame();
  assert.equal(room.fx.shake.trauma, 0, 'remote stomp does not shake');

  room.moveLocal(12, 1);
  room.frame();
  room.view.enemies[0] = { ...room.view.enemies[0], dead: true };
  room.frame(0.001);
  assert.ok(room.fx.shake.trauma > 0.3, 'local stomp shakes');

  const before = room.fx.shake.trauma;
  room.players[0].hearts = 2;
  room.frame(0.001);
  assert.ok(room.fx.shake.trauma > before, 'local hit shakes');
});

test('both chefs squash on landing and stretch on a jump', () => {
  const room = setup();
  room.frame();
  for (const id of ['me', 'pal']) {
    const body = room.visuals.get(id).player;
    body.grounded = false;
    body.vel.y = 12;
  }
  room.frame();
  room.frame();
  for (const id of ['me', 'pal']) {
    const rig = room.visuals.get(id).rig;
    assert.ok(rig.scale.y > 1.6, `${id} stretches on the jump`);
  }
  for (const id of ['me', 'pal']) {
    const body = room.visuals.get(id).player;
    body.vel.y = -24;
  }
  room.frame();
  for (const id of ['me', 'pal']) {
    const body = room.visuals.get(id).player;
    body.grounded = true;
    body.vel.y = 0;
  }
  room.frame();
  for (const id of ['me', 'pal']) {
    const rig = room.visuals.get(id).rig;
    assert.ok(rig.scale.y < 1.6, `${id} squashes on landing`);
  }
  assert.ok(room.fx.pool.active > 0, 'landing dust is in the pool');
});

test('checkpoint confetti fires once when the server activates it', () => {
  const room = setup();
  room.frame();
  const before = room.fx.pool.active;
  room.view.checkpoint = { ...room.view.checkpoint, active: true };
  room.frame(0.001);
  const after = room.fx.pool.active;
  assert.ok(after - before >= 40);
  room.frame(0.001);
  assert.ok(room.fx.pool.active - after < 10, 'no second burst');
  assert.equal(room.fx.layer.flag, room.sceneState.checkpointFlag);
});

test('effects never write room state and keep one fixed particle buffer', () => {
  const room = setup();
  const deepFreeze = (value) => {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
      Object.freeze(value);
      for (const child of Object.values(value)) deepFreeze(child);
    }
    return value;
  };
  room.moveLocal(5, 1);
  room.players[1].hearts = 1;
  deepFreeze(room.view);
  deepFreeze(room.players);
  const buffer = room.fx.pool.position;
  for (let index = 0; index < 600; index += 1) room.frame();
  assert.equal(room.pops.length, 1, 'the predicted pickup ran against frozen state');
  assert.equal(room.fx.pool.position, buffer);
  assert.equal(room.fx.pool.capacity, 640);
});

test('reduced motion keeps the screen still and skips squash', () => {
  const room = setup({ reduced: true });
  room.frame();
  room.moveLocal(12, 1);
  room.frame();
  room.view.enemies[0] = { ...room.view.enemies[0], dead: true };
  room.players[0].hearts = 1;
  room.frame();
  assert.equal(room.fx.shake.trauma, 0);
  assert.equal(room.visuals.get('me').rig.scale.y, 1.6);
  assert.equal(room.events.length, 0, 'no flying tomatoes');
});

test('solo and co-op share one effects layer', () => {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 400);
  const rig = sprite(0, 0);
  rig.userData.config = { height: 1.6 };
  const session = {
    THREE,
    scene,
    camera,
    level: { theme: THEMES.pasta, checkpoint: null },
    hazards: [],
    coins: [],
    enemies: [],
    rig,
    player: { pos: new THREE.Vector3(), vel: new THREE.Vector3(), grounded: true, facing: 1 },
    hearts: 3,
    passedCheckpoint: false,
    doorCooldown: 0,
    bossState: null,
    emit() {},
  };
  const solo = new SessionFx({ THREE, session });
  const coop = setup().fx;
  assert.equal(solo.layer.constructor, coop.layer.constructor);
  session.hearts = 2;
  solo.update(DT);
  assert.ok(solo.shake.trauma > 0, 'solo hit still shakes');
  solo.dispose();
});
