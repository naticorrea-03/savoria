import test from 'node:test';
import assert from 'node:assert/strict';
import { INITIAL_HEARTS } from '../../js/core/game-session.js';
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
    checkpoint: [72.6, 0.7, 0],
    goal: [121.6, 1, 0],
    length: 126.6,
    coins: 39,
    initialHearts: 3,
    initialTimer: 260,
  });

  assert.deepEqual(snapshotLevel(RELEASED_LEVELS[1]), {
    id: '1-2',
    spawn: [2, 4, 0],
    checkpoint: [62, 3.5, 0],
    goal: [142.8, 3, 0],
    length: 147.8,
    coins: 29,
    initialHearts: 3,
    initialTimer: 280,
  });
});
