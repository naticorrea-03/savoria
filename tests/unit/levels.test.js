import test from 'node:test';
import assert from 'node:assert/strict';
import { sfx } from '../../js/audio/sfx.js';
import { GameSession, INITIAL_HEARTS } from '../../js/core/game-session.js';
import { RELEASED_LEVELS, RELEASED_WORLDS, buildReleasedLevel } from '../../js/levels/index.js';
import { validateLevelDefinition } from '../../js/levels/validate.js';

function snapshotLevel(definition) {
  const level = buildReleasedLevel(definition);
  return {
    id: level.id,
    spawn: level.spawn,
    checkpoint: level.checkpoint,
    goal: level.goal,
    length: level.length,
    coins: level.coins.length,
    initialHearts: INITIAL_HEARTS,
    initialTimer: level.time,
  };
}

test('release exposes only two World 1 levels', () => {
  assert.deepEqual(RELEASED_WORLDS.map((world) => world.n), [1]);
  assert.deepEqual(RELEASED_LEVELS.map((level) => level.id), ['1-1', '1-2']);
});

test('every released level validates and compiles to a goal', () => {
  for (const definition of RELEASED_LEVELS) {
    assert.deepEqual(validateLevelDefinition(definition), []);
    const level = buildReleasedLevel(definition);
    assert.ok(level.length > 40);
    assert.ok(level.goal);
    assert.ok(level.spawn);
  }
});

test('World 1 generated data stays at the approved gameplay baseline', () => {
  assert.deepEqual(snapshotLevel(RELEASED_LEVELS[0]), {
    id: '1-1',
    spawn: [2, 4, 0],
    checkpoint: [56.1, 0.2, 0],
    goal: [96.1, 0, 0],
    length: 101.1,
    coins: 24,
    initialHearts: 3,
    initialTimer: 240,
  });

  assert.deepEqual(snapshotLevel(RELEASED_LEVELS[1]), {
    id: '1-2',
    spawn: [2, 4, 0],
    checkpoint: [69.5, 4.4, 0],
    goal: [143.6, 6.5, 0],
    length: 148.6,
    coins: 33,
    initialHearts: 3,
    initialTimer: 280,
  });
});

test('checkpoint activation mutates the owned material instead of replacing it', () => {
  let activatedColor = null;
  const material = {
    color: {
      set(color) {
        activatedColor = color;
      },
    },
  };
  const session = {
    player: {
      pos: {
        x: 10,
        y: 2,
      },
    },
    level: { checkpoint: [10, 2, 0] },
    passedCheckpoint: false,
    checkpointFlag: { material },
    goalObject: null,
    emit() {},
  };
  const originalPower = sfx.power;
  sfx.power = () => {};

  try {
    GameSession.prototype.updateCheckpointAndGoal.call(session, 1 / 60);
  } finally {
    sfx.power = originalPower;
  }

  assert.equal(session.checkpointFlag.material, material);
  assert.equal(activatedColor, 0xf2c14e);
  assert.equal(session.passedCheckpoint, true);
});
