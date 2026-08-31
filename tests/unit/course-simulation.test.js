import test from 'node:test';
import assert from 'node:assert/strict';
import { createFreshSave, recordCompletion } from '../../js/ui/save-store.js';
import { RELEASED_LEVELS, buildReleasedLevel } from '../../js/levels/index.js';
import * as gameplay from '../../js/gameplay/course-simulation.js';

function fixtureLevel(overrides = {}) {
  return {
    id: 'test-course',
    spawn: [0, 1, 0],
    boxes: [[0, -0.5, 0, 30, 1, 4, 'ground']],
    movers: [],
    hazards: [],
    coins: [],
    items: [],
    enemies: [{ t: 'meatball', p: [6, 0.4, 0], range: 3 }],
    checkpoint: null,
    goal: null,
    boss: null,
    killY: -9,
    time: 240,
    ...overrides,
  };
}

test('the same seed and inputs produce the same gameplay snapshot', () => {
  const options = {
    level: fixtureLevel(),
    seed: 'room-ABC123',
    players: [{ playerId: 'p1', characterId: 'fatsio' }],
  };
  const first = gameplay.createCourseSimulation(options);
  const second = gameplay.createCourseSimulation(options);
  const otherSeed = gameplay.createCourseSimulation({ ...options, seed: 'room-XYZ789' });

  assert.notEqual(first.enemies[0].phase, otherSeed.enemies[0].phase);

  for (let tick = 0; tick < 300; tick += 1) {
    const inputs = { p1: { axis: tick < 120 ? 1 : 0, jumpHeld: false } };
    gameplay.stepCourseSimulation(first, inputs, 1 / 60);
    gameplay.stepCourseSimulation(second, inputs, 1 / 60);
  }

  assert.deepEqual(
    gameplay.createCourseSnapshot(first),
    gameplay.createCourseSnapshot(second),
  );
});

test('moving platforms keep their compiled collider and carry a standing player', () => {
  const state = gameplay.createCourseSimulation({
    level: fixtureLevel({
      spawn: [0, 0.5, 0],
      boxes: [],
      enemies: [],
      movers: [{
        box: [0, 0, 0, 4, 1, 4, 'plat'],
        to: [6, 0, 0],
        period: 2,
        phase: 0,
      }],
    }),
    seed: 1,
    players: [{ playerId: 'p1', characterId: 'fatsio' }],
  });

  for (let tick = 0; tick < 30; tick += 1) {
    gameplay.stepCourseSimulation(state, { p1: {} }, 1 / 60);
  }

  assert.equal(state.movingPlatforms.length, 1);
  assert.ok(Math.abs(state.movingPlatforms[0].positionX - 3) < 1e-9);
  assert.ok(state.players.p1.positionX > 2.8);
  assert.equal(state.players.p1.grounded, true);
});

test('a checkpoint becomes shared and supplies the next individual respawn', () => {
  const state = gameplay.createCourseSimulation({
    level: fixtureLevel({ checkpoint: [2, 0, 0], enemies: [] }),
    seed: 2,
    players: [
      { playerId: 'p1', characterId: 'fatsio' },
      { playerId: 'p2', characterId: 'chefno' },
    ],
  });

  gameplay.stepCourseSimulation(state, { p1: {}, p2: {} }, 1 / 60);
  assert.equal(state.checkpoint.active, true);
  assert.equal(state.checkpoint.activatedBy, 'p1');

  state.players.p2.positionY = -10;
  gameplay.stepCourseSimulation(state, { p1: {}, p2: {} }, 1 / 60);

  assert.equal(state.players.p2.positionX, 2);
  assert.equal(state.players.p2.positionY, 1);
  assert.equal(state.players.p2.lives, 3);
  assert.equal(state.phase, 'playing');
});

test('the first player at the goal waits safely until every player arrives', () => {
  const state = gameplay.createCourseSimulation({
    level: fixtureLevel({ goal: [10, 0, 0], enemies: [] }),
    seed: 3,
    players: [
      { playerId: 'p1', characterId: 'fatsio' },
      { playerId: 'p2', characterId: 'chefno' },
    ],
  });
  state.players.p1.positionX = 10;
  state.players.p1.positionY = 0;

  gameplay.stepCourseSimulation(state, { p1: {}, p2: {} }, 1 / 60);
  assert.equal(state.phase, 'playing');
  assert.equal(state.players.p1.safe, true);
  assert.deepEqual(state.goal.reachedPlayerIds, ['p1']);

  state.players.p2.positionX = 10;
  state.players.p2.positionY = 0;
  gameplay.stepCourseSimulation(state, { p2: {} }, 1 / 60);

  assert.equal(state.phase, 'completed');
  assert.equal(state.players.p2.safe, true);
  assert.deepEqual(state.goal.reachedPlayerIds, ['p1', 'p2']);
});

test('a hazard taking either player\'s final life fails the whole team', () => {
  const state = gameplay.createCourseSimulation({
    level: fixtureLevel({
      spawn: [0, 0, 0],
      enemies: [],
      hazards: [[0, -0.1, 0, 4, 4]],
    }),
    seed: 4,
    players: [
      { playerId: 'p1', characterId: 'fatsio' },
      { playerId: 'p2', characterId: 'chefno' },
    ],
  });
  state.players.p1.lives = 1;

  gameplay.stepCourseSimulation(state, { p1: {}, p2: {} }, 1 / 60);

  assert.equal(state.hazards.length, 1);
  assert.equal('mesh' in state.hazards[0], false);
  assert.equal(state.phase, 'failed');
  assert.equal(state.failedPlayerId, 'p1');
  assert.equal(state.players.p2.active, true);
});

test('respawn immunity prevents an overlapping hazard from draining another life', () => {
  const state = gameplay.createCourseSimulation({
    level: fixtureLevel({
      spawn: [0, -0.6, 0],
      boxes: [],
      enemies: [],
      hazards: [[0, 0, 0, 4, 4]],
      killY: -100,
    }),
    seed: 41,
    players: [{ playerId: 'p1', characterId: 'fatsio' }],
  });

  gameplay.stepCourseSimulation(state, { p1: {} }, 1 / 60);
  assert.equal(state.players.p1.lives, 3);
  assert.equal(state.players.p1.invulnerabilitySeconds, 2);

  gameplay.stepCourseSimulation(state, { p1: {} }, 1 / 60);
  assert.equal(state.players.p1.lives, 3);
  assert.ok(Math.abs(state.players.p1.invulnerabilitySeconds - (2 - 1 / 60)) < 1e-9);
  assert.equal(state.phase, 'playing');
});

test('shared time expiring produces one deterministic team failure', () => {
  const state = gameplay.createCourseSimulation({
    level: fixtureLevel({ time: 1 / 30, enemies: [] }),
    seed: 42,
    players: [
      { playerId: 'p1', characterId: 'fatsio' },
      { playerId: 'p2', characterId: 'chefno' },
    ],
  });

  gameplay.stepCourseSimulation(state, { p1: {}, p2: {} }, 1 / 60);
  assert.equal(state.phase, 'playing');

  gameplay.stepCourseSimulation(state, { p1: {}, p2: {} }, 1 / 60);
  const failed = gameplay.createCourseSnapshot(state);
  assert.equal(failed.phase, 'failed');
  assert.equal(failed.failureReason, 'timeout');
  assert.equal(failed.failedPlayerId, null);
  assert.equal(failed.timer, 0);

  gameplay.stepCourseSimulation(state, { p1: { axis: 1 } }, 1);
  assert.deepEqual(gameplay.createCourseSnapshot(state), failed);
});

test('a compiled tomato is represented plainly and consumed once', () => {
  const state = gameplay.createCourseSimulation({
    level: fixtureLevel({
      spawn: [1, 0, 0],
      enemies: [],
      coins: [[1, 0, 0]],
    }),
    seed: 5,
    players: [{ playerId: 'p1', characterId: 'fatsio' }],
  });

  gameplay.stepCourseSimulation(state, { p1: {} }, 1 / 60);
  gameplay.stepCourseSimulation(state, { p1: {} }, 1 / 60);

  assert.equal(state.collectibles.length, 1);
  assert.equal(state.collectibles[0].kind, 'tomato');
  assert.equal(state.collectibles[0].takenBy, 'p1');
  assert.equal('sprite' in state.collectibles[0], false);
  assert.equal(state.tomatoCount, 1);
});

test('a shooter targets the nearest active player with a plain projectile', () => {
  const state = gameplay.createCourseSimulation({
    level: fixtureLevel({
      spawn: [0, 0, 0],
      enemies: [{ t: 'shooter', p: [5, 0.4, 0] }],
    }),
    seed: 6,
    players: [
      { playerId: 'p1', characterId: 'fatsio' },
      { playerId: 'p2', characterId: 'chefno' },
    ],
  });
  state.players.p2.positionX = 8;

  for (let tick = 0; tick < 91; tick += 1) {
    gameplay.stepCourseSimulation(state, { p1: {}, p2: {} }, 1 / 60);
  }

  assert.equal(state.projectiles.length, 1);
  assert.equal(state.projectiles[0].targetPlayerId, 'p2');
  assert.equal('mesh' in state.projectiles[0], false);
  assert.ok(state.projectiles[0].velocityX > 0);
});

test('boss targeting and attack phases are plain deterministic decisions', () => {
  const state = gameplay.createCourseSimulation({
    level: fixtureLevel({
      spawn: [0, 0, 0],
      enemies: [],
      boss: {
        p: [5, 2.4, 0],
        hp: 3,
        arena: [5, 0, 0, 20, 10],
      },
    }),
    seed: 7,
    players: [
      { playerId: 'p1', characterId: 'fatsio' },
      { playerId: 'p2', characterId: 'chefno' },
    ],
  });
  state.players.p2.positionX = 4;

  for (let tick = 0; tick < 75; tick += 1) {
    gameplay.stepCourseSimulation(state, { p1: {}, p2: {} }, 1 / 60);
  }

  assert.equal(state.boss.awake, true);
  assert.equal(state.boss.mode, 'telegraph');
  assert.equal(state.boss.targetPlayerId, 'p2');
  assert.equal(state.boss.chargeDirection, -1);
  assert.equal('sprite' in state.boss, false);
  assert.equal('ring' in state.boss, false);
});

test('a shared completion remains compatible with monotonic campaign saves', () => {
  const state = gameplay.createCourseSimulation({
    level: fixtureLevel({ id: '1-1', goal: [0, 0, 0], enemies: [] }),
    seed: 8,
    players: [{ playerId: 'p1', characterId: 'fatsio' }],
  });
  gameplay.stepCourseSimulation(state, { p1: {} }, 1 / 60);
  const snapshot = gameplay.createCourseSnapshot(state);
  const previous = recordCompletion(createFreshSave(), '1-1', 3, 2);
  const next = recordCompletion(previous, snapshot.completion.levelId, 2, 2);

  assert.equal(snapshot.phase, 'completed');
  assert.equal(next.best['1-1'], 3);
  assert.equal(next.unlocked, 2);
});

test('all four released courses simulate and serialize under Node', () => {
  assert.deepEqual(RELEASED_LEVELS.map(({ id }) => id), ['1-1', '1-2', '2-1', '2-2']);
  for (const definition of RELEASED_LEVELS) {
    const level = buildReleasedLevel(definition);
    const state = gameplay.createCourseSimulation({
      level,
      seed: definition.id,
      players: [
        { playerId: 'p1', characterId: 'fatsio' },
        { playerId: 'p2', characterId: 'chefno' },
      ],
    });

    gameplay.stepCourseSimulation(state, { p1: {}, p2: {} }, 1 / 60);
    const snapshot = gameplay.createCourseSnapshot(state);
    assert.equal(snapshot.tick, 1, definition.id);
    assert.doesNotThrow(() => JSON.stringify(snapshot), definition.id);
  }
});
